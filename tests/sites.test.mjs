// 站点注册表（assets/js/sites.js）契约测试：单一数据源的结构、顺序与 URL 合法性。
// 契约依据：docs/contract.md §4.1、§4.2。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic, makeTester } from './helpers/load.mjs'

const loaded = await loadClassic('sites')
const testIt = makeTester(loaded)
const { SS } = loaded

// §4.1 内置 11 站，顺序即按钮渲染顺序。
// 口径（lead 2026-11-10 调整）：README 教用户「在 assets/js/sites.js 加一条 + npm run build」，
// 因此测试不能因为用户追加站点就变红：
//   - 内置 11 个 id 必须全部存在（删除内置站点才红）；
//   - 内置站点之间的相对顺序必须与契约一致（允许用户在任意位置插入新站点）；
//   - 站点总数下限为 11，不再要求恰好 11。
const BUILTIN_IDS = [
  'github',
  'unsplash',
  'bilibili',
  'sspai',
  'moegirl',
  'zhihu',
  'tieba',
  'taobao',
  'jd',
  'steam',
  'archwiki',
]

testIt('SS.sites 是数组且至少包含全部内置站点', () => {
  assert.ok(Array.isArray(SS.sites), 'SS.sites 必须是数组')
  assert.ok(
    SS.sites.length >= BUILTIN_IDS.length,
    `站点数量至少应有 ${BUILTIN_IDS.length} 个（内置站点），实际 ${SS.sites.length} 个。` +
      `内置站点被删除：${BUILTIN_IDS.filter((id) => !SS.sites.some((site) => site.id === id)).join(', ')}，` +
      '请从 assets/js/sites.js 恢复，或同步更新 tests/sites.test.mjs 的 BUILTIN_IDS',
  )
})

testIt('内置站点全部存在，且相对顺序与契约 §4.1 一致（允许追加新站点）', () => {
  const ids = SS.sites.map((site) => site.id)
  const missing = BUILTIN_IDS.filter((id) => !ids.includes(id))
  assert.deepEqual(
    missing,
    [],
    `内置站点被删除：${missing.join(', ')}。请恢复，或同步更新 tests/sites.test.mjs 的 BUILTIN_IDS`,
  )

  // 过滤掉用户追加的站点后，内置站点的相对顺序必须与契约一致
  const builtinOrder = ids.filter((id) => BUILTIN_IDS.includes(id))
  assert.deepEqual(
    builtinOrder,
    BUILTIN_IDS,
    `内置站点相对顺序与契约不一致。\n        期望：${BUILTIN_IDS.join(', ')}\n        实际：${builtinOrder.join(', ')}`,
  )
})

testIt('站点 id 合法（小写 [a-z0-9-]）且唯一', () => {
  const seen = new Set()
  for (const site of SS.sites) {
    assert.equal(typeof site.id, 'string', `id 必须是字符串：${JSON.stringify(site.id)}`)
    assert.match(site.id, /^[a-z0-9-]+$/, `id 不合法：${site.id}`)
    assert.ok(!seen.has(site.id), `id 重复：${site.id}`)
    seen.add(site.id)
  }
})

testIt('每个站点都是完整对象：id / label / home / search', () => {
  for (const site of SS.sites) {
    assert.equal(typeof site, 'object', '站点项必须是对象')
    assert.ok(site !== null, '站点项不能是 null')
    assert.equal(typeof site.label, 'string', `${site.id} 的 label 必须是字符串`)
    assert.ok(site.label.trim().length > 0, `${site.id} 的 label 不能为空`)
    assert.equal(typeof site.home, 'string', `${site.id} 的 home 必须是字符串`)
    assert.equal(typeof site.search, 'string', `${site.id} 的 search 必须是字符串`)
  }
})

testIt('home / search 均为 https://', () => {
  for (const site of SS.sites) {
    assert.match(site.home, /^https:\/\//, `${site.id} 的 home 必须 https：${site.home}`)
    assert.match(site.search, /^https:\/\//, `${site.id} 的 search 必须 https：${site.search}`)
  }
})

testIt('search 模板含 {q} 占位符', () => {
  for (const site of SS.sites) {
    assert.ok(site.search.includes('{q}'), `${site.id} 的 search 缺少 {q}：${site.search}`)
  }
})

testIt('Unsplash 搜索地址使用修正后的 /s/photos/{q}', () => {
  const unsplash = SS.sites.find((site) => site.id === 'unsplash')
  assert.ok(unsplash, '缺少 unsplash 站点')
  assert.equal(unsplash.search, 'https://unsplash.com/s/photos/{q}')
})

testIt('keywords 若存在必须是字符串数组（允许空数组）', () => {
  for (const site of SS.sites) {
    if (!Object.hasOwn(site, 'keywords')) continue
    assert.ok(Array.isArray(site.keywords), `${site.id} 的 keywords 必须是数组`)
    for (const keyword of site.keywords) {
      assert.equal(typeof keyword, 'string', `${site.id} 的 keyword 必须是字符串：${JSON.stringify(keyword)}`)
      assert.ok(keyword.trim().length > 0, `${site.id} 存在空 keyword`)
    }
  }
})

testIt('SS.engines.bing 定义完整且默认引擎为 bing', () => {
  assert.equal(typeof SS.engines, 'object')
  assert.ok(SS.engines && SS.engines.bing, '缺少 SS.engines.bing')
  const bing = SS.engines.bing
  assert.equal(bing.id, 'bing')
  assert.ok(typeof bing.label === 'string' && bing.label.trim().length > 0)
  assert.match(bing.search, /^https:\/\//, 'Bing search 必须 https')
  assert.ok(bing.search.includes('{q}'), 'Bing search 必须含 {q}')
  assert.equal(SS.defaultEngine, 'bing', 'SS.defaultEngine 必须是 bing')
})

testIt('注册表不携带主题字段（单一数据源，不允许 Light/Dark 漂移）', () => {
  for (const site of SS.sites) {
    for (const key of Object.keys(site)) {
      assert.ok(
        !/theme|dark|light/i.test(key),
        `${site.id} 出现主题相关字段 ${key}，违反单一数据源`,
      )
    }
  }
})
