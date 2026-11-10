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
      if (SS.history && SS.history.record) SS.history.record(query)
      // 非空交给浏览器原生 GET 提交，表单编码天然安全
    })
  }

  // ---------------------------------------------------------------- 分类导航
  function applyGroupFilter(group) {
    const nav = $('group-chips')
    if (nav) {
      for (const item of nav.querySelectorAll('[data-group]')) {
        item.setAttribute('aria-current', item.getAttribute('data-group') === group ? 'true' : 'false')
      }
    }
    const buttons = document.querySelectorAll('#buttons-container [data-site]')
    for (const button of buttons) {
      const match = group === 'all' || button.getAttribute('data-group') === group
      button.hidden = !match
    }
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
    return panelOpen || document.body.classList.contains('nav-open')
  }

  function syncScrim() {
    const scrim = $('scrim')
    if (!scrim) return
    scrim.hidden = !anyOverlayOpen()
  }

  function openNav() {
    closeSettings(false)
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
    closeNav(false)
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
      scrim.addEventListener('click', () => {
        if (panel && !panel.hidden) closeSettings()
        else if (document.body.classList.contains('nav-open')) closeNav()
      })
    }
    document.addEventListener('keydown', (event) => {
      // 设置面板是 aria-modal 对话框：Tab 在面板内循环，不跑到背后的页面
      if (event.key === 'Tab' && panel && !panel.hidden) {
        const focusables = panel.querySelectorAll('button, a[href]')
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
      if (panel && !panel.hidden) closeSettings()
      else closeNav()
      event.preventDefault()
    })
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
    '.button, .nav-item, .appbar-icon, .icon-button, #search-submit, .switch-row, .panel-link, .suggest-item'

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

  function boot() {
    initTheme()
    initInput()
    bindGroupNav()
    bindSiteButtons()
    bindSearchForm()
    bindDrawers()
    bindRipple()
    // 供 E2E/调试判断"装配完成"（脚本 defer 执行完 ≠ 已绑定事件）
    document.documentElement.setAttribute('data-app-ready', '1')
  }

  SS.app = { boot, handleSiteClick, applyGroupFilter, openSettings, closeSettings, openNav, closeNav }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
