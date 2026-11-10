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

  // 主题色（MDUI 19 组主色，顺序与契约 §15.1 一致）
  const COLOR_KEY = 'ss.color'
  const DEFAULT_COLOR = 'indigo'
  const COLORS = [
    { id: 'red', label: '红' },
    { id: 'pink', label: '粉' },
    { id: 'purple', label: '紫' },
    { id: 'deep-purple', label: '深紫' },
    { id: 'indigo', label: '靛蓝' },
    { id: 'blue', label: '蓝' },
    { id: 'light-blue', label: '浅蓝' },
    { id: 'cyan', label: '青' },
    { id: 'teal', label: '蓝绿' },
    { id: 'green', label: '绿' },
    { id: 'light-green', label: '浅绿' },
    { id: 'lime', label: '黄绿' },
    { id: 'yellow', label: '黄' },
    { id: 'amber', label: '琥珀' },
    { id: 'orange', label: '橙' },
    { id: 'deep-orange', label: '深橙' },
    { id: 'brown', label: '棕' },
    { id: 'grey', label: '灰' },
    { id: 'blue-grey', label: '蓝灰' },
  ]
  // 色块背景用各色 500 档（与 tokens.css 的 --c-500 一致）
  const COLOR_500 = {
    red: '#f44336',
    pink: '#e91e63',
    purple: '#9c27b0',
    'deep-purple': '#673ab7',
    indigo: '#3f51b5',
    blue: '#2196f3',
    'light-blue': '#03a9f4',
    cyan: '#00bcd4',
    teal: '#009688',
    green: '#4caf50',
    'light-green': '#8bc34a',
    lime: '#cddc39',
    yellow: '#ffeb3b',
    amber: '#ffc107',
    orange: '#ff9800',
    'deep-orange': '#ff5722',
    brown: '#795548',
    grey: '#9e9e9e',
    'blue-grey': '#607d8b',
  }

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

  // ---------------------------------------------------------------- 主题色

  function normalizeColor(id) {
    for (const color of COLORS) {
      if (color.id === id) return id
    }
    return DEFAULT_COLOR
  }

  // 读主题色存储：缺省 / 非法值都回退 indigo
  function getColor() {
    try {
      const storage = root.localStorage
      if (!storage) return DEFAULT_COLOR
      return normalizeColor(storage.getItem(COLOR_KEY))
    } catch (error) {
      return DEFAULT_COLOR
    }
  }

  function saveColor(id) {
    try {
      const storage = root.localStorage
      if (storage) storage.setItem(COLOR_KEY, id)
    } catch (error) {
      // 存储失败不影响本次换色
    }
  }

  // 同步色块选中态（色块可能尚未渲染 / 测试环境无 querySelectorAll）
  function syncSwatches(doc, active) {
    if (typeof doc.querySelectorAll !== 'function') return
    const swatches = doc.querySelectorAll('#color-swatches .swatch')
    for (let i = 0; i < swatches.length; i++) {
      const item = swatches[i]
      if (!item || typeof item.getAttribute !== 'function') continue
      item.setAttribute('aria-pressed', item.getAttribute('data-color') === active ? 'true' : 'false')
    }
  }

  // 应用主题色：只写 <html data-color>，CSS 由 tokens.css 的语义变量接管
  function applyColor(id) {
    const next = normalizeColor(id)
    const doc = getDoc()
    const el = doc && doc.documentElement
    if (!el) return next
    el.setAttribute('data-color', next)
    syncSwatches(doc, next)
    return next
  }

  // 渲染色块（只渲一次）+ 应用存储里的主题色
  function initColor() {
    const doc = getDoc()
    if (!doc) return
    const color = getColor()
    applyColor(color)

    if (typeof doc.getElementById !== 'function') return
    const container = doc.getElementById('color-swatches')
    if (!container || typeof doc.createElement !== 'function') return
    const existing =
      typeof container.querySelectorAll === 'function' ? container.querySelectorAll('.swatch').length : 0
    if (existing >= COLORS.length) {
      syncSwatches(doc, color)
      return
    }

    for (const item of COLORS) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'swatch'
      button.setAttribute('data-color', item.id)
      button.setAttribute('aria-pressed', item.id === color ? 'true' : 'false')
      button.setAttribute('title', item.label)
      button.setAttribute('aria-label', item.label)
      if (button.style) button.style.backgroundColor = COLOR_500[item.id]
      if (typeof button.addEventListener === 'function') {
        button.addEventListener('click', function () {
          saveColor(item.id)
          applyColor(item.id)
        })
      }
      if (typeof container.appendChild === 'function') container.appendChild(button)
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

  // 同步主题开关：文案由模板固定（永远「夜间模式」），只用 aria-pressed 表达状态
  function syncToggle(doc, theme) {
    if (typeof doc.getElementById !== 'function') return
    const button = doc.getElementById('theme-toggle')
    if (!button) return
    button.setAttribute('aria-pressed', theme === DARK ? 'true' : 'false')
    button.setAttribute('title', '切换深浅色主题')
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

    // 2.5) 主题色：读取/应用存储色，并渲染设置面板的 19 个色块
    initColor()

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

  SS.theme = {
    KEY,
    COLOR_KEY,
    COLORS,
    get,
    resolve,
    apply,
    toggle,
    init,
    readUrlTheme,
    getColor,
    applyColor,
    initColor,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
