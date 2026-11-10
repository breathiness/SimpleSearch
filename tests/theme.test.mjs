// 主题（assets/js/theme.js）契约测试：用 node:vm 造最小假 DOM / localStorage，验证
// KEY / get / resolve / apply / toggle / init 与持久化行为（验收门 §9.4）。
// 契约依据：docs/contract.md §5.4、§6、§9.4。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { jsPath, hasRepo } from './helpers/load.mjs'

const missing = hasRepo('assets', 'js', 'theme.js') ? [] : ['assets/js/theme.js']
const skipReason = missing.length ? `等待交付：${missing.join('、')}` : null

const THEME_SOURCE = missing.length ? '' : fs.readFileSync(jsPath('theme'), 'utf8')

function kebab(name) {
  return 'data-' + String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function makeToggleButton() {
  const handlers = {}
  return {
    textContent: '',
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value)
    },
    getAttribute(name) {
      return this.attrs[name] ?? null
    },
    addEventListener(type, handler) {
      handlers[type] = handler
    },
    fire(type) {
      if (typeof handlers[type] === 'function') handlers[type]()
    },
  }
}

function makeThemeColorMeta() {
  return {
    attrs: {},
    content: '',
    setAttribute(name, value) {
      this.attrs[name] = String(value)
      if (name === 'content') this.content = String(value)
    },
    getAttribute(name) {
      return this.attrs[name] ?? null
    },
  }
}

/**
 * 造一个最小环境并执行 theme.js（经典脚本，靠 globalThis 注册 SS.theme）。
 * 同时兼容 setAttribute 与 dataset 两种写 DOM 的方式，避免过度绑定实现细节。
 */
function createThemeEnv(options = {}) {
  const {
    storedTheme = null,
    defaultTheme = 'light',
    docTheme = null,
    storageThrows = false,
  } = options

  const store = new Map()
  if (storedTheme !== null) store.set('ss.theme', storedTheme)

  const localStorage = {
    getItem(key) {
      if (storageThrows) throw new Error('storage 不可用')
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      if (storageThrows) throw new Error('storage 不可用')
      store.set(key, String(value))
    },
    removeItem(key) {
      if (storageThrows) throw new Error('storage 不可用')
      store.delete(key)
    },
  }

  const attributes = new Map()
  if (defaultTheme !== null) attributes.set('data-theme-default', defaultTheme)
  if (docTheme !== null) attributes.set('data-theme', docTheme)

  const documentElement = {
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null
    },
    setAttribute(name, value) {
      attributes.set(name, String(value))
    },
    removeAttribute(name) {
      attributes.delete(name)
    },
    dataset: new Proxy(
      {},
      {
        get: (_, key) => (attributes.has(kebab(key)) ? attributes.get(kebab(key)) : undefined),
        set: (_, key, value) => {
          attributes.set(kebab(key), String(value))
          return true
        },
        has: (_, key) => attributes.has(kebab(key)),
      },
    ),
  }

  const toggleButton = makeToggleButton()
  const themeColorMeta = makeThemeColorMeta()

  const document = {
    documentElement,
    getElementById(id) {
      return id === 'theme-toggle' ? toggleButton : null
    },
    querySelector(selector) {
      return /theme-color/.test(String(selector)) ? themeColorMeta : null
    },
  }

  const sandbox = { document, localStorage, SimpleSearch: {} }
  const context = vm.createContext(sandbox)
  vm.runInContext(THEME_SOURCE, context, { filename: 'assets/js/theme.js' })

  const theme = context.SimpleSearch && context.SimpleSearch.theme
  return {
    theme,
    store,
    documentElement,
    toggleButton,
    themeColorMeta,
    readThemeAttr() {
      const value = documentElement.getAttribute('data-theme')
      return value === undefined ? null : value
    },
  }
}

function testTheme(name, fn) {
  test(name, skipReason ? { skip: skipReason } : {}, fn)
}

testTheme('SS.theme.KEY 为 ss.theme', () => {
  const env = createThemeEnv()
  assert.equal(env.theme.KEY, 'ss.theme')
})

testTheme('get()：仅读存储，非法值/无值/存储异常返回 null', () => {
  assert.equal(createThemeEnv().theme.get(), null)
  assert.equal(createThemeEnv({ storedTheme: 'dark' }).theme.get(), 'dark')
  assert.equal(createThemeEnv({ storedTheme: 'light' }).theme.get(), 'light')
  assert.equal(createThemeEnv({ storedTheme: 'blue' }).theme.get(), null)
  assert.equal(createThemeEnv({ storageThrows: true }).theme.get(), null)
})

testTheme('resolve()：存储优先，否则用页面默认值，非法默认值回落 light', () => {
  assert.equal(createThemeEnv({ storedTheme: 'dark' }).theme.resolve('light'), 'dark')
  assert.equal(createThemeEnv({ storedTheme: 'light' }).theme.resolve('dark'), 'light')
  assert.equal(createThemeEnv().theme.resolve('dark'), 'dark')
  assert.equal(createThemeEnv().theme.resolve('light'), 'light')
  assert.equal(createThemeEnv().theme.resolve(null), 'light')
  assert.equal(createThemeEnv().theme.resolve('blue'), 'light')
})

testTheme('apply()：写 <html data-theme> 并同步按钮文案 / aria-pressed / theme-color', () => {
  const env = createThemeEnv()
  env.theme.apply('dark')
  assert.equal(env.readThemeAttr(), 'dark')
  assert.equal(env.toggleButton.textContent, '白天模式')
  assert.equal(env.toggleButton.getAttribute('aria-pressed'), 'true')
  assert.ok(env.themeColorMeta.content, 'apply 后 theme-color 不应为空')
  assert.match(env.themeColorMeta.content, /^#[0-9a-f]{6}$/i)

  env.theme.apply('light')
  assert.equal(env.readThemeAttr(), 'light')
  assert.equal(env.toggleButton.textContent, '夜间模式')
  assert.equal(env.toggleButton.getAttribute('aria-pressed'), 'false')

  // 非法值直接忽略，不破坏当前主题
  env.theme.apply('blue')
  assert.equal(env.readThemeAttr(), 'light')
})

testTheme('toggle()：切换、持久化并返回新主题', () => {
  const env = createThemeEnv({ docTheme: 'light' })
  assert.equal(env.theme.toggle(), 'dark')
  assert.equal(env.readThemeAttr(), 'dark')
  assert.equal(env.store.get('ss.theme'), 'dark')

  assert.equal(env.theme.toggle(), 'light')
  assert.equal(env.readThemeAttr(), 'light')
  assert.equal(env.store.get('ss.theme'), 'light')
})

testTheme('toggle()：存储不可用时仍能切换（静默降级）', () => {
  const env = createThemeEnv({ docTheme: 'light', storageThrows: true })
  assert.doesNotThrow(() => env.theme.toggle())
  assert.equal(env.readThemeAttr(), 'dark')
  assert.doesNotThrow(() => env.theme.toggle())
  assert.equal(env.readThemeAttr(), 'light')
})

testTheme('init()：跟随 data-theme-default，并绑定 #theme-toggle 点击', () => {
  const env = createThemeEnv({ defaultTheme: 'dark', docTheme: 'light' })
  env.theme.init()
  assert.equal(env.readThemeAttr(), 'dark')

  // 点击按钮应切到相反主题并持久化
  env.toggleButton.fire('click')
  assert.equal(env.readThemeAttr(), 'light')
  assert.equal(env.store.get('ss.theme'), 'light')
})

testTheme('init()：存储值优先于入口页默认主题（刷新后保持）', () => {
  const env = createThemeEnv({ defaultTheme: 'light', storedTheme: 'dark' })
  env.theme.init()
  assert.equal(env.readThemeAttr(), 'dark')
})
