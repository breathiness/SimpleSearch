// 主题（单页模式，契约 §12.1）：?theme= → localStorage ss.theme → 系统偏好 → 浅色。
// 首屏防闪烁由 templates/page.html 的内联脚本负责（同一解析顺序）；本模块只做
// 交互、持久化、切换按钮 / meta theme-color 同步，以及未显式选择时跟随系统偏好。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const KEY = 'ss.theme'
  const LIGHT = 'light'
  const DARK = 'dark'

  // 与 tokens.css 的 --bg 保持一致；仅当无法读取 CSS 变量时兜底
  const THEME_COLORS = { light: '#f5f5f5', dark: '#303030' }
  // 文案表示「点击后会切到哪个主题」
  const TOGGLE_LABELS = { light: '夜间模式', dark: '白天模式' }

  // 把任意值收敛为 'light' | 'dark' | null
  function normalize(theme) {
    return theme === LIGHT || theme === DARK ? theme : null
  }

  function getDoc() {
    return root.document || null
  }

  // 只读存储：隐私模式 / 禁用 localStorage 时静默返回 null
  function get() {
    try {
      const storage = root.localStorage
      if (!storage) return null
      return normalize(storage.getItem(KEY))
    } catch (error) {
      return null
    }
  }

  function save(theme) {
    try {
      const storage = root.localStorage
      if (storage) storage.setItem(KEY, theme)
    } catch (error) {
      // 存储失败不影响本次切换
    }
  }

  // 与内联脚本同一正则：只认 ?theme=light|dark（其他参数保持原样）
  function readUrlTheme() {
    try {
      const location = root.location
      if (!location || typeof location.search !== 'string') return null
      const matched = /[?&]theme=(light|dark)(?:&|$)/.exec(location.search)
      return matched ? matched[1] : null
    } catch (error) {
      return null
    }
  }

  // 去掉地址栏的 theme 参数（分享出去的地址不再固定主题）；受限环境失败静默
  function stripUrlTheme() {
    try {
      const location = root.location
      const history = root.history
      if (!location || !history || typeof history.replaceState !== 'function') return
      const search = typeof location.search === 'string' ? location.search : ''
      if (/[?&]theme=/.test(search) === false) return
      const params = search
        .replace(/^\?/, '')
        .split('&')
        .filter((pair) => pair && /^theme=(light|dark)$/.test(pair) === false)
      const query = params.length ? '?' + params.join('&') : ''
      const pathname = typeof location.pathname === 'string' ? location.pathname : ''
      const hash = typeof location.hash === 'string' ? location.hash : ''
      history.replaceState(history.state, '', pathname + query + hash)
    } catch (error) {
      // 忽略：清理失败不影响主题
    }
  }

  // 系统偏好：无 matchMedia（或调用失败）时返回 null，由浅色兜底
  function systemTheme() {
    try {
      if (typeof root.matchMedia !== 'function') return null
      const media = root.matchMedia('(prefers-color-scheme: dark)')
      if (!media) return null
      return media.matches ? DARK : LIGHT
    } catch (error) {
      return null
    }
  }

  // 让浏览器地址栏颜色跟随页面底色：优先读 CSS 变量，读不到用兜底表
  function themeColor(theme) {
    try {
      const doc = getDoc()
      if (doc && typeof root.getComputedStyle === 'function') {
        const styles = root.getComputedStyle(doc.documentElement)
        const value = styles && styles.getPropertyValue('--bg')
        if (value && value.trim()) return value.trim()
      }
    } catch (error) {
      // 忽略：部分测试环境没有 getComputedStyle
    }
    return THEME_COLORS[theme] || THEME_COLORS[LIGHT]
  }

  // 同步主题切换按钮：文案 + aria-pressed（true 表示当前处于夜间/深色）
  function syncToggle(doc, theme) {
    if (typeof doc.getElementById !== 'function') return
    const button = doc.getElementById('theme-toggle')
    if (!button) return
    button.textContent = TOGGLE_LABELS[theme]
    button.setAttribute('aria-pressed', theme === DARK ? 'true' : 'false')
  }

  function syncThemeColor(doc, theme) {
    if (typeof doc.querySelector !== 'function') return
    const meta = doc.querySelector('meta[name="theme-color"]')
    if (!meta || typeof meta.setAttribute !== 'function') return
    meta.setAttribute('content', themeColor(theme))
  }

  // 应用主题：只改 DOM（不写存储），非法值直接忽略
  function apply(theme) {
    const next = normalize(theme)
    if (!next) return
    const doc = getDoc()
    const el = doc && doc.documentElement
    if (!el) return
    el.setAttribute('data-theme', next)
    syncToggle(doc, next)
    syncThemeColor(doc, next)
  }

  // 当前生效主题：以 <html data-theme> 为准，其次按解析顺序兜底
  function currentTheme() {
    const doc = getDoc()
    const el = doc && doc.documentElement
    const fromDom = el ? normalize(el.getAttribute('data-theme')) : null
    if (fromDom) return fromDom
    return resolve(null)
  }

  // 解析：?theme= > 存储 > 旧入口的显式默认值 > 系统偏好 > 浅色
  function resolve(pageDefault) {
    const fromUrl = readUrlTheme()
    if (fromUrl) return fromUrl
    const stored = get()
    if (stored) return stored
    const explicit = normalize(pageDefault)
    if (explicit) return explicit
    return systemTheme() || LIGHT
  }

  // 切换并持久化：一旦用户显式切换过，后续不再跟随系统
  function toggle() {
    const next = currentTheme() === DARK ? LIGHT : DARK
    save(next)
    apply(next)
    return next
  }

  let bound = false
  let following = false

  // 用户没有显式选择（ss.theme 为空）时实时跟随系统；显式选择过就不再覆盖
  function followSystem() {
    if (following) return
    try {
      if (typeof root.matchMedia !== 'function') return
      const media = root.matchMedia('(prefers-color-scheme: dark)')
      if (!media) return
      const onChange = function () {
        if (get()) return
        apply(media.matches ? DARK : LIGHT)
      }
      if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
      else if (typeof media.addListener === 'function') media.addListener(onChange)
      else return
      following = true
    } catch (error) {
      // 环境不支持就静默
    }
  }

  // 由 app.js 在 DOMContentLoaded 后调用
  function init() {
    const doc = getDoc()
    const el = doc && doc.documentElement
    if (!el) return

    // 1) ?theme= 优先：持久化后从地址栏移除，之后按存储解析
    const fromUrl = readUrlTheme()
    if (fromUrl) {
      save(fromUrl)
      stripUrlTheme()
    }

    // 2) 应用：URL 命中时直接用该主题（存储不可用也不丢失）；否则
    //    存储 > 系统偏好 > 浅色（data-theme-default 为 auto）
    apply(fromUrl || resolve(el.getAttribute('data-theme-default')))

    // 3) 从未显式选择过时，实时跟随系统深浅色变化
    if (!get()) followSystem()

    // 防止重复 init 时重复绑定
    if (bound) return
    bound = true

    if (typeof doc.getElementById !== 'function') return
    const button = doc.getElementById('theme-toggle')
    if (!button || typeof button.addEventListener !== 'function') return
    // 键盘 Enter / Space 由原生 button 负责，不需要额外处理
    button.addEventListener('click', function () {
      toggle()
    })
  }

  SS.theme = { KEY, get, resolve, apply, toggle, init, readUrlTheme }
})(typeof globalThis !== 'undefined' ? globalThis : this)
