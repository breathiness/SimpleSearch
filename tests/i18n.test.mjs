// v2.12 §23.3/§23.4 i18n 单测：词表一致性、t() 取值/回退/占位、语言解析优先级、apply() 应用到假 DOM。
// i18n.js 由 core-engine 交付；缺失时全部显式 skip。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { jsPath, hasRepo } from './helpers/load.mjs'

const missing = hasRepo('assets', 'js', 'i18n.js') ? [] : ['assets/js/i18n.js']
const skipReason = missing.length ? `等待交付：${missing.join('、')}` : null
const I18N_SOURCE = missing.length ? '' : fs.readFileSync(jsPath('i18n'), 'utf8')

function testI18n(name, fn) {
  test(name, skipReason ? { skip: skipReason } : {}, fn)
}

// ---------------------------------------------------------------- 工具

// 从源码里提取 `const NAME = [...]` 的字符串数组（KEYS/ZH/EN 是 IIFE 内平行数组，不对外导出）
function extractArray(source, name) {
  const declaration = source.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*\\[`))
  if (!declaration) return null
  const start = declaration.index + declaration[0].length - 1
  let depth = 0
  let quote = null
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') {
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) return vm.runInNewContext(`(${source.slice(start, i + 1)})`)
    }
  }
  return null
}

const KEYS = extractArray(I18N_SOURCE, 'KEYS')
const ZH = extractArray(I18N_SOURCE, 'ZH')
const EN = extractArray(I18N_SOURCE, 'EN')

function createElement(attrs = {}) {
  const map = new Map(Object.entries(attrs))
  return {
    textContent: '',
    attrs: map,
    getAttribute(name) {
      return map.has(name) ? map.get(name) : null
    },
    setAttribute(name, value) {
      map.set(name, String(value))
    },
  }
}

function createI18nEnv(options = {}) {
  const {
    urlSearch = '',
    href = `https://example.com/index.html${urlSearch}`,
    storedLang = null,
    navLang = 'zh-CN',
    texts = [],
    attrs = [],
    titles = [],
  } = options

  const store = new Map()
  if (storedLang !== null) store.set('ss.lang', storedLang)

  const localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }

  const history = {
    calls: [],
    replaceState(...args) {
      this.calls.push(args)
    },
  }
  const location = { search: urlSearch, href, pathname: '/index.html' }

  const textElements = texts.map((key) => createElement({ 'data-i18n': key }))
  const attrElements = attrs.map((spec) => createElement({ 'data-i18n-attr': spec }))
  const titleElements = titles.map((key) => createElement({ 'data-i18n-title': key }))
  const documentElement = createElement({})

  const document = {
    documentElement,
    title: '',
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return textElements
      if (selector === '[data-i18n-attr]') return attrElements
      if (selector === '[data-i18n-title]') return titleElements
      return []
    },
  }

  const sandbox = {
    SimpleSearch: {},
    localStorage,
    location,
    history,
    document,
    navigator: { language: navLang },
    URL,
  }
  const context = vm.createContext(sandbox)
  vm.runInContext(I18N_SOURCE, context, { filename: 'assets/js/i18n.js' })
  const i18n = context.SimpleSearch && context.SimpleSearch.i18n

  return { i18n, store, history, document, documentElement, textElements, attrElements, titleElements }
}

function expectedValue(table, key) {
  const index = KEYS.indexOf(key)
  assert.ok(index >= 0, `词表缺少 key：${key}`)
  return table[index]
}

// ---------------------------------------------------------------- 词表一致性

testI18n('i18n 词表：KEYS/ZH/EN 三个平行数组长度相等、KEYS 唯一且非空', () => {
  assert.ok(Array.isArray(KEYS), '无法从 i18n.js 解析 KEYS 数组')
  assert.ok(Array.isArray(ZH), '无法从 i18n.js 解析 ZH 数组')
  assert.ok(Array.isArray(EN), '无法从 i18n.js 解析 EN 数组')
  assert.ok(KEYS.length > 0, 'KEYS 不能为空')
  assert.equal(ZH.length, KEYS.length, 'ZH 长度应等于 KEYS')
  assert.equal(EN.length, KEYS.length, 'EN 长度应等于 KEYS')
  assert.equal(new Set(KEYS).size, KEYS.length, 'KEYS 不能有重复')
  for (const key of KEYS) assert.equal(typeof key, 'string')
  for (const value of ZH) assert.equal(typeof value, 'string')
  for (const value of EN) assert.equal(typeof value, 'string')
})

testI18n('t()：中文默认下 nav.all = 常用；setLang(en) 后 = Common', () => {
  const env = createI18nEnv()
  assert.equal(env.i18n.t('nav.all'), '常用')
  assert.equal(env.i18n.t('nav.all'), expectedValue(ZH, 'nav.all'))

  env.i18n.setLang('en')
  assert.equal(env.i18n.t('nav.all'), 'Common')
  assert.equal(env.i18n.t('nav.all'), expectedValue(EN, 'nav.all'))
})

testI18n('t()：未知 key 回退为 key 本身，不抛错', () => {
  const env = createI18nEnv()
  for (const key of ['nope.not-exist', '', 'nav.all.extra']) {
    assert.doesNotThrow(() => env.i18n.t(key))
    assert.equal(env.i18n.t(key), key)
  }
  assert.doesNotThrow(() => env.i18n.t(null))
})

testI18n('t()：{name} 占位替换（中文/英文）', () => {
  const env = createI18nEnv()

  assert.equal(env.i18n.t('hist.count', { n: 3 }), '3 条')
  assert.equal(env.i18n.t('panel.version', { v: '2.12.0' }), '简单搜索 v2.12.0')

  env.i18n.setLang('en')
  assert.equal(env.i18n.t('hist.count', { n: 3 }), '3 items')
  assert.equal(env.i18n.t('panel.version', { v: '2.12.0' }), 'SimpleSearch v2.12.0')

  // 未提供的占位符原样保留，不抛错
  assert.match(env.i18n.t('hist.count'), /\{n\}/)
})

// ---------------------------------------------------------------- 语言解析优先级

testI18n('getLang/init：无 URL/存储时按 navigator.language（zh* → zh，其余 → en）', () => {
  assert.equal(createI18nEnv({ navLang: 'zh-CN' }).i18n.init(), 'zh')
  assert.equal(createI18nEnv({ navLang: 'en-US' }).i18n.init(), 'en')
  assert.equal(createI18nEnv({ navLang: 'fr-FR' }).i18n.init(), 'en')
})

testI18n('语言优先级：?lang= > ss.lang > navigator', () => {
  // URL 优先于存储与 navigator，并持久化 + replaceState 去掉参数
  const fromUrl = createI18nEnv({ urlSearch: '?lang=en', href: 'https://example.com/index.html?lang=en', storedLang: 'zh', navLang: 'zh-CN' })
  assert.equal(fromUrl.i18n.init(), 'en')
  assert.equal(fromUrl.store.get('ss.lang'), 'en', '?lang= 应持久化到 ss.lang')
  assert.ok(fromUrl.history.calls.length >= 1, '?lang= 应调用 replaceState 去掉参数')
  const replaced = fromUrl.history.calls.flat().filter((arg) => typeof arg === 'string')
  assert.ok(replaced.every((url) => !url.includes('lang=')), `replaceState URL 仍带 lang：${JSON.stringify(replaced)}`)

  // 无 URL 时存储优先于 navigator
  const fromStore = createI18nEnv({ storedLang: 'zh', navLang: 'en-US' })
  assert.equal(fromStore.i18n.init(), 'zh')

  // 非法 ?lang= 被忽略，回退存储/navigator
  const invalid = createI18nEnv({ urlSearch: '?lang=fr', navLang: 'en-US' })
  assert.equal(invalid.i18n.init(), 'en')
})

testI18n('setLang：zh/en 持久化；非法值/auto 删除 ss.lang 并回退 detect', () => {
  const env = createI18nEnv({ navLang: 'zh-CN' })

  assert.equal(env.i18n.setLang('en'), 'en')
  assert.equal(env.store.get('ss.lang'), 'en')

  assert.equal(env.i18n.setLang('zh'), 'zh')
  assert.equal(env.store.get('ss.lang'), 'zh')

  // auto / 非法值：删除存储键，回退到 navigator
  assert.equal(env.i18n.setLang('auto'), 'zh')
  assert.equal(env.store.has('ss.lang'), false)
  assert.equal(env.i18n.setLang('fr'), 'zh')
  assert.equal(env.store.has('ss.lang'), false)
})

// ---------------------------------------------------------------- apply()

testI18n('apply()：处理 data-i18n（textContent）/data-i18n-attr（属性）/data-i18n-title，并更新 html lang 与 title', () => {
  const env = createI18nEnv({
    texts: ['nav.all', 'card.common', 'nope.key'],
    attrs: ['placeholder:search.placeholder', 'aria-label:search.aria'],
    titles: ['set.close'],
  })
  env.i18n.init()

  assert.equal(env.textElements[0].textContent, '常用')
  assert.equal(env.textElements[1].textContent, expectedValue(ZH, 'card.common'))
  assert.equal(env.textElements[2].textContent, 'nope.key', '缺 key 时 textContent 应回退为 key')

  assert.equal(env.attrElements[0].getAttribute('placeholder'), expectedValue(ZH, 'search.placeholder'))
  assert.equal(env.attrElements[1].getAttribute('aria-label'), expectedValue(ZH, 'search.aria'))
  assert.equal(env.titleElements[0].getAttribute('title'), expectedValue(ZH, 'set.close'))

  assert.equal(env.documentElement.getAttribute('lang'), 'zh-CN')
  assert.equal(env.document.title, expectedValue(ZH, 'app.title'))
})

testI18n('apply()：切换到英文后再次 apply，文案/属性/aria 与 <html lang> 变英文', () => {
  const env = createI18nEnv({
    texts: ['nav.all'],
    attrs: ['placeholder:search.placeholder'],
    titles: ['set.close'],
  })
  env.i18n.setLang('en')

  assert.equal(env.textElements[0].textContent, expectedValue(EN, 'nav.all'))
  assert.equal(env.attrElements[0].getAttribute('placeholder'), expectedValue(EN, 'search.placeholder'))
  assert.equal(env.titleElements[0].getAttribute('title'), expectedValue(EN, 'set.close'))
  assert.equal(env.documentElement.getAttribute('lang'), 'en')
  assert.equal(env.document.title, expectedValue(EN, 'app.title'))
})

testI18n('init()：?lang=en 时直接中英切换生效（apply 全体）', () => {
  const env = createI18nEnv({
    urlSearch: '?lang=en',
    href: 'https://example.com/index.html?lang=en',
    texts: ['nav.all'],
    navLang: 'zh-CN',
  })
  assert.equal(env.i18n.init(), 'en')
  assert.equal(env.textElements[0].textContent, 'Common')
  assert.equal(env.documentElement.getAttribute('lang'), 'en')
  assert.equal(env.i18n.getLang(), 'en')
})

testI18n('可选：apply(root) 支持传入 scope（只处理 scope 内节点）', () => {
  const env = createI18nEnv({ texts: ['nav.all'] })
  // 单独传入一个带 querySelectorAll 的 scope，确保不抛错且按 scope 处理
  const scoped = createElement()
  scoped.querySelectorAll = (selector) => (selector === '[data-i18n]' ? env.textElements : [])
  env.i18n.setLang('zh')
  assert.doesNotThrow(() => env.i18n.apply(scoped))
  assert.equal(env.textElements[0].textContent, '常用')
})
