// 输入体验：清除按钮、搜索按钮可用态、联想列表渲染与键盘/鼠标交互。
// 契约 §5.5：只读历史（写入由 app.js 负责），默认完全离线，不发任何网络请求。
// 经典脚本：只注册 SS.input，顶层不碰 DOM；由 app.js 在 DOMContentLoaded 后调用 init()。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  // 输入防抖：≥120ms（契约要求），取 140ms 兼顾手感与性能
  const DEBOUNCE_MS = 140
  // 失焦后延迟关闭：≥100ms，避免点击联想项时先被 blur 关掉
  const BLUR_CLOSE_MS = 160
  const OPTION_ID_PREFIX = 'suggest-option-'
  const DEFAULT_ENGINE_SEARCH = 'https://www.bing.com/search?q='
  const KEY_SLASH = '/'

  // 查询词规范化：非字符串按空串；去首尾空白；连续空白折叠为一个空格
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

    let items = []
    let activeIndex = -1
    let lastRenderedValue = null
    let debounceTimer = 0
    let blurTimer = 0
    let composing = false

    // ---------------------------------------------------------------- 状态同步

    // 清除按钮显隐 + 搜索按钮可用态（aria-disabled 仅表达语义，绝不设 disabled，
    // 否则表单里唯一的 submit 按钮被禁用后回车提交会失效）
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

    // ---------------------------------------------------------------- 联想列表

    function computeItems(raw) {
      if (!SS.suggest || typeof SS.suggest.getItems !== 'function') return []
      try {
        const result = SS.suggest.getItems(raw)
        return Array.isArray(result) ? result : []
      } catch (e) {
        // 联想失败不影响搜索本身，静默降级为无联想
        return []
      }
    }

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
      clearActive()
      items = []
      lastRenderedValue = null
      if (list) {
        list.hidden = true
        list.textContent = ''
      }
      input.setAttribute('aria-expanded', 'false')
      input.removeAttribute('aria-activedescendant')
    }

    // 渲染：每项 role="option" 且带稳定 id，供 aria-activedescendant 引用
    function renderItems(nextItems) {
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
        // .suggest-item 是 MDUI 1 菜单项基类（app.js 会在它上面注入涟漪）；
        // 历史项额外带 .suggest-item-history 修饰类，便于样式区分
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
        fragment.appendChild(option)
      })
      list.appendChild(fragment)
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
      input.removeAttribute('aria-activedescendant')
    }

    function renderSuggestions(raw) {
      lastRenderedValue = raw
      renderItems(computeItems(raw))
    }

    // 防抖触发的刷新：值没变且列表已经渲染过时不动，避免把用户刚按方向键选中的高亮重置
    function updateSuggestions() {
      const raw = input.value
      if (normalize(raw) === '') {
        closeList()
        return
      }
      if (list && !list.hidden && lastRenderedValue === raw && items.length > 0) return
      renderSuggestions(raw)
    }

    // 键盘触发时若列表尚未渲染（防抖未到），立即用当前值计算，键盘响应不等计时器
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
            /* 老浏览器不支持选项对象时忽略：列表仍可用键盘操作 */
          }
        }
      }
    }

    // ---------------------------------------------------------------- 采用建议项

    function navigate(url) {
      if (!url) return
      try {
        root.location.href = url
      } catch (e) {
        try {
          root.location.assign(url)
        } catch (err) {
          /* 无法跳转时静默，避免控制台报错 */
        }
      }
    }

    // 用默认搜索引擎搜索当前输入词。优先走表单原生提交：
    // 这样 app.js 的 submit 处理器仍然负责记录历史（历史写入只由 app.js 做）。
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
          /* 落到下面的 URL 兜底 */
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
      // 未知站点/核心模块缺失：保持输入焦点，不跳转
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
      if (item.type === 'history') {
        // 历史项：填入输入框后直接提交 Bing（提交路径与正常回车一致）
        input.value = item.label
        syncFieldState()
        searchWithDefaultEngine()
        return
      }
      // engine（以及未来的其它类型）：用默认引擎搜索当前输入词
      searchWithDefaultEngine()
    }

    // ---------------------------------------------------------------- 事件绑定

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
      // 中文输入法组合中（选词/回车上屏）不劫持按键
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

      if (key === 'Enter') {
        // 只有「列表打开且当前有高亮项」时才由联想接管；否则交给表单原生提交
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
        // 不阻止默认：焦点正常移出，只收起列表
        closeList()
      }
    })

    if (list) {
      // 用 mousedown 抢在 blur 之前采用（契约 §5.5）；preventDefault 保持输入框焦点。
      // 触摸设备上浏览器也会补发 mousedown，这里不监听 touchstart，避免滑动列表时误采用/阻断滚动。
      list.addEventListener('mousedown', (event) => {
        const target = event.target
        const option = target && typeof target.closest === 'function'
          ? target.closest('[role="option"]')
          : null
        if (!option || !list.contains(option)) return
        event.preventDefault()
        const index = Number(option.dataset.index)
        const item = items[index]
        if (item) adopt(item)
      })
    }

    if (clearButton) {
      // mousedown 阻止焦点从输入框移走，点击后直接清空并保持输入状态
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

    // 快捷键「/」聚焦搜索框（验收门 §9.5）；在可编辑控件里正常输入斜杠
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
