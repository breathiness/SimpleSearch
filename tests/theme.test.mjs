// 主题（assets/js/theme.js）契约测试 —— v2.1 单页主题版。
// 契约依据：docs/contract.md §5.4、§11、§12.1、§9.4。
//
// 用 node:vm 造最小假 DOM / localStorage / matchMedia / location / history：
// 覆盖注入 ?theme=、存储、系统偏好、浅色回退的完整优先级，以及 replaceState 去参数。
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

// 系统偏好模拟：matchMedia('(prefers-color-scheme: dark)').matches
function makeMatchMedia(systemTheme) {
  return (query) => {
    const text = String(query)
    const wantsDark = /dark/i.test(text)
    return {
      matches: wantsDark ? systemTheme === 'dark' : systemTheme === 'light',
      media: text,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }
  }
}

function camelToKebab(name) {
  return String(name).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function classListContains(element, name) {
  return (element.getAttribute('class') || '').split(/\s+/).includes(name)
}

// v2.4 主题色运行时由 theme.js 生成色块，需要一个能 createElement/appendChild 的最小假元素。
function makeElement(tagName) {
  const attrs = new Map()
  const children = []
  const listeners = {}
  const dataset = new Proxy(
    {},
    {
      get: (_, key) => attrs.get(`data-${camelToKebab(String(key))}`) ?? undefined,
      set: (_, key, value) => {
        attrs.set(`data-${camelToKebab(String(key))}`, String(value))
        return true
      },
      has: (_, key) => attrs.has(`data-${camelToKebab(String(key))}`),
    },
  )

  const element = {
    tagName: String(tagName).toUpperCase(),
    children,
    textContent: '',
    style: {},
    dataset,
    listeners,
    setAttribute(name, value) {
      attrs.set(String(name).toLowerCase(), String(value))
    },
    getAttribute(name) {
      const key = String(name).toLowerCase()
      return attrs.has(key) ? attrs.get(key) : null
    },
    hasAttribute(name) {
      return attrs.has(String(name).toLowerCase())
    },
    removeAttribute(name) {
      attrs.delete(String(name).toLowerCase())
    },
    appendChild(child) {
      children.push(child)
      child.parentNode = element
      return child
    },
    append(...nodes) {
      for (const node of nodes) element.appendChild(node)
    },
    remove() {
      element.removed = true
    },
    addEventListener(type, handler) {
      listeners[type] = handler
    },
    removeEventListener(type) {
      delete listeners[type]
    },
    querySelector(selector) {
      if (String(selector) === '.swatch') {
        return children.find((child) => classListContains(child, 'swatch')) || null
      }
      return null
    },
    querySelectorAll(selector) {
      if (String(selector) === '.swatch') return children.filter((child) => classListContains(child, 'swatch'))
      return []
    },
    focus() {
      element.focused = true
    },
    classList: {
      add(...names) {
        const set = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean))
        for (const name of names) set.add(name)
        attrs.set('class', [...set].join(' '))
      },
      remove(...names) {
        const set = new Set((attrs.get('class') || '').split(/\s+/).filter(Boolean))
        for (const name of names) set.delete(name)
        attrs.set('class', [...set].join(' '))
      },
      contains(name) {
        return (attrs.get('class') || '').split(/\s+/).includes(name)
      },
      toggle(name, force) {
        const want = force === undefined ? !element.classList.contains(name) : Boolean(force)
        if (want) element.classList.add(name)
        else element.classList.remove(name)
        return want
      },
    },
  }

  Object.defineProperty(element, 'className', {
    get() {
      return attrs.get('class') || ''
    },
    set(value) {
      attrs.set('class', String(value))
    },
  })
  return element
}

/**
 * 造最小环境并执行 theme.js。
 * @param {object} options
 * @param {'light'|'dark'|null} [options.storedTheme]  localStorage['ss.theme']
 * @param {string|null} [options.storedColor]          localStorage['ss.color']
 * @param {'auto'|'light'|'dark'|null} [options.defaultTheme] <html data-theme-default>
 * @param {'light'|'dark'|null} [options.docTheme]      <html data-theme> 初始值
 * @param {string|null} [options.docColor]              <html data-color> 初始值（缺省 indigo）
 * @param {'dark'|'light'|null} [options.systemTheme]   null = 环境不支持 matchMedia
 * @param {string} [options.urlSearch]                  location.search
 * @param {boolean} [options.storageThrows]
 * @param {boolean} [options.historyThrows]
 */
function createThemeEnv(options = {}) {
  const {
    storedTheme = null,
    storedColor = null,
    defaultTheme = 'auto',
    docTheme = null,
    docColor = 'indigo',
    systemTheme = null,
    urlSearch = '',
    storageThrows = false,
    historyThrows = false,
  } = options

  const store = new Map()
  if (storedTheme !== null) store.set('ss.theme', storedTheme)
  if (storedColor !== null) store.set('ss.color', storedColor)

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
  if (docColor !== null) attributes.set('data-color', docColor)

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
  const swatchesContainer = makeElement('div')

  const document = {
    documentElement,
    body: makeElement('body'),
    createElement: (tagName) => makeElement(tagName),
    createDocumentFragment: () => makeElement('fragment'),
    getElementById(id) {
      if (id === 'theme-toggle') return toggleButton
      if (id === 'color-swatches') return swatchesContainer
      return null
    },
    querySelector(selector) {
      return /theme-color/.test(String(selector)) ? themeColorMeta : null
    },
    querySelectorAll(selector) {
      if (String(selector) === '.swatch') return swatchesContainer.querySelectorAll('.swatch')
      return []
    },
  }

  const history = {
    calls: [],
    replaceState(...args) {
      if (historyThrows) throw new Error('history 不可用')
      this.calls.push(args)
    },
    pushState(...args) {
      if (historyThrows) throw new Error('history 不可用')
      this.calls.push(args)
    },
  }

  const location = {
    search: urlSearch,
    pathname: '/index.html',
    href: `https://example.com/index.html${urlSearch}`,
  }

  const sandbox = {
    SimpleSearch: {},
    document,
    localStorage,
    history,
    location,
    console,
    URL,
    URLSearchParams,
  }
  if (systemTheme !== null) sandbox.matchMedia = makeMatchMedia(systemTheme)

  const context = vm.createContext(sandbox)
  vm.runInContext(THEME_SOURCE, context, { filename: 'assets/js/theme.js' })

  const theme = context.SimpleSearch && context.SimpleSearch.theme
  return {
    theme,
    store,
    documentElement,
    toggleButton,
    themeColorMeta,
    swatchesContainer,
    history,
    readThemeAttr() {
      const value = documentElement.getAttribute('data-theme')
      return value === undefined ? null : value
    },
    readColorAttr() {
      const value = documentElement.getAttribute('data-color')
      return value === undefined ? null : value
    },
  }
}

function testTheme(name, fn) {
  test(name, skipReason ? { skip: skipReason } : {}, fn)
}

// ---------------------------------------------------------------- 基础 API

testTheme('SS.theme.KEY 为 ss.theme，且暴露 resolve/get/apply/toggle/init', () => {
  const env = createThemeEnv()
  assert.ok(env.theme, 'SS.theme 不存在')
  assert.equal(env.theme.KEY, 'ss.theme')
  for (const name of ['get', 'resolve', 'apply', 'toggle', 'init']) {
    assert.equal(typeof env.theme[name], 'function', `SS.theme.${name} 必须是函数`)
  }
})

testTheme('get()：仅读存储，非法值/无值/存储异常返回 null', () => {
  assert.equal(createThemeEnv().theme.get(), null)
  assert.equal(createThemeEnv({ storedTheme: 'dark' }).theme.get(), 'dark')
  assert.equal(createThemeEnv({ storedTheme: 'light' }).theme.get(), 'light')
  assert.equal(createThemeEnv({ storedTheme: 'blue' }).theme.get(), null)
  assert.equal(createThemeEnv({ storageThrows: true }).theme.get(), null)
})

// ---------------------------------------------------------------- resolve 优先级

testTheme('resolve()：存储优先于 pageDefault', () => {
  assert.equal(createThemeEnv({ storedTheme: 'dark' }).theme.resolve('light'), 'dark')
  assert.equal(createThemeEnv({ storedTheme: 'light' }).theme.resolve('dark'), 'light')
})

testTheme('resolve(auto)：存储优先于系统偏好', () => {
  assert.equal(
    createThemeEnv({ storedTheme: 'light', systemTheme: 'dark' }).theme.resolve('auto'),
    'light',
  )
  assert.equal(
    createThemeEnv({ storedTheme: 'dark', systemTheme: 'light' }).theme.resolve('auto'),
    'dark',
  )
})

testTheme('resolve(auto)：无存储时跟随系统偏好', () => {
  assert.equal(createThemeEnv({ systemTheme: 'dark' }).theme.resolve('auto'), 'dark')
  assert.equal(createThemeEnv({ systemTheme: 'light' }).theme.resolve('auto'), 'light')
})

testTheme('resolve(auto)：无 matchMedia 时回退 light', () => {
  assert.equal(createThemeEnv().theme.resolve('auto'), 'light')
})

testTheme('resolve(pageDefault)：显式 light/dark 在无存储时生效（兼容旧行为）', () => {
  assert.equal(createThemeEnv().theme.resolve('dark'), 'dark')
  assert.equal(createThemeEnv().theme.resolve('light'), 'light')
  assert.equal(createThemeEnv().theme.resolve(null), 'light')
})

// ---------------------------------------------------------------- readUrlTheme

testTheme('readUrlTheme()：?theme=light|dark → 对应主题', () => {
  assert.equal(typeof createThemeEnv().theme.readUrlTheme, 'function', '缺少 readUrlTheme()')
  assert.equal(createThemeEnv({ urlSearch: '?theme=light' }).theme.readUrlTheme(), 'light')
  assert.equal(createThemeEnv({ urlSearch: '?theme=dark' }).theme.readUrlTheme(), 'dark')
  assert.equal(createThemeEnv({ urlSearch: '?foo=1&theme=dark' }).theme.readUrlTheme(), 'dark')
})

testTheme('readUrlTheme()：非法值 / 无参数 → null', () => {
  const cases = ['', '?theme=x', '?theme=', '?theme=lightx', '?foo=1', '?themes=dark']
  for (const urlSearch of cases) {
    assert.equal(
      createThemeEnv({ urlSearch }).theme.readUrlTheme(),
      null,
      `location.search=${JSON.stringify(urlSearch)} 应返回 null`,
    )
  }
})

// ---------------------------------------------------------------- apply / toggle

testTheme('apply()：写 <html data-theme> 并同步 aria-pressed / theme-color（v2.3 起文案固定不改）', () => {
  const env = createThemeEnv()
  env.toggleButton.textContent = '夜间模式'
  env.theme.apply('dark')
  assert.equal(env.readThemeAttr(), 'dark')
  assert.equal(env.toggleButton.getAttribute('aria-pressed'), 'true')
  assert.ok(env.themeColorMeta.content, 'apply 后 theme-color 不应为空')
  assert.match(env.themeColorMeta.content, /^#[0-9a-f]{6}$/i)

  env.theme.apply('light')
  assert.equal(env.readThemeAttr(), 'light')
  assert.equal(env.toggleButton.getAttribute('aria-pressed'), 'false')

  env.theme.apply('blue')
  assert.equal(env.readThemeAttr(), 'light', '非法值应被忽略')
  assert.equal(env.toggleButton.textContent, '夜间模式', 'v2.3 §14.1：theme.js 不得改 #theme-toggle 文案')
})

testTheme('固定文案：v2.3 起 #theme-toggle 的 textContent 永不被改写（只更新 aria-pressed）', () => {
  const env = createThemeEnv({ docTheme: 'light' })
  env.toggleButton.textContent = '夜间模式'

  env.theme.apply('dark')
  assert.equal(env.toggleButton.textContent, '夜间模式', '切到深色时也不应改成「白天模式」')
  assert.equal(env.toggleButton.getAttribute('aria-pressed'), 'true')

  env.theme.toggle()
  assert.equal(env.toggleButton.textContent, '夜间模式', 'toggle 也不应改文案')
  assert.equal(env.readThemeAttr(), 'light')
  assert.equal(env.toggleButton.getAttribute('aria-pressed'), 'false')

  env.theme.init()
  assert.equal(env.toggleButton.textContent, '夜间模式', 'init 也不应改文案')
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

// ---------------------------------------------------------------- init（单页主题）

testTheme('init()：?theme=light 生效、写入 ss.theme、history.replaceState 去掉参数', () => {
  const env = createThemeEnv({ urlSearch: '?theme=light', docTheme: 'dark' })
  env.theme.init()

  assert.equal(env.readThemeAttr(), 'light', '?theme= 应优先于首屏已有主题')
  assert.equal(env.store.get('ss.theme'), 'light', '?theme= 应被持久化')
  assert.ok(env.history.calls.length >= 1, '应调用 history.replaceState 移除 theme 参数')

  const stringArgs = env.history.calls.flat().filter((arg) => typeof arg === 'string')
  assert.ok(
    stringArgs.every((arg) => !arg.includes('theme=')),
    `replaceState 的 URL 仍带 theme 参数：${JSON.stringify(stringArgs)}`,
  )
})

testTheme('init()：?theme=dark 优先于已存 light，且更新存储', () => {
  const env = createThemeEnv({ urlSearch: '?theme=dark', storedTheme: 'light' })
  env.theme.init()
  assert.equal(env.readThemeAttr(), 'dark')
  assert.equal(env.store.get('ss.theme'), 'dark')
})

testTheme('init()：?theme=light 优先于系统深色偏好', () => {
  const env = createThemeEnv({ urlSearch: '?theme=light', systemTheme: 'dark' })
  env.theme.init()
  assert.equal(env.readThemeAttr(), 'light')
})

testTheme('init()：无 ?theme 时按 data-theme-default="auto" 跟随系统偏好', () => {
  const dark = createThemeEnv({ defaultTheme: 'auto', systemTheme: 'dark' })
  dark.theme.init()
  assert.equal(dark.readThemeAttr(), 'dark')

  const light = createThemeEnv({ defaultTheme: 'auto', systemTheme: 'light' })
  light.theme.init()
  assert.equal(light.readThemeAttr(), 'light')
})

testTheme('init()：存储值优先于系统偏好（刷新保持）', () => {
  const env = createThemeEnv({ storedTheme: 'light', systemTheme: 'dark', defaultTheme: 'auto' })
  env.theme.init()
  assert.equal(env.readThemeAttr(), 'light')
})

testTheme('init()：history.replaceState 抛错时不崩', () => {
  const env = createThemeEnv({ urlSearch: '?theme=light', historyThrows: true })
  assert.doesNotThrow(() => env.theme.init())
  assert.equal(env.readThemeAttr(), 'light')
})

testTheme('init()：绑定 #theme-toggle 点击切换并持久化', () => {
  const env = createThemeEnv({ defaultTheme: 'auto', systemTheme: 'light' })
  env.theme.init()
  assert.equal(env.readThemeAttr(), 'light')

  env.toggleButton.fire('click')
  assert.equal(env.readThemeAttr(), 'dark')
  assert.equal(env.store.get('ss.theme'), 'dark')

  env.toggleButton.fire('click')
  assert.equal(env.readThemeAttr(), 'light')
})

// ---------------------------------------------------------------- v2.4 主题色（加分项，§15.1）

const EXPECTED_COLOR_IDS = [
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'grey',
  'blue-grey',
]

testTheme('CSS/API 形态：SS.theme 暴露 COLORS / applyColor / getColor / initColor', () => {
  const env = createThemeEnv()
  assert.ok(Array.isArray(env.theme.COLORS), 'SS.theme.COLORS 必须是数组')
  for (const name of ['applyColor', 'getColor', 'initColor']) {
    assert.equal(typeof env.theme[name], 'function', `SS.theme.${name} 必须是函数`)
  }
})

testTheme('SS.theme.COLORS：19 项、顺序与契约 §15.1 一致、id 唯一、label 非空', () => {
  const env = createThemeEnv()
  const colors = env.theme.COLORS
  assert.equal(colors.length, EXPECTED_COLOR_IDS.length, `COLORS 应为 ${EXPECTED_COLOR_IDS.length} 项`)
  assert.deepEqual(
    [...colors.map((color) => color.id)],
    EXPECTED_COLOR_IDS,
    'COLORS 顺序应与契约 §15.1 一致',
  )
  assert.equal(new Set(colors.map((color) => color.id)).size, colors.length, 'COLORS id 必须唯一')
  for (const color of colors) {
    assert.equal(typeof color.label, 'string', `颜色 ${color.id} 的 label 必须是字符串`)
    assert.ok(color.label.trim().length > 0, `颜色 ${color.id} 的 label 不能为空`)
  }
})

testTheme('applyColor(id)：写 <html data-color>', () => {
  const env = createThemeEnv()
  env.theme.applyColor('orange')
  assert.equal(env.readColorAttr(), 'orange')
  env.theme.applyColor('red')
  assert.equal(env.readColorAttr(), 'red')
})

testTheme('getColor()：存储优先，非法值/无值回退 indigo', () => {
  assert.equal(createThemeEnv().theme.getColor(), 'indigo')
  assert.equal(createThemeEnv({ storedColor: 'teal' }).theme.getColor(), 'teal')
  assert.equal(createThemeEnv({ storedColor: 'bogus' }).theme.getColor(), 'indigo')
})

testTheme('initColor()：读存储并应用；非法存储回退 indigo', () => {
  const teal = createThemeEnv({ storedColor: 'teal' })
  teal.theme.initColor()
  assert.equal(teal.readColorAttr(), 'teal')

  const invalid = createThemeEnv({ storedColor: 'bogus' })
  invalid.theme.initColor()
  assert.equal(invalid.readColorAttr(), 'indigo')
})

testTheme('init() 会应用存储的主题色', () => {
  const env = createThemeEnv({ storedColor: 'orange' })
  env.theme.init()
  assert.equal(env.readColorAttr(), 'orange')
})
