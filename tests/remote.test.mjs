// 联网联想（assets/js/remote.js，v2.1 新增）契约测试。
// 契约依据：docs/contract.md §5.6、§9.7、§12.2。
//
// 全部在 node:vm 里跑：用假 document 注入 script + 手动触发 JSONP 全局回调，
// 精确记录「发了几次请求 / 请求 URL / 超时 / 关闭时是否零请求」，不碰真实网络。
// 实现未交付时全部用例显式 skip，交付后自动跑真值。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { jsPath, hasRepo } from './helpers/load.mjs'

const missing = hasRepo('assets', 'js', 'remote.js') ? [] : ['assets/js/remote.js']
const skipReason = missing.length ? `等待交付：${missing.join('、')}` : null
const REMOTE_SOURCE = missing.length ? '' : fs.readFileSync(jsPath('remote'), 'utf8')

const BAIDU_PREFIX = 'https://suggestion.baidu.com/'

function testRemote(name, fn) {
  test(name, skipReason ? { skip: skipReason } : {}, fn)
}

// vm 里创建的数组属于另一个 realm，assert.deepStrictEqual 会以「原型不同」拒绝；
// 转成宿主数组再比较（元素都是字符串，spread 足够）。
function assertWords(actual, expected, message) {
  assert.ok(Array.isArray(actual), `${message || '返回值'}：应为数组`)
  assert.deepEqual([...actual], expected, message)
}

// ---------------------------------------------------------------- 假环境

function createStorage(initial = {}, throwing = false) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      if (throwing) throw new Error('storage 不可用')
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      if (throwing) throw new Error('storage 不可用')
      store.set(key, String(value))
    },
    removeItem(key) {
      if (throwing) throw new Error('storage 不可用')
      store.delete(key)
    },
    dump: () => store,
  }
}

// 假的 <script>：支持 property 赋值（script.src = ...）与 setAttribute 两种写法。
function createScriptElement(tagName) {
  const listeners = {}
  return {
    tagName: String(tagName).toUpperCase(),
    attrs: {},
    src: '',
    textContent: '',
    parentNode: null,
    removed: false,
    listeners,
    setAttribute(name, value) {
      const key = String(name).toLowerCase()
      this.attrs[key] = String(value)
      if (key === 'src') this.src = String(value)
    },
    getAttribute(name) {
      return this.attrs[String(name).toLowerCase()] ?? null
    },
    remove() {
      this.removed = true
    },
    addEventListener(type, handler) {
      listeners[type] = handler
    },
  }
}

function createRemoteEnv(options = {}) {
  const { storage: initialStorage = {}, storageThrows = false } = options

  const store = createStorage(initialStorage, storageThrows)
  const localStorage = store

  // 记录所有被注入的 JSONP script；callbackName 从 URL 的 cb/callback 参数解析。
  const pending = []

  function makeAppender(parent) {
    return function appendChild(node) {
      node.parentNode = parent
      node.removed = false
      parent.children.push(node)

      const url = String(node.src || node.attrs.src || '')
      let callbackName = ''
      try {
        const parsed = new URL(url, BAIDU_PREFIX)
        callbackName =
          parsed.searchParams.get('cb') ||
          parsed.searchParams.get('callback') ||
          parsed.searchParams.get('jsonp') ||
          ''
      } catch {
        callbackName = ''
      }
      pending.push({ node, url, callbackName })
      return node
    }
  }

  const head = { children: [], appendChild: null, removeChild: null }
  const body = { children: [], appendChild: null, removeChild: null }
  head.appendChild = makeAppender(head)
  body.appendChild = makeAppender(body)
  const makeRemoveChild = (parent) => (node) => {
    node.removed = true
    parent.children = parent.children.filter((child) => child !== node)
    return node
  }
  head.removeChild = makeRemoveChild(head)
  body.removeChild = makeRemoveChild(body)

  let removedViaParent = 0
  function markRemoved(node) {
    node.removed = true
    removedViaParent += 1
    return node
  }

  const document = {
    createElement(tagName) {
      const node = createScriptElement(tagName)
      const originalRemove = node.remove.bind(node)
      node.remove = () => {
        markRemoved(node)
        originalRemove()
      }
      return node
    },
    head,
    body,
    documentElement: {
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = String(value)
      },
      getAttribute(name) {
        return this.attrs[name] ?? null
      },
    },
  }

  const sandbox = {
    SimpleSearch: {},
    document,
    localStorage,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    AbortController,
    URL,
    URLSearchParams,
    location: { search: '', href: 'https://example.com/index.html' },
    history: { replaceState() {} },
  }
  const context = vm.createContext(sandbox)
  vm.runInContext(REMOTE_SOURCE, context, { filename: 'assets/js/remote.js' })

  const remote = context.SimpleSearch && context.SimpleSearch.remote

  return {
    remote,
    sandbox,
    pending,
    store,
    /** 取最近一个待响应请求并触发它的 JSONP 全局回调。payload 用真实 JSONP 回包对象。 */
    completeLatest(payload, index = pending.length - 1) {
      const entry = pending[index]
      assert.ok(entry, '没有待响应的 JSONP 请求')
      const callback = sandbox[entry.callbackName]
      assert.equal(
        typeof callback,
        'function',
        `JSONP 全局回调 ${entry.callbackName} 未注册到全局（真实浏览器里会 ReferenceError）`,
      )
      callback(payload)
      return entry
    },
    get removedCount() {
      return removedViaParent
    },
  }
}

// ---------------------------------------------------------------- 模块形态

testRemote('SS.remote 暴露契约要求的字段', () => {
  const env = createRemoteEnv()
  assert.ok(env.remote, 'SS.remote 不存在')
  assert.equal(env.remote.KEY, 'ss.remote')
  for (const name of ['enabled', 'setEnabled', 'fetch']) {
    assert.equal(typeof env.remote[name], 'function', `SS.remote.${name} 必须是函数`)
  }
  assert.ok(env.remote.provider, 'SS.remote.provider 不存在')
  assert.equal(env.remote.provider.id, 'baidu')
  assert.equal(env.remote.provider.label, '百度')
  assert.equal(typeof env.remote.provider.buildUrl, 'function')
  assert.equal(typeof env.remote.provider.parse, 'function')
})

testRemote('assets/js/remote.js 是经典脚本（module-shape 的 glob 覆盖确认）', () => {
  const files = fs.readdirSync(new URL('../assets/js/', import.meta.url)).filter((f) => f.endsWith('.js'))
  assert.ok(files.includes('remote.js'), 'assets/js/remote.js 不存在')
  // 真正严格的经典脚本解析在 module-shape.test.mjs 里（vm.Script 全目录扫描），这里只确认覆盖。
})

// ---------------------------------------------------------------- provider.buildUrl

testRemote('provider.buildUrl：百度 JSONP URL + 正确 encodeURIComponent + 回调名', () => {
  const env = createRemoteEnv()
  const url = env.remote.provider.buildUrl('中文 词', 'ss_suggest_7')
  assert.match(url, /^https:\/\/suggestion\.baidu\.com\//, `provider 域名不对：${url}`)
  assert.ok(url.includes(`wd=${encodeURIComponent('中文 词')}`), `query 未正确编码：${url}`)
  assert.ok(url.includes('cb=ss_suggest_7'), `回调名未注入：${url}`)

  const amp = env.remote.provider.buildUrl('a&b', 'ss_suggest_9')
  assert.ok(amp.includes('a%26b'), `& 未编码：${amp}`)
  assert.ok(!amp.includes('wd=a&b'), '& 未编码会截断参数')
})

// ---------------------------------------------------------------- provider.parse

testRemote('provider.parse：百度 JSONP 回包 → 词数组', () => {
  const env = createRemoteEnv()
  assertWords(env.remote.provider.parse('cb({"q":"x","p":false,"s":["a","b"]})'), ['a', 'b'])
  assertWords(env.remote.provider.parse('cb({"q":"x","p":false,"s":["a","b"]});'), ['a', 'b'])
})

testRemote('provider.parse：纯 JSON 回包也可解析', () => {
  const env = createRemoteEnv()
  assertWords(env.remote.provider.parse('{"q":"x","s":["a","b"]}'), ['a', 'b'])
})

testRemote('provider.parse：字段缺失 / s 非数组 / 垃圾文本 → []，不抛', () => {
  const env = createRemoteEnv()
  const inputs = [
    'cb({"q":"x","p":false})',
    'cb({"s":null})',
    'cb({"s":"not-array"})',
    'cb()',
    '[]',
    'not json at all',
    '',
    '   ',
    'cb({"s":[',
  ]
  for (const input of inputs) {
    let result
    assert.doesNotThrow(() => {
      result = env.remote.provider.parse(input)
    }, `parse 不应抛错：${JSON.stringify(input)}`)
    assertWords(result, [], `parse 应返回空数组：${JSON.stringify(input)}`)
  }
})

testRemote('provider.parse：过滤非字符串 / 超长（>100）项', () => {
  const env = createRemoteEnv()
  const long = 'x'.repeat(101)
  const parsed = env.remote.provider.parse(
    `cb({"s":["short", 42, null, {"a":1}, "${long}", "tail"]})`,
  )
  assertWords(parsed, ['short', 'tail'])
  for (const item of parsed) {
    assert.equal(typeof item, 'string')
    assert.ok(item.length <= 100, `超长项未被过滤：${item.length}`)
  }
})

// ---------------------------------------------------------------- enabled / setEnabled

testRemote('enabled / setEnabled：默认 on，写存储，读非法值按 on', () => {
  const env = createRemoteEnv()
  assert.equal(env.remote.enabled(), true, 'ss.remote 缺省应视为 on')

  assert.equal(env.remote.setEnabled(false), false)
  assert.equal(env.store.dump().get('ss.remote'), 'off')
  assert.equal(env.remote.enabled(), false)

  assert.equal(env.remote.setEnabled(true), true)
  assert.equal(env.store.dump().get('ss.remote'), 'on')
  assert.equal(env.remote.enabled(), true)
})

testRemote('enabled：非法存储值 / 存储抛异常时按 on 处理且不崩', () => {
  const invalid = createRemoteEnv({ storage: { 'ss.remote': 'maybe' } })
  assert.equal(invalid.remote.enabled(), true)

  const broken = createRemoteEnv({ storageThrows: true })
  assert.doesNotThrow(() => broken.remote.enabled())
  assert.equal(broken.remote.enabled(), true)
  assert.doesNotThrow(() => broken.remote.setEnabled(false))
  assert.equal(typeof broken.remote.setEnabled(false), 'boolean')
})

// ---------------------------------------------------------------- fetch

testRemote('fetch：正常 JSONP 返回词，请求 URL 正确且用完清理 script/回调', async () => {
  const env = createRemoteEnv()
  const promise = env.remote.fetch('中文 词', { timeout: 500 })

  assert.equal(env.pending.length, 1, '应注入 1 个 JSONP script')
  const entry = env.pending[0]
  assert.match(entry.url, /^https:\/\/suggestion\.baidu\.com\//, `请求未发往百度：${entry.url}`)
  assert.ok(entry.url.includes(`wd=${encodeURIComponent('中文 词')}`), `query 未编码：${entry.url}`)
  assert.match(entry.callbackName, /^ss_suggest_\d+$/, `回调名格式不对：${entry.callbackName}`)

  env.completeLatest({ q: '中文 词', p: false, s: ['词一', '词二'] })
  const result = await promise

  assertWords(result, ['词一', '词二'])
  assert.equal(entry.node.removed, true, '结果返回后应删除 script 标签')
  assert.equal(env.sandbox[entry.callbackName], undefined, '结果返回后应删除全局回调')
})

testRemote('fetch：关闭时（ss.remote=off）不发任何请求且 resolve([])', async () => {
  const env = createRemoteEnv({ storage: { 'ss.remote': 'off' } })
  const result = await env.remote.fetch('任意词', { timeout: 500 })
  assertWords(result, [])
  assert.equal(env.pending.length, 0, '关闭联网联想后不得注入任何 JSONP script')
})

testRemote('fetch：空 query 不发请求且 resolve([])', async () => {
  const env = createRemoteEnv()
  for (const query of ['', '   ', '\t\n', null, undefined, 42]) {
    const result = await env.remote.fetch(query, { timeout: 500 })
    assertWords(result, [], `空词 ${JSON.stringify(query)} 应返回 []`)
  }
  assert.equal(env.pending.length, 0, '空词不得发请求')
})

testRemote('fetch：超时后 resolve([]) 且清理 script/回调', async () => {
  const env = createRemoteEnv()
  const start = Date.now()
  const result = await env.remote.fetch('超时词', { timeout: 30 })
  const elapsed = Date.now() - start

  assertWords(result, [], '超时应静默降级为空数组')
  assert.ok(elapsed >= 25, `应等待配置的 timeout，实际 ${elapsed}ms`)
  assert.equal(env.pending.length, 1)
  const entry = env.pending[0]
  assert.equal(entry.node.removed, true, '超时后应删除 script 标签')
  assert.equal(env.sandbox[entry.callbackName], undefined, '超时后应删除全局回调')
})

testRemote('fetch：同一词并发只发一次请求，两个调用共享结果', async () => {
  const env = createRemoteEnv()
  const first = env.remote.fetch('并发词', { timeout: 500 })
  const second = env.remote.fetch('并发词', { timeout: 500 })
  assert.equal(env.pending.length, 1, '同词并发不应重复注入 script')

  env.completeLatest({ q: '并发词', p: false, s: ['x', 'y'] })
  const [a, b] = await Promise.all([first, second])
  assertWords(a, ['x', 'y'])
  assertWords(b, ['x', 'y'])
})

testRemote('fetch：缓存命中不再发请求（10 分钟内）', async () => {
  const env = createRemoteEnv()
  const first = env.remote.fetch('缓存词', { timeout: 500 })
  env.completeLatest({ q: '缓存词', p: false, s: ['a', 'b'] })
  assertWords(await first, ['a', 'b'])
  const requestsAfterFirst = env.pending.length

  const second = await env.remote.fetch('缓存词', { timeout: 500 })
  assertWords(second, ['a', 'b'], '缓存命中应返回同一结果')
  assert.equal(env.pending.length, requestsAfterFirst, '缓存命中不应再注入 script')
})

testRemote('fetch：结果去重 + limit（默认 5 / 可覆盖）', async () => {
  const env = createRemoteEnv()
  const promise = env.remote.fetch('去重词', { timeout: 500 })
  env.completeLatest({ q: '去重词', p: false, s: ['a', 'a', 'b', 'c', 'd', 'e', 'f'] })
  assertWords(await promise, ['a', 'b', 'c', 'd', 'e'], '默认 limit=5 且去重')

  const limited = createRemoteEnv()
  const promise2 = limited.remote.fetch('限制词', { timeout: 500, limit: 2 })
  limited.completeLatest({ q: '限制词', p: false, s: ['a', 'a', 'b', 'c'] })
  assertWords(await promise2, ['a', 'b'], 'limit 可覆盖且去重在前')
})

testRemote('fetch：过滤非字符串 / 超长项，永不 reject', async () => {
  const env = createRemoteEnv()
  const promise = env.remote.fetch('过滤词', { timeout: 500 })
  const long = 'x'.repeat(101)
  env.completeLatest({ q: '过滤词', p: false, s: ['ok', 42, null, 'second', long] })
  const result = await promise

  assert.ok(Array.isArray(result))
  assertWords(result, ['ok', 'second'])
  for (const item of result) {
    assert.equal(typeof item, 'string')
    assert.ok(item.length <= 100)
  }
})

testRemote('fetch：失败/异常回包也 resolve([])，不 reject', async () => {
  const env = createRemoteEnv()
  const promise = env.remote.fetch('坏回包', { timeout: 500 })
  env.completeLatest({ q: '坏回包', p: false, s: 'not-an-array' })
  const result = await promise
  assertWords(result, [])
})
