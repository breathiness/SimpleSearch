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

// v2.2 §13.1：分组表顺序 = chip 渲染顺序；每个 site.group 必须存在于本表。
const EXPECTED_GROUP_IDS = ['tech', 'community', 'media', 'shopping', 'content']
const EXPECTED_GROUP_LABELS = {
  tech: '技术开发',
  community: '社区问答',
  media: '影音游戏',
  shopping: '购物',
  content: '素材资讯',
}

// v2.7 §18：在内置 11 站之后按此顺序追加 22 站（总计 33）
const EXPECTED_NEW_IDS = [
  // tech
  'stackoverflow',
  'mdn',
  'gitee',
  'npm',
  'juejin',
  // community
  'douban',
  'weibo',
  'v2ex',
  'reddit',
  // media
  'youtube',
  'douyin',
  'iqiyi',
  'vqq',
  'twitch',
  // shopping
  'tmall',
  'pinduoduo',
  'goofish',
  'amazon',
  // content
  'pexels',
  'pixabay',
  '36kr',
  'zcool',
]

testIt('SS.sites 是数组且站点总数 ≥ 30（v2.7 扩充到 33）', () => {
  assert.ok(Array.isArray(SS.sites), 'SS.sites 必须是数组')
  assert.ok(
    SS.sites.length >= 30,
    `站点总数应 ≥30（v2.7 目标 33），实际 ${SS.sites.length}；` +
      `内置站点被删除：${BUILTIN_IDS.filter((id) => !SS.sites.some((site) => site.id === id)).join(', ') || '（无）'}`,
  )
})

testIt('内置 11 站仍排在最前，v2.7 新增 22 站按契约 §18 顺序追加在后', () => {
  const ids = SS.sites.map((site) => site.id)
  assert.deepEqual(
    [...ids.slice(0, BUILTIN_IDS.length)],
    BUILTIN_IDS,
    '前 11 个必须仍是内置站点且相对顺序不变',
  )
  const appended = ids.slice(BUILTIN_IDS.length)
  assert.deepEqual(
    [...appended],
    EXPECTED_NEW_IDS,
    `新增站点应按契约 §18 顺序追加；期望 ${EXPECTED_NEW_IDS.length} 个，实际 ${appended.length} 个：${appended.join(', ')}`,
  )
})

testIt('v2.8 featured 标记：内置 11 站 featured===true，新增 22 站不带 featured', () => {
  const featured = SS.sites.filter((site) => site.featured === true)
  assert.equal(featured.length, BUILTIN_IDS.length, `featured 站点应恰好 ${BUILTIN_IDS.length} 个，实际 ${featured.length}`)
  assert.deepEqual(
    featured.map((site) => site.id).sort(),
    [...BUILTIN_IDS].sort(),
    'featured 站点应恰好是内置 11 站',
  )
  for (const site of SS.sites) {
    if (BUILTIN_IDS.includes(site.id)) {
      assert.equal(site.featured, true, `内置站点 ${site.id} 的 featured 应为 true`)
    } else {
      assert.ok(
        !Object.hasOwn(site, 'featured'),
        `v2.8 §19.1：新增站点 ${site.id} 不应带 featured 字段`,
      )
    }
  }
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

// ---------------------------------------------------------------- v2.2 站点分组（§13.1）

testIt('SS.siteGroups 存在：恰好 5 组，顺序与契约 §13.1 一致', () => {
  assert.ok(Array.isArray(SS.siteGroups), 'SS.siteGroups 必须是数组')
  assert.equal(SS.siteGroups.length, 5, '分组表必须恰好 5 项')
  assert.deepEqual(
    SS.siteGroups.map((group) => group.id),
    EXPECTED_GROUP_IDS,
    `分组顺序应与契约一致：期望 ${EXPECTED_GROUP_IDS.join(', ')}`,
  )
})

testIt('siteGroups：id 合法且唯一、label 非空', () => {
  const seen = new Set()
  for (const group of SS.siteGroups) {
    assert.equal(typeof group, 'object', '分组项必须是对象')
    assert.ok(group !== null, '分组项不能是 null')
    assert.match(String(group.id), /^[a-z0-9-]+$/, `分组 id 不合法：${JSON.stringify(group.id)}`)
    assert.ok(!seen.has(group.id), `分组 id 重复：${group.id}`)
    seen.add(group.id)
    assert.equal(typeof group.label, 'string', `分组 ${group.id} 的 label 必须是字符串`)
    assert.ok(group.label.trim().length > 0, `分组 ${group.id} 的 label 不能为空`)
    assert.equal(
      group.label,
      EXPECTED_GROUP_LABELS[group.id],
      `分组 ${group.id} 的 label 与契约 §13.1 不一致`,
    )
  }
})

testIt('每个站点 group 必填，且必须是 siteGroups 中的 id', () => {
  assert.ok(Array.isArray(SS.siteGroups), '缺少 SS.siteGroups，无法校验站点分组')
  const groupIds = SS.siteGroups.map((group) => group.id)
  for (const site of SS.sites) {
    assert.equal(typeof site.group, 'string', `站点 ${site.id} 缺少 group 字段（v2.2 必填）`)
    assert.ok(site.group.trim().length > 0, `站点 ${site.id} 的 group 不能为空`)
    assert.ok(
      groupIds.includes(site.group),
      `站点 ${site.id} 的 group=${JSON.stringify(site.group)} 不在 siteGroups 中（${groupIds.join(', ')}）`,
    )
  }
})

testIt('5 个分组每个至少有 3 个站点（v2.7 §18）', () => {
  assert.ok(Array.isArray(SS.siteGroups), '缺少 SS.siteGroups')
  const counts = new Map(SS.siteGroups.map((group) => [group.id, 0]))
  for (const site of SS.sites) {
    if (counts.has(site.group)) counts.set(site.group, counts.get(site.group) + 1)
  }
  const tooFew = [...counts.entries()].filter(([, count]) => count < 3).map(([id, count]) => `${id}(${count})`)
  assert.deepEqual(tooFew, [], `以下分组的站点数 <3：${tooFew.join(', ')}`)
})

testIt('内置站点的分组与契约 §13.1 示例一致', () => {
  const expectedGroups = {
    github: 'tech',
    unsplash: 'content',
    bilibili: 'media',
    sspai: 'content',
    moegirl: 'media',
    zhihu: 'community',
    tieba: 'community',
    taobao: 'shopping',
    jd: 'shopping',
    steam: 'media',
    archwiki: 'tech',
  }
  for (const site of SS.sites) {
    if (!Object.hasOwn(expectedGroups, site.id)) continue
    assert.equal(
      site.group,
      expectedGroups[site.id],
      `内置站点 ${site.id} 的 group 应为 ${expectedGroups[site.id]}，实际为 ${JSON.stringify(site.group)}`,
    )
  }
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

testIt('每个站点 keywords 必须是非空字符串数组（v2.7 §18 新站必填）', () => {
  for (const site of SS.sites) {
    assert.ok(Array.isArray(site.keywords), `站点 ${site.id} 缺少 keywords 数组（v2.7 必填）`)
    assert.ok(site.keywords.length > 0, `站点 ${site.id} 的 keywords 不能为空`)
    for (const keyword of site.keywords) {
      assert.equal(typeof keyword, 'string', `${site.id} 的 keyword 必须是字符串：${JSON.stringify(keyword)}`)
      assert.ok(keyword.trim().length > 0, `${site.id} 存在空 keyword`)
    }
  }
})

testIt('可选字段 icon：若存在必须是非空合法 symbol 名', () => {
  for (const site of SS.sites) {
    if (!Object.hasOwn(site, 'icon')) continue
    assert.equal(typeof site.icon, 'string', `站点 ${site.id} 的 icon 必须是字符串`)
    assert.match(site.icon, /^[a-z][a-z0-9-]*$/, `站点 ${site.id} 的 icon 非法：${JSON.stringify(site.icon)}`)
  }
})

testIt('SS.engines：4 个搜索引擎（bing/google/ddg/baidu），每个含 id/label/search/search.param', () => {
  assert.equal(typeof SS.engines, 'object')
  const expectedIds = ['bing', 'google', 'ddg', 'baidu']
  assert.deepEqual(
    Object.keys(SS.engines).sort(),
    [...expectedIds].sort(),
    `搜索引擎应为 ${expectedIds.join(', ')}`,
  )

  for (const id of expectedIds) {
    const engine = SS.engines[id]
    assert.ok(engine && typeof engine === 'object', `缺少引擎 ${id}`)
    assert.equal(engine.id, id, `引擎 ${id} 的 id 字段不匹配`)
    assert.equal(typeof engine.label, 'string', `引擎 ${id} 的 label 必须是字符串`)
    assert.ok(engine.label.trim().length > 0, `引擎 ${id} 的 label 不能为空`)
    assert.match(engine.search, /^https:\/\//, `引擎 ${id} 的 search 必须 https`)
    assert.ok(engine.search.includes('{q}'), `引擎 ${id} 的 search 必须含 {q}`)
    assert.equal(typeof engine.param, 'string', `引擎 ${id} 缺少 param（表单查询参数名）`)
    assert.match(engine.param, /^[a-z][a-z0-9_]*$/i, `引擎 ${id} 的 param 非法：${engine.param}`)
  }

  assert.equal(SS.engines.bing.param, 'q', 'bing 的 param 应为 q')
  assert.equal(SS.engines.google.param, 'q', 'google 的 param 应为 q')
  assert.equal(SS.engines.ddg.param, 'q', 'ddg 的 param 应为 q')
  assert.equal(SS.engines.baidu.param, 'wd', 'baidu 的 param 应为 wd')
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
