// 应用装配层：只负责把各模块接到 DOM 上，不含业务逻辑。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const $ = (id) => document.getElementById(id)

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

  function initTheme() {
    if (SS.theme && typeof SS.theme.init === 'function') SS.theme.init()
  }

  function initInput() {
    if (SS.input && typeof SS.input.init === 'function') SS.input.init()
  }

  // ---------------------------------------------------------------- 站点分类
  // 无 JS 兜底：#group-chips-wrap 初始 hidden，只有这里才把它显示出来，
  // 这样禁用 JS 时不会出现一排「点了没反应」的 chip。
  function applyGroupFilter(group) {
    const chips = $('group-chips')
    if (chips) {
      const all = chips.querySelectorAll('[data-group]')
      for (const chip of all) {
        const active = chip.getAttribute('data-group') === group
        chip.setAttribute('aria-pressed', active ? 'true' : 'false')
      }
    }
    const buttons = document.querySelectorAll('#buttons-container [data-site]')
    for (const button of buttons) {
      const match = group === 'all' || button.getAttribute('data-group') === group
      button.hidden = !match
    }
  }

  function bindGroupChips() {
    const wrap = $('group-chips-wrap')
    const chips = $('group-chips')
    if (!wrap || !chips) return

    wrap.hidden = false
    chips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-group]')
      if (!chip || !chips.contains(chip)) return
      applyGroupFilter(chip.getAttribute('data-group'))
    })
  }

  // MDUI 1 风格的涟漪反馈：点击时在宿主元素内插入一个扩散圆
  const RIPPLE_TARGETS =
    '.button, .chip, #search-submit, #theme-toggle, #suggest-source-toggle, .icon-button, .suggest-item'

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
    bindGroupChips()
    bindSiteButtons()
    bindSearchForm()
    bindRipple()
    // 供 E2E/调试判断"装配完成"（脚本 defer 执行完 ≠ 已绑定事件）
    document.documentElement.setAttribute('data-app-ready', '1')
  }

  SS.app = { boot, handleSiteClick, applyGroupFilter }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true })
  } else {
    boot()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
