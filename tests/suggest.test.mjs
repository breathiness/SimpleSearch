// 联想（assets/js/suggest.js）契约测试：纯函数 getItems(rawQuery, opts)，不碰 DOM、默认完全离线。
// 契约依据：docs/contract.md §5.2。
// 实现未交付时全部用例显式 skip，交付后自动跑真值。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic, makeTester } from './helpers/load.mjs'

const loaded = await loadClassic('sites', 'suggest')
const testIt = makeTester(loaded)
const { SS } = loaded
const suggest = loaded.ok ? SS.suggest : null

const ALLOWED_TYPES = new Set(['engine', 'site', 'history'])

// 注入用的假站点：不依赖真实注册表，验证 opts.sites 覆盖生效。
function fakeSites() {
  return [
    {
      id: 'fa',
      label: 'FakeA',
      home: 'https://a.example',
      search: 'https://a.example/?q={q}',
      keywords: ['购物', 'alpha'],
    },
    {
      id: 'fb',
      label: 'FakeB',
      home: 'https://b.example',
      search: 'https://b.example/?q={q}',
      keywords: ['购物', 'beta'],
    },
    {
      id: 'fc',
      label: 'FakeC',
      home: 'https://c.example',
      search: 'https://c.example/?q={q}',
      keywords: ['gamma'],
    },
  ]
}

function items(query, opts) {
  return suggest.getItems(query, opts)
}

function byType(list, type) {
  return list.filter((item) => item.type === type)
}

function textOf(item) {
  return `${item.label || ''} ${item.sublabel || ''}`
}

function assertShape(list, context) {
  assert.ok(Array.isArray(list), `${context}：返回值必须是数组`)
  for (const item of list) {
    assert.ok(item && typeof item === 'object', `${context}：建议项必须是对象`)
    assert.ok(ALLOWED_TYPES.has(item.type), `${context}：未知 type ${JSON.stringify(item.type)}`)
    assert.equal(typeof item.label, 'string', `${context}：label 必须是字符串`)
    assert.ok(item.label.trim().length > 0, `${context}：label 不能为空`)
    assert.equal(typeof item.sublabel, 'string', `${context}：sublabel 必须是字符串（契约 item 结构）`)
  }
}

testIt('空 query：返回「历史 + 站点」且结构合法、不含 engine 项', () => {
  const list = items('', { history: ['h1', 'h2'], sites: fakeSites() })
  assertShape(list, '空 query')
  assert.equal(byType(list, 'engine').length, 0, '空 query 不应出现 engine 项')

  const labels = byType(list, 'history').map((item) => item.label)
  assert.ok(labels.includes('h1'), `历史项缺少 h1：${JSON.stringify(labels)}`)
  assert.ok(labels.includes('h2'), `历史项缺少 h2：${JSON.stringify(labels)}`)

  const siteIds = byType(list, 'site').map((item) => item.siteId)
  for (const id of ['fa', 'fb', 'fc']) {
    assert.ok(siteIds.includes(id), `站点项缺少注入的 ${id}：${JSON.stringify(siteIds)}`)
  }
})

testIt('非空 query：首项是 engine 项，文案含查询词与 Bing', () => {
  const list = items('  购物  ', { history: [], sites: fakeSites() })
  assertShape(list, '非空 query')
  assert.ok(list.length > 0, '非空 query 至少应给出 engine 项')
  assert.equal(list[0].type, 'engine', '首项必须是 engine 项')
  assert.equal(list[0].siteId, undefined, 'engine 项不应带 siteId')

  const text = textOf(list[0])
  assert.match(text, /购物/, `engine 项文案应包含查询词：${JSON.stringify(text)}`)
  assert.match(text, /bing/i, `engine 项文案应指明 Bing：${JSON.stringify(text)}`)
})

testIt('非空 query：按关键词匹配到站点', () => {
  const list = items('购物', { history: [], sites: fakeSites() })
  const siteIds = byType(list, 'site').map((item) => item.siteId)
  assert.ok(siteIds.includes('fa'), `缺少关键词匹配的 fa：${JSON.stringify(siteIds)}`)
  assert.ok(siteIds.includes('fb'), `缺少关键词匹配的 fb：${JSON.stringify(siteIds)}`)
  assert.ok(!siteIds.includes('fc'), `gamma 站不应命中「购物」：${JSON.stringify(siteIds)}`)
})

testIt('非空 query：历史匹配项被保留', () => {
  const list = items('zzzz', { history: ['zzzz', 'other'], sites: fakeSites() })
  const historyLabels = byType(list, 'history').map((item) => item.label)
  assert.ok(historyLabels.includes('zzzz'), `应保留匹配的历史项：${JSON.stringify(historyLabels)}`)
  assert.ok(!historyLabels.includes('other'), `不应保留不匹配的历史项：${JSON.stringify(historyLabels)}`)
})

testIt('最多 8 条（默认 max 与注入 max 都生效）', () => {
  const manyHistory = Array.from({ length: 12 }, (_, i) => `history-${i}`)
  const manySites = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i}`,
    label: `Site${i}`,
    home: 'https://example.com',
    search: 'https://example.com/?q={q}',
    keywords: [`kw${i}`],
  }))

  assert.ok(
    items('', { history: manyHistory, sites: manySites }).length <= 8,
    '空 query 时不应超过默认上限 8 条',
  )
  assert.ok(
    items('x', { history: manyHistory, sites: manySites }).length <= 8,
    '非空 query 时不应超过默认上限 8 条',
  )
  assert.equal(
    items('', { history: manyHistory, sites: manySites }).length,
    8,
    '候选足够时应填满默认上限 8 条',
  )

  const limited = items('', { history: manyHistory, sites: manySites, max: 2 })
  assert.ok(limited.length <= 2, `注入 max:2 后应不超过 2 条，实际 ${limited.length}`)
  assert.ok(limited.length > 0, '注入 max:2 后不应为空')
})

testIt('同一 siteId 不重复出现（label 与 keyword 同时命中只算一次）', () => {
  const duplicated = [
    {
      id: 'dup',
      label: 'DupSite',
      home: 'https://dup.example',
      search: 'https://dup.example/?q={q}',
      keywords: ['DupSite', 'dup'],
    },
  ]
  const list = items('DupSite', { history: [], sites: duplicated })
  const siteIds = byType(list, 'site').map((item) => item.siteId)
  assert.equal(siteIds.length, 1, `同 siteId 应去重，实际：${JSON.stringify(siteIds)}`)
  assert.equal(siteIds[0], 'dup')

  const many = items('购物', { history: [], sites: fakeSites() })
  const ids = byType(many, 'site').map((item) => item.siteId)
  assert.equal(new Set(ids).size, ids.length, `站点项出现重复 siteId：${JSON.stringify(ids)}`)
})

testIt('opts 注入可覆盖 sites / history / max', () => {
  const injectedSites = fakeSites()

  // sites 覆盖：只出现注入站点，真实注册表的 github 等不应出现
  const emptyQuery = items('', { history: [], sites: injectedSites })
  const siteIds = byType(emptyQuery, 'site').map((item) => item.siteId)
  assert.deepEqual([...new Set(siteIds)].sort(), ['fa', 'fb', 'fc'])
  assert.ok(!siteIds.includes('github'), '注入 sites 后不应混入真实注册表站点')

  // history 覆盖：只出现注入历史
  const historyQuery = items('', { history: ['注入的历史词'], sites: [] })
  const historyLabels = byType(historyQuery, 'history').map((item) => item.label)
  assert.deepEqual(historyLabels, ['注入的历史词'])
})

testIt('无匹配时安全返回（不抛错，engine 项仍在）', () => {
  const list = items('没有匹配的关键词xyz', { history: [], sites: fakeSites() })
  assertShape(list, '无匹配')
  assert.equal(list[0].type, 'engine')
  assert.equal(byType(list, 'site').length, 0)
})

testIt('opts 完全省略时使用默认值：读 SS.sites、历史为空、不上网', () => {
  const list = suggest.getItems('')
  assertShape(list, '默认 opts')
  assert.ok(list.length > 0, '默认 opts 下空 query 应给出站点建议')
  assert.ok(list.length <= 8)
  const siteIds = byType(list, 'site').map((item) => item.siteId)
  assert.ok(siteIds.includes('github'), '默认 opts 应回退到 SS.sites 注册表')
})
