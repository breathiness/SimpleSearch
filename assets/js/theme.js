// 主题：持久化（localStorage 键 ss.theme）、<html data-theme> 应用、#theme-toggle 交互。
// 首屏防闪烁由 templates/page.html 的内联脚本负责（样式表加载前就已设置 data-theme）；
// 本模块不重复那件事，只做交互、持久化与按钮 / meta theme-color 的同步。
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

  // 只读存储：隐私模式 / 禁用 localStorage 时静默返回 null，不抛错
  function get() {
    try {
      const storage = root.localStorage
      if (!storage) return null
      return normalize(storage.getItem(KEY))
    } catch (error) {
      return null
    }
  }

  // 存储优先，其次页面默认值；两者都非法时回落到浅色
  function resolve(pageDefault) {
    const stored = get()
    if (stored) return stored
    return normalize(pageDefault) || LIGHT
  }

  function save(theme) {
    try {
      const storage = root.localStorage
      if (storage) storage.setItem(KEY, theme)
    } catch (error) {
      // 存储失败不影响本次切换
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
      // 忽略：CSS 变量在部分测试环境不可用
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

  // 当前生效主题：以 <html data-theme> 为准，其次存储 / 默认值
  function currentTheme() {
    const doc = getDoc()
    const el = doc && doc.documentElement
    const fromDom = el ? normalize(el.getAttribute('data-theme')) : null
    if (fromDom) return fromDom
    return resolve(null)
  }

  // 切换并持久化，返回新主题
  function toggle() {
    const next = currentTheme() === DARK ? LIGHT : DARK
    save(next)
    apply(next)
    return next
  }

  let bound = false

  // 由 app.js 在 DOMContentLoaded 后调用：跟随入口页默认主题，绑定切换按钮
  function init() {
    const doc = getDoc()
    const el = doc && doc.documentElement
    if (!el) return

    apply(resolve(el.getAttribute('data-theme-default')))

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

  SS.theme = { KEY, get, resolve, apply, toggle, init }
})(typeof globalThis !== 'undefined' ? globalThis : this)
