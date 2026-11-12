// v2.9 §20.1 数据层单测：SS.sitesStore（纯函数 + 注入 storage）。
// 契约依据：docs/contract.md §20.1、§20.5。
// assets/js/sites-store.js 由 input-ux 交付；文件缺失时全部用例显式 skip，交付后自动跑真值。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic } from './helpers/load.mjs'

const loaded = await loadClassic('sites', 'sites-store')
const SS = loaded.ok ? loaded.SS : null
const store = loaded.ok ? SS.sitesStore : null

function testStore(name, fn) {
  test(name, loaded.ok ? {} : { skip: loaded.skipReason }, fn)
}

// ---------------------------------------------------------------- 测试工具

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
    raw(key) {
      return map.get(key)
    },
    dump() {
      return map
    },
  }
}

function makeSite(overrides = {}) {
  return {
    label: '测试站',
    home: 'https://example.com',
    search: 'https://example.com/search?q={q}',
    group: 'tech',
    keywords: ['测试', 'test'],
    ...overrides,
  }
}

function customIdList(storage) {
  const raw = storage.getItem(store.CUSTOM_KEY)
  if (!raw) return []
  return JSON.parse(raw).map((site) => site.id)
}

// ---------------------------------------------------------------- 模块 API

testStore('SS.sitesStore 暴露契约要求的常量与方法', () => {
  assert.ok(store, 'SS.sitesStore 不存在')
  assert.equal(store.CUSTOM_KEY, 'ss.customSites')
  assert.equal(store.ORDER_KEY, 'ss.order')
  assert.equal(store.MAX_CUSTOM, 100)
  for (const name of [
    'normalizeSite',
    'listCustom',
    'saveCustom',
    'addCustom',
    'updateCustom',
    'removeCustom',
    'getOrder',
    'saveOrder',
    'merge',
    'applyOrder',
    'exportConfig',
    'serializeConfig',
    'parseImport',
  ]) {
    assert.equal(typeof store[name], 'function', `SS.sitesStore.${name} 必须是函数`)
  }
})

// ---------------------------------------------------------------- normalizeSite

testStore('normalizeSite：合法站点（中文 label/keywords、https、含 {q}）通过', () => {
  const result = store.normalizeSite(
    makeSite({ label: '  我的站点  ', keywords: ['中文', 'keyword'] }),
  )
  assert.equal(result.ok, true, `应通过：${JSON.stringify(result)}`)
  assert.ok(result.site, 'result.site 缺失')
  assert.equal(result.site.label, '我的站点')
  assert.equal(result.site.home, 'https://example.com')
  assert.equal(result.site.search, 'https://example.com/search?q={q}')
  assert.equal(result.site.group, 'tech')
  assert.deepEqual([...result.site.keywords], ['中文', 'keyword'])
  assert.equal(typeof result.site.featured, 'boolean')
})

testStore('normalizeSite：home 非 https → {ok:false,error}', () => {
  for (const home of ['http://example.com', 'ftp://example.com', 'example.com', '']) {
    const result = store.normalizeSite(makeSite({ home }))
    assert.equal(result.ok, false, `home=${JSON.stringify(home)} 应被拒绝`)
    assert.equal(typeof result.error, 'string')
    assert.ok(result.error.length > 0)
    assert.ok(!result.site)
  }
})

testStore('normalizeSite：search 非 https 或缺 {q} → {ok:false,error}', () => {
  const cases = [
    'http://example.com/?q={q}',
    'https://example.com/search',
    'https://example.com/search?q=',
  ]
  for (const search of cases) {
    const result = store.normalizeSite(makeSite({ search }))
    assert.equal(result.ok, false, `search=${JSON.stringify(search)} 应被拒绝`)
    assert.equal(typeof result.error, 'string')
  }
})

testStore('normalizeSite：label 空 / 超长 → {ok:false,error}', () => {
  for (const label of ['', '   ', 'x'.repeat(200)]) {
    const result = store.normalizeSite(makeSite({ label }))
    assert.equal(result.ok, false, `label=${JSON.stringify(label).slice(0, 30)} 应被拒绝`)
    assert.equal(typeof result.error, 'string')
  }
})

testStore('normalizeSite：group 必须存在于 SS.siteGroups', () => {
  const invalid = store.normalizeSite(makeSite({ group: 'nope' }))
  assert.equal(invalid.ok, false)
  assert.equal(typeof invalid.error, 'string')

  for (const group of SS.siteGroups.map((item) => item.id)) {
    const result = store.normalizeSite(makeSite({ group }))
    assert.equal(result.ok, true, `合法 group ${group} 应通过`)
    assert.equal(result.site.group, group)
  }
})

testStore('normalizeSite：keywords 非数组/非字符串时应拒绝或安全归一化', () => {
  const bad = store.normalizeSite(makeSite({ keywords: 42 }))
  assert.equal(bad.ok, false, 'keywords=42 应被拒绝')

  const badObject = store.normalizeSite(makeSite({ keywords: { a: 1 } }))
  assert.equal(badObject.ok, false, 'keywords 对象应被拒绝')
})

testStore('normalizeSite：keywords 自动 split / 去重 / 最多 8 个', () => {
  const spaced = store.normalizeSite(makeSite({ keywords: 'alias 别名 alias  测试' }))
  assert.equal(spaced.ok, true, `字符串 keywords 应自动 split：${JSON.stringify(spaced)}`)
  assert.deepEqual([...spaced.site.keywords], ['alias', '别名', '测试'])

  const many = Array.from({ length: 12 }, (_, index) => `kw${index}`)
  const limited = store.normalizeSite(makeSite({ keywords: many }))
  assert.equal(limited.ok, true)
  assert.ok(limited.site.keywords.length <= 8, `keywords 应 ≤8，实际 ${limited.site.keywords.length}`)

  const dup = store.normalizeSite(makeSite({ keywords: ['a', 'a', 'b', 'A'] }))
  assert.equal(dup.ok, true)
  assert.equal(new Set(dup.site.keywords).size, dup.site.keywords.length, 'keywords 应去重')
})

testStore('normalizeSite：icon 仅保留合法 symbol 名，非法值丢弃', () => {
  const valid = store.normalizeSite(makeSite({ icon: 'cat-tech' }))
  assert.equal(valid.ok, true)
  assert.equal(valid.site.icon, 'cat-tech')

  for (const icon of ['bad name!', '<script>', 42, '']) {
    const result = store.normalizeSite(makeSite({ icon }))
    if (result.ok) {
      assert.ok(
        result.site.icon === undefined || result.site.icon === null,
        `非法 icon ${JSON.stringify(icon)} 应被丢弃，实际 ${JSON.stringify(result.site.icon)}`,
      )
    }
  }
})

// ---------------------------------------------------------------- add / list / update / remove

testStore('addCustom：自动生成 custom-N id，写入并可 listCustom 读回', () => {
  const storage = createStorage()
  const first = store.addCustom(storage, makeSite({ label: '站点一' }))
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.match(first.site.id, /^custom-\d+$/, `自动 id 格式不对：${first.site.id}`)

  const second = store.addCustom(storage, makeSite({ label: '站点二' }))
  assert.equal(second.ok, true)
  assert.notEqual(second.site.id, first.site.id, '自动 id 不能冲突')

  const list = store.listCustom(storage)
  assert.equal(list.length, 2)
  assert.deepEqual([...list.map((site) => site.label)], ['站点一', '站点二'])
})

testStore('addCustom：id 与已有站点冲突时自动加序号', () => {
  const storage = createStorage()
  storage.setItem(
    store.CUSTOM_KEY,
    JSON.stringify([{ ...makeSite({ label: '已存在' }), id: 'custom-1' }]),
  )
  const added = store.addCustom(storage, makeSite({ label: '新站点' }))
  assert.equal(added.ok, true)
  assert.notEqual(added.site.id, 'custom-1', 'id 冲突时应自动换新 id')
  assert.equal(store.listCustom(storage).length, 2)
})

testStore('addCustom：达到 MAX_CUSTOM 后拒绝', () => {
  const storage = createStorage()
  const list = []
  for (let index = 1; index <= store.MAX_CUSTOM; index += 1) {
    list.push({ ...makeSite(), id: `custom-${index}`, label: `站点${index}` })
  }
  storage.setItem(store.CUSTOM_KEY, JSON.stringify(list))
  const result = store.addCustom(storage, makeSite({ label: '超量站点' }))
  assert.equal(result.ok, false, '超过 MAX_CUSTOM 应拒绝')
  assert.equal(typeof result.error, 'string')
})

testStore('listCustom：坏 JSON / 非数组 → 空数组；非法项被丢弃', () => {
  for (const bad of ['{oops', 'not-json', '{}', 'null', '42', '"str"']) {
    const storage = createStorage({ [store.CUSTOM_KEY]: bad })
    assert.doesNotThrow(() => store.listCustom(storage))
    assert.deepEqual(store.listCustom(storage), [], `坏数据 ${bad} 应返回空数组`)
  }

  const storage = createStorage()
  storage.setItem(
    store.CUSTOM_KEY,
    JSON.stringify([
      { ...makeSite({ label: '合法站' }), id: 'custom-1' },
      { id: 'bad', label: '', home: 'http://x', search: 'nope', group: 'nope' },
    ]),
  )
  const list = store.listCustom(storage)
  assert.deepEqual([...list.map((site) => site.label)], ['合法站'], '非法项应被丢弃')
})

testStore('updateCustom：更新字段但 id 不变；不存在的 id 返回 ok:false', () => {
  const storage = createStorage()
  const added = store.addCustom(storage, makeSite({ label: '旧名字' }))
  const id = added.site.id

  const updated = store.updateCustom(storage, id, makeSite({ label: '新名字', group: 'media' }))
  assert.equal(updated.ok, true, JSON.stringify(updated))
  assert.equal(updated.site.id, id, 'update 不应改 id')
  const list = store.listCustom(storage)
  assert.equal(list.length, 1)
  assert.equal(list[0].label, '新名字')
  assert.equal(list[0].group, 'media')

  const missing = store.updateCustom(storage, 'custom-not-exist', makeSite())
  assert.equal(missing.ok, false, '更新不存在的 id 应失败')
  assert.equal(typeof missing.error, 'string')
})

testStore('removeCustom：删除存在项返回 true；删除不存在项返回 false 不崩', () => {
  const storage = createStorage()
  const added = store.addCustom(storage, makeSite({ label: '待删除' }))
  assert.equal(store.removeCustom(storage, added.site.id), true)
  assert.equal(store.listCustom(storage).length, 0)

  assert.doesNotThrow(() => store.removeCustom(storage, 'custom-not-exist'))
  assert.equal(store.removeCustom(storage, 'custom-not-exist'), false)
})

testStore('saveCustom：合法列表持久化并返回 boolean', () => {
  const storage = createStorage()
  const list = [
    { ...makeSite({ label: '甲' }), id: 'custom-1' },
    { ...makeSite({ label: '乙', group: 'media' }), id: 'custom-2' },
  ]
  assert.equal(typeof store.saveCustom(storage, list), 'boolean')
  const readBack = store.listCustom(storage)
  assert.deepEqual([...readBack.map((site) => site.label)], ['甲', '乙'])
})

// ---------------------------------------------------------------- order / merge / applyOrder

testStore('getOrder：坏 JSON / 非数组 → []；合法数组原样返回', () => {
  for (const bad of ['{oops', 'not-json', '{}', 'null', '42']) {
    const storage = createStorage({ [store.ORDER_KEY]: bad })
    assert.deepEqual(store.getOrder(storage), [], `坏数据 ${bad} 应返回空数组`)
  }
  const storage = createStorage({ [store.ORDER_KEY]: JSON.stringify(['b', 'a']) })
  assert.deepEqual(store.getOrder(storage), ['b', 'a'])
})

testStore('saveOrder：持久化 id 数组并可读回', () => {
  const storage = createStorage()
  assert.equal(typeof store.saveOrder(storage, ['github', 'jd']), 'boolean')
  assert.deepEqual(store.getOrder(storage), ['github', 'jd'])
})

testStore('merge：内置在前（保持原顺序），自定义追加在后', () => {
  const builtin = [{ id: 'a' }, { id: 'b' }]
  const custom = [{ id: 'custom-1' }, { id: 'custom-2' }]
  const merged = store.merge(builtin, custom)
  assert.deepEqual([...merged.map((site) => site.id)], ['a', 'b', 'custom-1', 'custom-2'])
})

testStore('applyOrder：order 中的 id 前置，其余保持相对顺序，未知 id 忽略', () => {
  const sites = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  assert.deepEqual(
    [...store.applyOrder(sites, ['c', 'a']).map((site) => site.id)],
    ['c', 'a', 'b', 'd'],
  )
  assert.deepEqual(
    [...store.applyOrder(sites, ['zzz', 'c']).map((site) => site.id)],
    ['c', 'a', 'b', 'd'],
  )
  assert.deepEqual([...store.applyOrder(sites, []).map((site) => site.id)], ['a', 'b', 'c', 'd'])
})

// ---------------------------------------------------------------- export / serialize / import

testStore('exportConfig：返回契约结构（app/schema/customSites/order/settings）', () => {
  const storage = createStorage()
  store.addCustom(storage, makeSite({ label: '导出站' }))
  store.saveOrder(storage, ['github'])
  const config = store.exportConfig(storage, { theme: 'dark', engine: 'google' })

  assert.equal(config.app, 'SimpleSearch')
  assert.equal(config.schema, 1)
  assert.ok(typeof config.version === 'string' && config.version.length > 0, 'version 必须存在')
  assert.ok(Array.isArray(config.customSites), 'customSites 必须是数组')
  assert.equal(config.customSites.length, 1)
  assert.deepEqual(config.customSites[0].label, '导出站')
  assert.deepEqual([...config.order], ['github'])
  assert.deepEqual({ ...config.settings }, { theme: 'dark', engine: 'google' })
})

testStore('serializeConfig → parseImport 往返：字段保持一致', () => {
  const storage = createStorage()
  store.addCustom(storage, makeSite({ label: '往返站', group: 'media', keywords: ['往返'] }))
  store.saveOrder(storage, ['github', 'jd'])
  const config = store.exportConfig(storage, { theme: 'light' })
  const text = store.serializeConfig(config)
  assert.equal(typeof text, 'string')

  const parsed = store.parseImport(text)
  assert.equal(parsed.ok, true, JSON.stringify(parsed))
  const data = parsed.data
  assert.equal(data.app, 'SimpleSearch')
  assert.equal(data.schema, 1)
  assert.equal(data.customSites.length, 1)
  assert.equal(data.customSites[0].label, '往返站')
  assert.equal(data.customSites[0].group, 'media')
  assert.deepEqual([...data.order], ['github', 'jd'])
  assert.deepEqual({ ...data.settings }, { theme: 'light' })
})

testStore('parseImport：坏 JSON / 坏 app / 坏 schema / 非数组 / 超量 → ok:false', () => {
  const validConfig = {
    app: 'SimpleSearch',
    schema: 1,
    version: '2.9.0',
    customSites: [],
    order: [],
    settings: {},
  }
  const cases = [
    ['坏 JSON', '{oops'],
    ['空字符串', ''],
    ['坏 app', JSON.stringify({ ...validConfig, app: 'Other' })],
    ['坏 schema', JSON.stringify({ ...validConfig, schema: 2 })],
    ['customSites 非数组', JSON.stringify({ ...validConfig, customSites: 'nope' })],
    [
      '超量',
      JSON.stringify({
        ...validConfig,
        customSites: Array.from({ length: store.MAX_CUSTOM + 1 }, (_, index) => ({
          ...makeSite({ label: `站${index}` }),
          id: `custom-${index + 1}`,
        })),
      }),
    ],
  ]
  for (const [label, text] of cases) {
    const result = store.parseImport(text)
    assert.equal(result.ok, false, `${label} 应被拒绝`)
    assert.equal(typeof result.error, 'string')
  }
})

testStore('parseImport：包内含非法站点 → 整包拒绝', () => {
  const config = {
    app: 'SimpleSearch',
    schema: 1,
    customSites: [
      { ...makeSite({ label: '好的' }), id: 'custom-1' },
      { id: 'custom-2', label: '', home: 'http://bad', search: 'nope', group: 'nope' },
    ],
    order: [],
    settings: {},
  }
  const result = store.parseImport(JSON.stringify(config))
  assert.equal(result.ok, false, '任一非法站点应拒绝整包')
  assert.equal(typeof result.error, 'string')
})

testStore('parseImport：只做 JSON.parse，不执行任何代码（无副作用）', () => {
  globalThis.__ss_store_pwned = undefined
  const payload = {
    app: 'SimpleSearch',
    schema: 1,
    customSites: [
      {
        id: 'x',
        label: '<script>globalThis.__ss_store_pwned = 1</script>',
        home: 'https://example.com',
        search: 'https://example.com/?q={q}',
        group: 'tech',
      },
    ],
    order: [],
    settings: {},
  }
  assert.doesNotThrow(() => store.parseImport(JSON.stringify(payload)))
  assert.equal(globalThis.__ss_store_pwned, undefined, 'parseImport 不得执行 payload 中的代码')
  delete globalThis.__ss_store_pwned
})
