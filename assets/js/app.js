// 应用装配层：只负责把各模块接到 DOM 上，不含业务逻辑。
//
// v2.3 页面骨架 = MDUI 文档站式：主色顶栏 + 左侧分类导航（窄屏变抽屉）+ 内容卡片
// + 右侧设置抽屉（MD1 开关行）。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const $ = (id) => document.getElementById(id)
  const MOBILE_NAV = '(max-width: 959px)'

  function currentQuery() {
    const input = $('search-input')
    return input ? input.value : ''
  }

  function openInNewTab(url) {
    const win = window.open(url, '_blank', 'noopener')
    if (win) win.opener = null
  }

  // 站点按钮：空词直达站点，有词走站内搜索
  function handleSiteClick(siteId, event) {
    const query = currentQuery()
    const decision = SS.search && SS.search.resolveSite ? SS.search.resolveSite(siteId, query) : null
    if (!decision) return

    if (decision.kind === 'search' && SS.history && SS.history.record) {
      SS.history.record(query)
      notifyHistoryChanged()
    }

    const newTab = Boolean(event && (event.ctrlKey || event.metaKey || event.altKey))
    if (newTab) openInNewTab(decision.url)
    else window.location.href = decision.url
  }

  function bindSiteButtons() {
    const container = $('buttons-container')
    if (!container) return
    container.addEventListener('click', (event) => {
      const button = event.target.closest('[data-site]')
      if (!button || !container.contains(button)) return
      handleSiteClick(button.getAttribute('data-site'), event)
    })
  }

  // ---------------------------------------------------------------- 站点注册表（v2.9）
  // 内置站点快照 + 本地自定义站点（ss.customSites）合并，应用常用排序（ss.order），
  // 结果写回 SS.sites —— 联想、!bang、站点 URL 解析都读这份运行时注册表。
  const builtinSites = Array.isArray(SS.sites) ? SS.sites.slice() : []
  let currentGroup = 'all'

  function safeStorage() {
    try {
      return window.localStorage || null
    } catch (error) {
      return null
    }
  }

  function mergedSites() {
    const store = SS.sitesStore
    if (!store || typeof store.merge !== 'function') return builtinSites
    let custom = []
    let order = []
    try {
      custom = store.listCustom(safeStorage())
      order = store.getOrder(safeStorage())
    } catch (error) {
      custom = []
      order = []
    }
    return store.applyOrder(store.merge(builtinSites, custom), order)
  }

  function syncSiteRegistry() {
    const sites = mergedSites()
    if (Array.isArray(SS.sites)) {
      SS.sites.length = 0
      for (const site of sites) SS.sites.push(site)
    }
    return sites
  }

  function iconHrefFor(site, iconMap) {
    if (iconMap[site.id]) return iconMap[site.id]
    if (site.icon && document.getElementById(`i-${site.icon}`)) return `#i-${site.icon}`
    return ''
  }

  function createSiteButton(site, iconMap) {
    const button = document.createElement('button')
    button.className = 'button'
    button.type = 'button'
    button.setAttribute('data-site', site.id)
    button.setAttribute('data-group', site.group || '')
    if (Array.isArray(site.keywords) && site.keywords.length) {
      button.setAttribute('data-keywords', site.keywords.join(' '))
    }
    if (site.featured === true) button.setAttribute('data-featured', 'true')
    else button.hidden = true

    const href = iconHrefFor(site, iconMap)
    button.setAttribute('data-icon', href)
    if (href) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'button-icon')
      svg.setAttribute('aria-hidden', 'true')
      svg.setAttribute('focusable', 'false')
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
      use.setAttribute('href', href)
      svg.appendChild(use)
      button.appendChild(svg)
    } else {
      const span = document.createElement('span')
      span.className = 'button-icon button-icon-text'
      span.setAttribute('aria-hidden', 'true')
      span.textContent = (String(site.label || '?').trim().charAt(0) || '?').toUpperCase()
      button.appendChild(span)
    }

    const label = document.createElement('span')
    label.className = 'button-label'
    label.textContent = site.label
    button.appendChild(label)
    return button
  }

  // 按注册表（含自定义站点与新排序）重建按钮墙；内置图标从 data-icon 复用
  function refreshSiteButtons() {
    const container = $('buttons-container')
    if (!container) return
    const iconMap = {}
    for (const button of container.querySelectorAll('[data-site]')) {
      const href = button.getAttribute('data-icon')
      if (href) iconMap[button.getAttribute('data-site')] = href
      button.remove()
    }
    for (const site of syncSiteRegistry()) container.appendChild(createSiteButton(site, iconMap))
    applyGroupFilter(currentGroup, { syncUrl: false })
  }

  function getFeaturedSites() {
    return (Array.isArray(SS.sites) ? SS.sites : []).filter((site) => site && site.featured === true)
  }

  function bindSearchForm() {
    const form = $('search-form')
    const input = $('search-input')
    if (!form || !input) return

    form.addEventListener('submit', (event) => {
      const query = (input.value || '').trim()
      if (query === '') {
        // 空词不提交空搜索，回到输入框
        event.preventDefault()
        input.focus()
        return
      }

      // !bang 快捷搜索：!gh rust → 直接在 GitHub 里搜 rust
      const bang = SS.search && SS.search.resolveBang ? SS.search.resolveBang(query) : null
      if (bang) {
        event.preventDefault()
        if (SS.history && SS.history.record && bang.term) {
          SS.history.record(bang.term)
          notifyHistoryChanged()
        }
        window.location.href = bang.url
        return
      }

      if (SS.history && SS.history.record) {
        SS.history.record(query)
        notifyHistoryChanged()
      }
      // 非空交给浏览器原生 GET 提交，表单编码天然安全
    })
  }

  // ---------------------------------------------------------------- 分类导航
  // 历史写入后通知输入模块刷新设置面板里的计数/清空按钮
  function notifyHistoryChanged() {
    try {
      document.dispatchEvent(new CustomEvent('ss:history-changed'))
    } catch (error) {
      // 老浏览器不支持 CustomEvent 构造时忽略（计数只是辅助信息）
    }
  }

  // 分类选择同步到地址栏（可收藏/分享分类视图）；'all' 时不带参数
  function syncCategoryUrl(group) {
    try {
      const url = new URL(window.location.href)
      if (group === 'all') url.searchParams.delete('cat')
      else url.searchParams.set('cat', group)
      const next = url.pathname + (url.search || '') + (url.hash || '')
      window.history.replaceState(window.history.state, '', next)
    } catch (error) {
      // file:// 或受限环境 replaceState 失败时忽略，不影响筛选
    }
  }

  function applyGroupFilter(group, options) {
    const nav = $('group-chips')
    const isAll = group === 'all'
    currentGroup = group
    let label = ''
    if (nav) {
      for (const item of nav.querySelectorAll('[data-group]')) {
        const active = item.getAttribute('data-group') === group
        item.setAttribute('aria-current', active ? 'true' : 'false')
        if (active) {
          const text = item.querySelector('.nav-label')
          label = text ? text.textContent.trim() : item.textContent.trim()
        }
      }
    }
    const buttons = document.querySelectorAll('#buttons-container [data-site]')
    for (const button of buttons) {
      // 常用视图只显示 featured；分类视图显示该分类全部站点
      const match = isAll
        ? button.getAttribute('data-featured') === 'true'
        : button.getAttribute('data-group') === group
      button.hidden = !match
    }
    // 卡片标题跟随当前视图
    const title = document.querySelector('.card-title')
    if (title) title.textContent = isAll ? '常用网站' : label || '常用网站'
    // 重建按钮墙时只更新 UI，不改地址栏（否则会把 ?cat= 深链抹掉）
    if (!options || options.syncUrl !== false) syncCategoryUrl(group)
  }

  function isMobileNav() {
    return Boolean(window.matchMedia && window.matchMedia(MOBILE_NAV).matches)
  }

  function bindGroupNav() {
    const nav = $('group-chips')
    if (!nav) return
    nav.addEventListener('click', (event) => {
      const item = event.target.closest('[data-group]')
      if (!item || !nav.contains(item)) return
      applyGroupFilter(item.getAttribute('data-group'))
      // 窄屏抽屉里选完分类自动收起
      if (isMobileNav()) closeNav(false)
    })
  }

  // ---------------------------------------------------------------- 抽屉 / 遮罩
  // 判"是否有覆盖层打开"时看真实状态（#settings-panel 的 hidden / body.nav-open），
  // 不要只看 body class —— openSettings 要等 rAF 才加 class，早一步判断会漏掉。
  function anyOverlayOpen() {
    const panel = $('settings-panel')
    const panelOpen = Boolean(panel && !panel.hidden)
    const dialogs = ['shortcuts-dialog', 'sites-dialog', 'order-dialog']
    const dialogOpen = dialogs.some((id) => {
      const el = $(id)
      return Boolean(el && !el.hidden)
    })
    return panelOpen || dialogOpen || document.body.classList.contains('nav-open')
  }

  // 当前打开的最上层覆盖层（用于 Esc / Tab / 遮罩点击的事件路由）
  function openOverlay() {
    for (const id of ['sites-dialog', 'order-dialog', 'shortcuts-dialog']) {
      const el = $(id)
      if (el && !el.hidden) return { id, el }
    }
    const panel = $('settings-panel')
    if (panel && !panel.hidden) return { id: 'settings-panel', el: panel }
    return null
  }

  function syncScrim() {
    const scrim = $('scrim')
    if (!scrim) return
    scrim.hidden = !anyOverlayOpen()
  }

  function openNav() {
    closeShortcuts(false)
    closeSettings(false)
    closeSitesDialog(false)
    closeOrderDialog(false)
    document.body.classList.add('nav-open')
    const toggle = $('nav-toggle')
    if (toggle) toggle.setAttribute('aria-expanded', 'true')
    syncScrim()
  }

  function closeNav(restoreFocus = true) {
    document.body.classList.remove('nav-open')
    const toggle = $('nav-toggle')
    if (toggle) toggle.setAttribute('aria-expanded', 'false')
    syncScrim()
    if (restoreFocus && toggle && !toggle.hidden) toggle.focus()
  }

  function openSettings() {
    closeShortcuts(false)
    closeNav(false)
    closeSitesDialog(false)
    closeOrderDialog(false)
    const panel = $('settings-panel')
    const toggle = $('settings-toggle')
    if (!panel || !toggle) return
    panel.hidden = false
    requestAnimationFrame(() => document.body.classList.add('panel-open'))
    toggle.setAttribute('aria-expanded', 'true')
    syncScrim()
    const first = panel.querySelector('.switch-row')
    if (first && typeof first.focus === 'function') first.focus()
  }

  function closeSettings(restoreFocus = true) {
    const panel = $('settings-panel')
    const toggle = $('settings-toggle')
    document.body.classList.remove('panel-open')
    if (panel) panel.hidden = true
    if (toggle) toggle.setAttribute('aria-expanded', 'false')
    syncScrim()
    if (restoreFocus && toggle) toggle.focus()
  }

  function isScrimVisible() {
    return anyOverlayOpen()
  }

  // ---------------------------------------------------------------- 快捷键对话框
  let shortcutsTrigger = null

  function openShortcuts(trigger) {
    closeSettings(false)
    closeNav(false)
    closeSitesDialog(false)
    closeOrderDialog(false)
    const dialog = $('shortcuts-dialog')
    if (!dialog) return
    shortcutsTrigger = trigger || null
    dialog.hidden = false
    syncScrim()
    const close = $('shortcuts-close')
    if (close && typeof close.focus === 'function') close.focus()
  }

  function closeShortcuts(restoreFocus = true) {
    const dialog = $('shortcuts-dialog')
    if (!dialog || dialog.hidden) return
    dialog.hidden = true
    syncScrim()
    const target = shortcutsTrigger
    shortcutsTrigger = null
    if (restoreFocus && target && typeof target.focus === 'function') target.focus()
  }

  // ---------------------------------------------------------------- 站点管理 / 常用排序对话框（v2.9）
  let sitesDialogTrigger = null
  let orderDialogTrigger = null

  function openSitesDialog(trigger) {
    closeShortcuts(false)
    closeSettings(false)
    closeNav(false)
    closeOrderDialog(false)
    const dialog = $('sites-dialog')
    if (!dialog) return
    sitesDialogTrigger = trigger || null
    dialog.hidden = false
    syncScrim()
    const close = $('sites-close')
    if (close && typeof close.focus === 'function') close.focus()
  }

  function closeSitesDialog(restoreFocus = true) {
    const dialog = $('sites-dialog')
    if (!dialog || dialog.hidden) return
    dialog.hidden = true
    syncScrim()
    const target = sitesDialogTrigger
    sitesDialogTrigger = null
    if (restoreFocus && target && typeof target.focus === 'function') target.focus()
  }

  function openOrderDialog(trigger) {
    closeShortcuts(false)
    closeSettings(false)
    closeNav(false)
    closeSitesDialog(false)
    const dialog = $('order-dialog')
    if (!dialog) return
    orderDialogTrigger = trigger || null
    dialog.hidden = false
    syncScrim()
    const close = $('order-close')
    if (close && typeof close.focus === 'function') close.focus()
  }

  function closeOrderDialog(restoreFocus = true) {
    const dialog = $('order-dialog')
    if (!dialog || dialog.hidden) return
    dialog.hidden = true
    syncScrim()
    const target = orderDialogTrigger
    orderDialogTrigger = null
    if (restoreFocus && target && typeof target.focus === 'function') target.focus()
  }

  // Esc / 点遮罩 / Tab 循环的统一入口：关掉最上层覆盖层
  function closeTopOverlay(restoreFocus = true) {
    const open = openOverlay()
    if (!open) {
      if (document.body.classList.contains('nav-open')) closeNav(restoreFocus)
      return
    }
    if (open.id === 'sites-dialog') closeSitesDialog(restoreFocus)
    else if (open.id === 'order-dialog') closeOrderDialog(restoreFocus)
    else if (open.id === 'shortcuts-dialog') closeShortcuts(restoreFocus)
    else closeSettings(restoreFocus)
  }

  function bindDrawers() {
    const scrim = $('scrim')
    const navToggle = $('nav-toggle')
    const settingsToggle = $('settings-toggle')
    const settingsClose = $('settings-close')
    const panel = $('settings-panel')

    if (navToggle) {
      navToggle.addEventListener('click', () => {
        if (document.body.classList.contains('nav-open')) closeNav()
        else openNav()
      })
    }
    if (settingsToggle) {
      settingsToggle.addEventListener('click', () => {
        if (panel && !panel.hidden) closeSettings()
        else openSettings()
      })
    }
    if (settingsClose) settingsClose.addEventListener('click', () => closeSettings())
    if (scrim) {
      scrim.addEventListener('click', () => closeTopOverlay())
    }
    const shortcutsOpen = $('shortcuts-open')
    if (shortcutsOpen) {
      shortcutsOpen.addEventListener('click', () => openShortcuts(shortcutsOpen))
    }
    const shortcutsClose = $('shortcuts-close')
    if (shortcutsClose) shortcutsClose.addEventListener('click', () => closeShortcuts())
    document.addEventListener('keydown', (event) => {
      // ? 打开快捷键说明（输入框里打 ? 不拦截）
      if ((event.key === '?' || (event.key === '/' && event.shiftKey)) && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const active = document.activeElement
        const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
        const dialog = $('shortcuts-dialog')
        if (!typing && dialog && dialog.hidden) {
          event.preventDefault()
          openShortcuts(active)
        }
      }
    })
    document.addEventListener('keydown', (event) => {
      const open = openOverlay()
      const trap = open ? open.el : null
      // aria-modal 覆盖层：Tab 在内部循环，不跑到背后的页面
      if (event.key === 'Tab' && trap) {
        const focusables = trap.querySelectorAll('button, a[href]')
        if (focusables.length > 0) {
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        return
      }
      if (event.key !== 'Escape' || !isScrimVisible()) return
      closeTopOverlay()
      event.preventDefault()
    })
  }

  // ---------------------------------------------------------------- 搜索引擎
  const ENGINE_KEY = 'ss.engine'
  const FALLBACK_ENGINE = 'bing'

  function knownEngines() {
    return SS.engines && typeof SS.engines === 'object' ? SS.engines : {}
  }

  function getStoredEngine() {
    try {
      const stored = window.localStorage ? window.localStorage.getItem(ENGINE_KEY) : null
      return knownEngines()[stored] ? stored : FALLBACK_ENGINE
    } catch (error) {
      return FALLBACK_ENGINE
    }
  }

  function saveEngine(id) {
    try {
      if (window.localStorage) window.localStorage.setItem(ENGINE_KEY, id)
    } catch (error) {
      // 存储不可用时仅当次生效
    }
  }

  // 切换搜索引擎：更新 SS.defaultEngine、表单 action 与参数名、分段控件状态
  function applyEngine(id, options) {
    const engine = knownEngines()[id]
    if (!engine || typeof engine.search !== 'string') return
    SS.defaultEngine = id
    const form = $('search-form')
    const input = $('search-input')
    if (form) form.setAttribute('action', engine.search.split('?')[0])
    if (input) input.setAttribute('name', engine.param || 'q')
    const group = $('engine-mode')
    if (group) {
      for (const item of group.querySelectorAll('[data-engine]')) {
        item.setAttribute('aria-pressed', item.getAttribute('data-engine') === id ? 'true' : 'false')
      }
    }
    if (!options || options.persist !== false) saveEngine(id)
  }

  function bindEngines() {
    const group = $('engine-mode')
    if (group) {
      group.addEventListener('click', (event) => {
        const item = event.target.closest('[data-engine]')
        if (!item || !group.contains(item)) return
        applyEngine(item.getAttribute('data-engine'))
      })
    }
    applyEngine(getStoredEngine(), { persist: false })
  }

  // ---------------------------------------------------------------- PWA
  function registerServiceWorker() {
    try {
      // 单文件便携版没有 sw.js / manifest，不注册
      if (window.__SS_SINGLE_FILE) return
      if (!('serviceWorker' in navigator)) return
      // file:// 下不注册（本地双击场景不需要也不支持）
      if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return
      navigator.serviceWorker.register('sw.js').catch(() => undefined)
    } catch (error) {
      // 注册失败不影响页面功能
    }
  }

  // ---------------------------------------------------------------- 其它
  function initTheme() {
    if (SS.theme && typeof SS.theme.init === 'function') SS.theme.init()
  }

  function initInput() {
    if (SS.input && typeof SS.input.init === 'function') SS.input.init()
  }

  // MDUI 1 风格的涟漪反馈：点击时在宿主元素内插入一个扩散圆
  const RIPPLE_TARGETS =
    '.button, .nav-item, .appbar-icon, .icon-button, #search-submit, .switch-row, .panel-link, .suggest-item, .segmented-item, .text-button'

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }

  function bindRipple() {
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (prefersReducedMotion()) return
        const host = event.target && event.target.closest ? event.target.closest(RIPPLE_TARGETS) : null
        if (!host || host.hasAttribute('disabled')) return

        const rect = host.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const size = Math.max(rect.width, rect.height) * 2
        const span = document.createElement('span')
        span.className = 'ripple'
        span.style.width = `${size}px`
        span.style.height = `${size}px`
        span.style.left = `${event.clientX - rect.left - size / 2}px`
        span.style.top = `${event.clientY - rect.top - size / 2}px`
        host.appendChild(span)
        window.setTimeout(() => span.remove(), 700)
      },
      { passive: true }
    )
  }

  // ---------------------------------------------------------------- 深链
  // 只预填/预选，不自动跳转（用户明确不要「?q= 自动提交」的默认搜索引擎模式）
  function applyDeepLinks() {
    let params
    try {
      params = new URLSearchParams(window.location.search)
    } catch (error) {
      return null
    }
    if (!params.toString()) return null
    let appliedGroup = null

    const nav = $('group-chips')
    const knownGroups = new Set(
      nav ? [...nav.querySelectorAll('[data-group]')].map((el) => el.getAttribute('data-group')) : []
    )

    const cat = params.get('cat')
    if (cat && knownGroups.has(cat)) {
      applyGroupFilter(cat)
      appliedGroup = cat
    }

    const siteId = params.get('site')
    if (siteId && Array.isArray(SS.sites)) {
      const site = SS.sites.find((item) => item && item.id === siteId)
      if (site && site.group && knownGroups.has(site.group)) {
        applyGroupFilter(site.group)
        appliedGroup = site.group
        const button = document.querySelector(`#buttons-container [data-site="${siteId}"]`)
        if (button && typeof button.focus === 'function') button.focus()
      }
    }

    const query = params.get('q')
    const input = $('search-input')
    if (query && input) {
      input.value = query
      input.focus()
      try {
        input.setSelectionRange(query.length, query.length)
      } catch (error) {
        // 某些输入类型不支持 setSelectionRange，忽略
      }
      // 让清除按钮/联想等监听 input 的逻辑同步状态
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }

    return appliedGroup
  }

  function boot() {
    initTheme()
    initInput()
    bindGroupNav()
    bindSiteButtons()
    bindSearchForm()
    bindDrawers()
    bindRipple()
    bindEngines()
    // v2.9：把本地自定义站点并入运行时注册表，并按常用排序重建按钮墙
    refreshSiteButtons()
    if (SS.sitesAdmin && typeof SS.sitesAdmin.init === 'function') SS.sitesAdmin.init()
    // 深链优先（?cat= / ?site=），否则默认「常用」视图；两种情况下都要跑一次过滤
    const deepGroup = applyDeepLinks()
    applyGroupFilter(deepGroup || 'all')
    registerServiceWorker()
    // 供 E2E/调试判断"装配完成"（脚本 defer 执行完 ≠ 已绑定事件）
    document.documentElement.setAttribute('data-app-ready', '1')
  }

  SS.app = {
    boot,
    handleSiteClick,
    applyGroupFilter,
    openSettings,
    closeSettings,
    openNav,
    closeNav,
    openShortcuts,
    closeShortcuts,
    applyEngine,
    refreshSiteButtons,
    getFeaturedSites,
    getCurrentGroup: () => currentGroup,
    openSitesDialog,
    closeSitesDialog,
    openOrderDialog,
    closeOrderDialog,
    closeTopOverlay,
    syncOverlays: syncScrim,
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
