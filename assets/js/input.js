// 输入体验：清除按钮、搜索按钮可用态、联想列表与键盘/鼠标交互。
// 契约 §5.5/§5.6/§12.2：历史只由 app.js 写；本地联想先渲染，联网结果回来合并；关闭开关零第三方请求。
// 经典脚本：只注册 SS.input，顶层不碰 DOM，由 app.js 在 DOMContentLoaded 后调用 init()。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const DEBOUNCE_MS = 140
  const BLUR_CLOSE_MS = 160
  const OPTION_ID_PREFIX = 'suggest-option-'
  const DEFAULT_ENGINE_SEARCH = 'https://www.bing.com/search?q='
  const KEY_SLASH = '/'

  const SITE_MAX = 3
  const REMOTE_MAX = 5
  const HISTORY_MAX = 2
  const TOTAL_MAX = 8
  const LOCAL_ITEM_CAP = 24
  const REMOTE_WORD_MAX_LENGTH = 100

  function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, ' ')
  }

  function optionId(index) {
    return OPTION_ID_PREFIX + index
  }

  let initialized = false

  function init() {
    if (initialized) return
    const doc = root.document
    if (!doc) return

    const $ = (id) => doc.getElementById(id)

    const input = $('search-input')
    if (!input) return

    const form = $('search-form')
    const clearButton = $('clear-button')
    const submitButton = $('search-submit')
    const list = $('suggest-list')
    const remoteToggle = $('suggest-source-toggle')
    const historyCount = $('history-count')
    const historyClear = $('history-clear')

    let items = []
    let activeIndex = -1
    let lastRenderedValue = null
    let debounceTimer = 0
    let blurTimer = 0
    let composing = false
    let remoteToken = 0
    let remoteController = null
    let lastRemoteWords = []

    // ------------------------------------------------------------ 状态同步

    function syncFieldState() {
      const value = input.value
      if (clearButton) clearButton.hidden = value.length === 0
      if (submitButton) {
        if (normalize(value) === '') submitButton.setAttribute('aria-disabled', 'true')
        else submitButton.removeAttribute('aria-disabled')
      }
    }

    function scheduleSuggestions() {
      if (debounceTimer) {
        root.clearTimeout(debounceTimer)
        debounceTimer = 0
      }
      debounceTimer = root.setTimeout(() => {
        debounceTimer = 0
        updateSuggestions()
      }, DEBOUNCE_MS)
    }

    function cancelBlurClose() {
      if (blurTimer) {
        root.clearTimeout(blurTimer)
        blurTimer = 0
      }
    }

    // ------------------------------------------------------------ 远程联想

    function remoteEnabled() {
      return Boolean(SS.remote &&
        typeof SS.remote.enabled === 'function' &&
        SS.remote.enabled())
    }

    function createAbortController() {
      try {
        if (typeof root.AbortController === 'function') return new root.AbortController()
      } catch (e) {
        /* 老浏览器退化为只用令牌守卫 */
      }
      return null
    }

    function cancelRemote() {
      remoteToken += 1
      if (remoteController) {
        const controller = remoteController
        remoteController = null
        try {
          controller.abort()
        } catch (e) {
          /* 忽略 */
        }
      }
    }

    function syncRemoteToggle() {
      if (!remoteToggle || !SS.remote) return
      const on = remoteEnabled()
      remoteToggle.setAttribute('aria-pressed', on ? 'true' : 'false')
    }

    // ------------------------------------------------------------ 搜索历史管理

    function historyList() {
      try {
        if (SS.history && typeof SS.history.list === 'function') {
          const list = SS.history.list()
          return Array.isArray(list) ? list : []
        }
      } catch (e) {
        /* 历史读取失败不影响输入 */
      }
      return []
    }

    function refreshHistoryCount() {
      const count = historyList().length
      if (historyCount) historyCount.textContent = count + ' 条'
      if (historyClear) historyClear.disabled = count === 0
      return count
    }

    function rerenderForHistory() {
      const raw = input.value
      if (normalize(raw) === '') return
      if (!list || list.hidden || items.length === 0) return
      const preserveKey = currentActiveKey()
      lastRenderedValue = raw
      renderItems(buildItems(raw, lastRemoteWords), preserveKey)
    }

    function removeHistoryItem(label, keepActive) {
      if (!SS.history || typeof SS.history.remove !== 'function') return
      const wasActiveIndex = activeIndex
      try {
        SS.history.remove(label)
      } catch (e) {
        /* 存储异常忽略 */
      }
      refreshHistoryCount()
      rerenderForHistory()
      if (keepActive && activeIndex === -1 && items.length > 0) {
        setActive(Math.min(Math.max(wasActiveIndex, 0), items.length - 1))
      }
    }

    // ------------------------------------------------------------ 本地 + 合并

    function collectLocal(raw) {
      let source = []
      if (SS.suggest && typeof SS.suggest.getItems === 'function') {
        try {
          const result = SS.suggest.getItems(raw, { max: LOCAL_ITEM_CAP })
          source = Array.isArray(result) ? result : []
        } catch (e) {
          source = []
        }
      }

      const engine = []
      const sites = []
      const history = []
      for (const item of source) {
        if (!item || typeof item !== 'object') continue
        if (item.type === 'engine' && engine.length === 0) engine.push(item)
        else if (item.type === 'site' && sites.length < SITE_MAX) sites.push(item)
        else if (item.type === 'history' && history.length < HISTORY_MAX) history.push(item)
      }
      return { engine, sites, history }
    }

    function buildItems(raw, remoteWords) {
      const local = collectLocal(raw)
      const seen = new Set()
      const remember = (value) => {
        if (typeof value === 'string' && value.trim() !== '') seen.add(value.trim().toLowerCase())
      }
      for (const item of local.engine) remember(item.label)
      for (const item of local.sites) remember(item.label)
      for (const item of local.history) remember(item.label)
      const query = normalize(raw).toLowerCase()
      if (query !== '') seen.add(query)

      const remoteItems = []
      const words = Array.isArray(remoteWords) ? remoteWords : []
      const providerLabel =
        SS.remote && SS.remote.provider && typeof SS.remote.provider.label === 'string'
          ? SS.remote.provider.label
          : '联网'
      for (const value of words) {
        if (typeof value !== 'string') continue
        const label = value.trim()
        if (label === '' || label.length > REMOTE_WORD_MAX_LENGTH) continue
        const dedupeKey = label.toLowerCase()
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        remoteItems.push({ type: 'remote', label, sublabel: providerLabel })
        if (remoteItems.length >= REMOTE_MAX) break
      }

      const localCount = local.engine.length + local.sites.length + local.history.length
      const remoteSlots = Math.max(0, Math.min(REMOTE_MAX, TOTAL_MAX - localCount))
      return local.engine
        .concat(local.sites, remoteItems.slice(0, remoteSlots), local.history)
        .slice(0, TOTAL_MAX)
    }

    function currentActiveKey() {
      if (activeIndex < 0) return null
      const item = items[activeIndex]
      if (!item) return null
      return item.type + '|' + String(item.label).toLowerCase()
    }

    function requestRemote(raw) {
      cancelRemote()
      const query = normalize(raw)
      if (query === '' || !remoteEnabled()) return
      if (!list || list.hidden) return
      if (!SS.remote || typeof SS.remote.fetch !== 'function') return

      const token = remoteToken
      const controller = createAbortController()
      remoteController = controller
      const requestOptions = { limit: REMOTE_MAX }
      if (controller) requestOptions.signal = controller.signal

      let pending = null
      try {
        pending = SS.remote.fetch(raw, requestOptions)
      } catch (e) {
        remoteController = null
        return
      }
      if (!pending || typeof pending.then !== 'function') {
        remoteController = null
        return
      }

      pending.then((words) => {
        if (token !== remoteToken) return
        if (remoteController === controller) remoteController = null
        const remoteWords = Array.isArray(words) ? words : []
        if (normalize(input.value) !== query) return
        if (!list || list.hidden || items.length === 0) return
        if (remoteWords.length === 0) return

        const preserveKey = currentActiveKey()
        lastRenderedValue = input.value
        lastRemoteWords = remoteWords.slice()
        renderItems(buildItems(input.value, remoteWords), preserveKey)
      }).catch(() => {
        /* fetch 永不 reject；再兜一层，绝不影响本地联想 */
      })
    }

    // ------------------------------------------------------------ 列表渲染

    function clearActive() {
      activeIndex = -1
      if (list) {
        const options = list.querySelectorAll('[role="option"]')
        for (const option of options) {
          option.classList.remove('is-active')
          option.setAttribute('aria-selected', 'false')
        }
      }
      input.removeAttribute('aria-activedescendant')
    }

    function closeList() {
      cancelRemote()
      clearActive()
      items = []
      lastRenderedValue = null
      lastRemoteWords = []
      if (list) {
        list.hidden = true
        list.textContent = ''
      }
      input.setAttribute('aria-expanded', 'false')
      input.removeAttribute('aria-activedescendant')
    }

    function setActive(index) {
      if (!list || items.length === 0) return
      const count = items.length
      let next = index
      if (next < 0) next = count - 1
      if (next >= count) next = 0
      activeIndex = next

      const options = list.querySelectorAll('[role="option"]')
      for (let i = 0; i < options.length; i += 1) {
        const option = options[i]
        const active = i === next
        option.classList.toggle('is-active', active)
        option.setAttribute('aria-selected', active ? 'true' : 'false')
      }

      if (next >= 0) {
        input.setAttribute('aria-activedescendant', optionId(next))
        const activeOption = options[next]
        if (activeOption && typeof activeOption.scrollIntoView === 'function') {
          try {
            activeOption.scrollIntoView({ block: 'nearest' })
          } catch (e) {
            /* 老浏览器忽略 */
          }
        }
      }
    }

    function renderItems(nextItems, preserveKey) {
      if (!list) return
      items = nextItems
      activeIndex = -1
      if (items.length === 0) {
        closeList()
        return
      }

      list.textContent = ''
      const fragment = doc.createDocumentFragment()
      items.forEach((item, index) => {
        const option = doc.createElement('li')
        option.className = item.type === 'history' ? 'suggest-item suggest-item-history' : 'suggest-item'
        option.id = optionId(index)
        option.dataset.index = String(index)
        option.dataset.type = item.type
        if (item.siteId) option.dataset.siteId = item.siteId
        option.setAttribute('role', 'option')
        option.setAttribute('aria-selected', 'false')

        const label = doc.createElement('span')
        label.className = 'suggest-label'
        label.textContent = item.label
        option.appendChild(label)

        if (item.sublabel) {
          const sublabel = doc.createElement('span')
          sublabel.className = 'suggest-sublabel'
          sublabel.textContent = item.sublabel
          option.appendChild(sublabel)
        }

        if (item.type === 'history') {
          const remove = doc.createElement('button')
          remove.className = 'suggest-delete'
          remove.type = 'button'
          remove.tabIndex = -1
          remove.setAttribute('aria-label', '删除这条历史')
          remove.title = '删除'
          remove.textContent = '✕'
          option.appendChild(remove)
        }
        fragment.appendChild(option)
      })
      list.appendChild(fragment)
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
      input.removeAttribute('aria-activedescendant')

      if (preserveKey) {
        const index = items.findIndex((item) =>
          item.type + '|' + String(item.label).toLowerCase() === preserveKey)
        if (index !== -1) setActive(index)
      }
    }

    function renderSuggestions(raw) {
      lastRenderedValue = raw
      lastRemoteWords = []
      renderItems(buildItems(raw, []))
      requestRemote(raw)
    }

    function updateSuggestions() {
      const raw = input.value
      if (normalize(raw) === '') {
        closeList()
        return
      }
      if (list && !list.hidden && lastRenderedValue === raw && items.length > 0) return
      renderSuggestions(raw)
    }

    function ensureSuggestions() {
      const raw = input.value
      if (normalize(raw) === '') {
        closeList()
        return false
      }
      if (!list) return false
      if (list.hidden || items.length === 0 || lastRenderedValue !== raw) renderSuggestions(raw)
      return items.length > 0
    }

    // ------------------------------------------------------------ 采用建议项

    function navigate(url) {
      if (!url) return
      try {
        root.location.href = url
      } catch (e) {
        try {
          root.location.assign(url)
        } catch (err) {
          /* 静默 */
        }
      }
    }

    function searchWithDefaultEngine() {
      const query = normalize(input.value)
      if (query === '') {
        input.focus()
        return
      }

      if (form && typeof form.requestSubmit === 'function') {
        try {
          form.requestSubmit()
          return
        } catch (e) {
          /* 落 URL 兜底 */
        }
      }

      let url = ''
      if (SS.search && typeof SS.search.resolveDefault === 'function') {
        const decision = SS.search.resolveDefault(query)
        if (decision && decision.url) url = decision.url
      }
      if (!url) url = DEFAULT_ENGINE_SEARCH + encodeURIComponent(query)
      navigate(url)
    }

    function adoptSite(siteId) {
      const decision = SS.search && typeof SS.search.resolveSite === 'function'
        ? SS.search.resolveSite(siteId, input.value)
        : null
      if (decision && decision.url) {
        navigate(decision.url)
        return
      }
      input.focus()
    }

    function adopt(item) {
      if (!item) return
      cancelBlurClose()
      closeList()

      if (item.type === 'site') {
        adoptSite(item.siteId)
        return
      }
      if (item.type === 'history' || item.type === 'remote') {
        input.value = item.label
        syncFieldState()
        searchWithDefaultEngine()
        return
      }
      searchWithDefaultEngine()
    }

    // ------------------------------------------------------------ 事件绑定

    input.addEventListener('input', () => {
      syncFieldState()
      if (composing) return
      if (normalize(input.value) === '') {
        if (debounceTimer) {
          root.clearTimeout(debounceTimer)
          debounceTimer = 0
        }
        closeList()
        return
      }
      scheduleSuggestions()
    })

    input.addEventListener('compositionstart', () => {
      composing = true
    })

    input.addEventListener('compositionend', () => {
      composing = false
      syncFieldState()
      scheduleSuggestions()
    })

    input.addEventListener('focus', () => {
      cancelBlurClose()
    })

    input.addEventListener('blur', () => {
      cancelBlurClose()
      blurTimer = root.setTimeout(() => {
        blurTimer = 0
        closeList()
      }, BLUR_CLOSE_MS)
    })

    input.addEventListener('keydown', (event) => {
      if (event.isComposing || composing) return

      const key = event.key

      if (key === 'ArrowDown') {
        if (!ensureSuggestions()) return
        event.preventDefault()
        if (activeIndex === -1) setActive(0)
        else setActive(activeIndex + 1)
        return
      }

      if (key === 'ArrowUp') {
        if (!ensureSuggestions()) return
        event.preventDefault()
        if (activeIndex <= 0) setActive(items.length - 1)
        else setActive(activeIndex - 1)
        return
      }

      if (key === 'Delete') {
        if (list && !list.hidden && activeIndex >= 0 && items[activeIndex] &&
          items[activeIndex].type === 'history') {
          event.preventDefault()
          removeHistoryItem(items[activeIndex].label, true)
        }
        return
      }

      if (key === 'Enter') {
        if (list && !list.hidden && activeIndex >= 0 && items[activeIndex]) {
          event.preventDefault()
          adopt(items[activeIndex])
        }
        return
      }

      if (key === 'Escape' || key === 'Esc') {
        if (list && !list.hidden) {
          event.preventDefault()
          closeList()
        }
        return
      }

      if (key === 'Tab') {
        closeList()
      }
    })

    if (list) {
      list.addEventListener('mousedown', (event) => {
        const target = event.target
        const deleteButton = target && typeof target.closest === 'function'
          ? target.closest('.suggest-delete')
          : null
        if (deleteButton && list.contains(deleteButton)) {
          event.preventDefault()
          return
        }
        const option = target && typeof target.closest === 'function'
          ? target.closest('[role="option"]')
          : null
        if (!option || !list.contains(option)) return
        event.preventDefault()
        const index = Number(option.dataset.index)
        const item = items[index]
        if (item) adopt(item)
      })

      list.addEventListener('click', (event) => {
        const target = event.target
        const deleteButton = target && typeof target.closest === 'function'
          ? target.closest('.suggest-delete')
          : null
        if (!deleteButton || !list.contains(deleteButton)) return
        event.preventDefault()
        event.stopPropagation()
        const option = deleteButton.closest('[role="option"]')
        if (!option) return
        const index = Number(option.dataset.index)
        const item = items[index]
        if (item && item.type === 'history') removeHistoryItem(item.label, false)
      })
    }

    if (clearButton) {
      clearButton.addEventListener('mousedown', (event) => {
        event.preventDefault()
      })
      clearButton.addEventListener('click', () => {
        input.value = ''
        syncFieldState()
        closeList()
        input.focus()
      })
    }

    if (remoteToggle && SS.remote) {
      remoteToggle.addEventListener('click', () => {
        const next = !remoteEnabled()
        if (typeof SS.remote.setEnabled === 'function') SS.remote.setEnabled(next)
        syncRemoteToggle()

        const raw = input.value
        const query = normalize(raw)
        if (next) {
          if (query !== '' && list && !list.hidden) requestRemote(raw)
          return
        }

        cancelRemote()
        if (query !== '' && list && !list.hidden) {
          const preserveKey = currentActiveKey()
          lastRenderedValue = raw
          lastRemoteWords = []
          renderItems(buildItems(raw, []), preserveKey)
        }
      })
      syncRemoteToggle()
    }

    refreshHistoryCount()
    if (historyClear) {
      historyClear.addEventListener('click', () => {
        if (!SS.history || typeof SS.history.clear !== 'function') return
        try {
          SS.history.clear()
        } catch (e) {
          /* 存储异常忽略 */
        }
        refreshHistoryCount()
        closeList()
      })
    }
    doc.addEventListener('ss:history-changed', () => {
      refreshHistoryCount()
      rerenderForHistory()
    })
    root.addEventListener('focus', refreshHistoryCount)

    doc.addEventListener('keydown', (event) => {
      if (event.defaultPrevented) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key !== KEY_SLASH) return

      const target = event.target
      if (target && target.nodeType === 1) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (target.isContentEditable) return
      }
      event.preventDefault()
      input.focus()
      if (typeof input.select === 'function') input.select()
    })

    syncFieldState()
    input.setAttribute('aria-expanded', 'false')
    initialized = true
  }

  SS.input = { init }
})(typeof globalThis !== 'undefined' ? globalThis : this)
