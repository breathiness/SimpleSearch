// 搜索核心（assets/js/search.js）契约测试：规范化、URL 编码矩阵、站点/默认引擎决策。
// 契约依据：docs/contract.md §5.1、§9 第 2 条。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic, makeTester } from './helpers/load.mjs'

const loaded = await loadClassic('sites', 'search')
const testIt = makeTester(loaded)
const { SS } = loaded
const search = loaded.ok ? SS.search : null

const TEMPLATE = 'https://example.com/s?q={q}'
const PREFIX = 'https://example.com/s?q='

testIt('normalizeQuery：去首尾空白', () => {
  assert.equal(search.normalizeQuery('  hello  '), 'hello')
  assert.equal(search.normalizeQuery('\t\n hello \r\n'), 'hello')
})

testIt('normalizeQuery：连续空白折叠为单个空格', () => {
  assert.equal(search.normalizeQuery('a   b'), 'a b')
  assert.equal(search.normalizeQuery('a\t\tb'), 'a b')
  assert.equal(search.normalizeQuery('a\n\n\nb'), 'a b')
  assert.equal(search.normalizeQuery('  a \t b  c '), 'a b c')
})

testIt('normalizeQuery：无空白 / 空串 / 全空白', () => {
  assert.equal(search.normalizeQuery('abc'), 'abc')
  assert.equal(search.normalizeQuery(''), '')
  assert.equal(search.normalizeQuery('   \t\n  '), '')
})

testIt('normalizeQuery：非字符串输入返回空串且不抛错', () => {
  for (const value of [null, undefined, 42, 0, true, false, {}, [], () => {}]) {
    assert.equal(
      search.normalizeQuery(value),
      '',
      `非字符串输入 ${String(value)} 应返回空串`,
    )
  }
})

testIt('buildUrl：URL 保留字符编码矩阵（& # + % = ? /）', () => {
  const cases = [
    ['a&b', 'a%26b'],
    ['c#d', 'c%23d'],
    ['a+b', 'a%2Bb'],
    ['100%', '100%25'],
    ['a=b?c/d', 'a%3Db%3Fc%2Fd'],
    ['a b', 'a%20b'],
  ]
  for (const [query, encoded] of cases) {
    assert.equal(
      search.buildUrl(TEMPLATE, query),
      PREFIX + encoded,
      `查询词 ${JSON.stringify(query)} 编码不正确`,
    )
  }
})

testIt('buildUrl：中文与 emoji 编码（encodeURIComponent 语义）', () => {
  assert.equal(
    search.buildUrl(TEMPLATE, '中文 空格'),
    PREFIX + '%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC',
  )
  assert.equal(search.buildUrl(TEMPLATE, '😀'), PREFIX + '%F0%9F%98%80')
})

testIt('buildUrl：换行 / 制表符不会以原样字符进入 URL', () => {
  for (const query of ['a\nb', 'a\tb', 'a\r\nb']) {
    const url = search.buildUrl(TEMPLATE, query)
    assert.ok(!/\s/.test(url), `URL 中不允许出现原始空白：${JSON.stringify(url)}`)
    const decoded = decodeURIComponent(url.slice(PREFIX.length))
    // 契约只要求「内部 encodeURIComponent」；是否顺带折叠空白由实现决定，两种都接受，
    // 但换行/制表符必须被保留为一个空白分隔，不能粘成 "ab"。
    assert.match(decoded, /^a\sb$/, `解码后应保留空白分隔，实际为 ${JSON.stringify(decoded)}`)
  }
})

testIt('buildUrl：模板缺少 {q} 抛 TypeError', () => {
  assert.throws(() => search.buildUrl('https://example.com/?q=', 'x'), TypeError)
  assert.throws(() => search.buildUrl('', 'x'), TypeError)
  assert.throws(() => search.buildUrl('https://example.com/no-placeholder', 'x'), TypeError)
})

testIt('resolveSite：未知 / 非法 siteId 返回 null', () => {
  for (const siteId of ['nope', '', 'GITHUB', null, undefined, 123, {}]) {
    assert.equal(
      search.resolveSite(siteId, 'keyword'),
      null,
      `未知 siteId ${JSON.stringify(siteId)} 应返回 null`,
    )
  }
})

testIt('resolveSite：空词 → nav 到站点首页', () => {
  const github = SS.sites.find((site) => site.id === 'github')
  for (const rawQuery of ['', '   ', '\t\n', undefined, null]) {
    assert.deepEqual(search.resolveSite('github', rawQuery), {
      kind: 'nav',
      url: github.home,
      siteId: 'github',
      query: '',
    })
  }
})

testIt('resolveSite：有词 → search 到站内搜索并正确编码', () => {
  for (const site of SS.sites) {
    const decision = search.resolveSite(site.id, '  a&b  ')
    assert.equal(decision.kind, 'search', `${site.id} 有词应为 search`)
    assert.equal(decision.siteId, site.id)
    assert.equal(decision.query, 'a&b')
    assert.equal(decision.url, site.search.replace('{q}', encodeURIComponent('a&b')))
  }
})

testIt('resolveDefault：空词 → Bing 首页 nav', () => {
  for (const rawQuery of ['', '   ', undefined]) {
    assert.deepEqual(search.resolveDefault(rawQuery), {
      kind: 'nav',
      url: 'https://www.bing.com',
      query: '',
    })
  }
})

testIt('resolveDefault：有词 → Bing 搜索，中文/空白正确编码', () => {
  assert.deepEqual(search.resolveDefault('  中文 空格 '), {
    kind: 'search',
    url: 'https://www.bing.com/search?q=%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC',
    query: '中文 空格',
  })
  assert.deepEqual(search.resolveDefault('a&b'), {
    kind: 'search',
    url: 'https://www.bing.com/search?q=a%26b',
    query: 'a&b',
  })
})

testIt('DEFAULT_ENGINE 为 bing', () => {
  assert.equal(search.DEFAULT_ENGINE, 'bing')
})

// §9 第 2 条：全部站点 ×（空词 / 普通词 / 特殊词）URL 与预期表一致。
testIt('回归矩阵：全部站点 × 特殊词，URL 一律由 encodeURIComponent 生成', () => {
  const rawCases = [
    ['空词', ''],
    ['全空白', '   '],
    ['普通词', 'simple search'],
    ['a&b', 'a&b'],
    ['c#d', 'c#d'],
    ['a+b', 'a+b'],
    ['100%', '100%'],
    ['中文 空格', '中文 空格'],
    ['emoji', '😀'],
    ['换行制表', 'a\nb\tc'],
  ]

  for (const site of SS.sites) {
    for (const [label, rawQuery] of rawCases) {
      const decision = search.resolveSite(site.id, rawQuery)
      assert.ok(decision, `${site.id} / ${label}：resolveSite 不应返回 null`)

      const normalized = typeof rawQuery === 'string'
        ? rawQuery.trim().replace(/\s+/g, ' ')
        : ''

      if (normalized === '') {
        assert.equal(decision.kind, 'nav', `${site.id} / ${label}：空词应为 nav`)
        assert.equal(decision.url, site.home, `${site.id} / ${label}：空词应跳 home`)
        continue
      }

      const expectedUrl = site.search.replace('{q}', encodeURIComponent(normalized))
      assert.equal(decision.kind, 'search', `${site.id} / ${label}：有词应为 search`)
      assert.equal(decision.query, normalized, `${site.id} / ${label}：query 未规范化`)
      assert.equal(decision.url, expectedUrl, `${site.id} / ${label}：URL 与预期不一致`)
      assert.ok(!/[\s]/.test(decision.url), `${site.id} / ${label}：URL 含原始空白`)
    }
  }
})
