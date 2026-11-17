// v2.12 §23.1 命令面板纯函数单测：SS.palette.isSubsequence / matchSites / matchCommands。
// palette.js 由 input-ux 交付；缺失时显式 skip。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic, makeTester } from './helpers/load.mjs'

const loaded = await loadClassic('sites', 'palette')
const testIt = makeTester(loaded)
const SS = loaded.ok ? loaded.SS : null
const palette = loaded.ok ? SS.palette : null

function fakeSite(id, label, keywords = []) {
  return {
    id,
    label,
    home: 'https://example.com',
    search: 'https://example.com/?q={q}',
    group: 'tech',
    keywords,
  }
}

function ids(list) {
  return list.map((item) => item.id)
}

// ---------------------------------------------------------------- API 形态

testIt('SS.palette 暴露纯匹配函数：isSubsequence / matchSites / matchCommands', () => {
  assert.ok(palette, 'SS.palette 不存在')
  assert.equal(typeof palette.isSubsequence, 'function')
  assert.equal(typeof palette.matchSites, 'function')
  assert.equal(typeof palette.matchCommands, 'function')
})

// ---------------------------------------------------------------- isSubsequence

testIt('isSubsequence：子序列判定（大小写不敏感、空查询恒真）', () => {
  assert.equal(palette.isSubsequence('gh', 'github'), true)
  assert.equal(palette.isSubsequence('gh', 'gitlab'), false)
  assert.equal(palette.isSubsequence('hub', 'github'), true)
  assert.equal(palette.isSubsequence('GH', 'GitHub'), true, '应大小写不敏感')
  assert.equal(palette.isSubsequence('', 'anything'), true, '空查询应为 true')
  assert.equal(palette.isSubsequence('zzz', 'github'), false)
})

// ---------------------------------------------------------------- matchSites

testIt('matchSites：前缀优先于包含/子序列', () => {
  const sites = [
    fakeSite('github', 'GitHub', ['代码']),
    fakeSite('gitlab', 'GitLab'),
    fakeSite('digital', 'Digital'),
    fakeSite('zhihu', '知乎', ['问答']),
  ]
  const result = palette.matchSites('git', sites)
  assert.deepEqual(ids(result).slice(0, 2), ['github', 'gitlab'], '前缀命中的 Git* 应排在最前')
  assert.ok(ids(result).includes('digital'), 'digital 应作为包含/子序列命中')
  assert.ok(ids(result).indexOf('digital') > 1, '包含/子序列命中应排在前缀命中之后')
})

testIt('matchSites：子序列命中（gh → GitHub）', () => {
  const sites = [fakeSite('github', 'GitHub'), fakeSite('digital', 'Digital')]
  const result = palette.matchSites('gh', sites)
  assert.deepEqual(ids(result), ['github'])
})

testIt('matchSites：中文 label 与 keywords 命中', () => {
  const sites = [
    fakeSite('zhihu', '知乎', ['问答']),
    fakeSite('github', 'GitHub', ['代码', '开源']),
  ]
  assert.deepEqual(ids(palette.matchSites('知乎', sites)), ['zhihu'])
  const byKeyword = ids(palette.matchSites('代码', sites))
  assert.ok(byKeyword.includes('github'), `中文 keyword 应命中：${JSON.stringify(byKeyword)}`)
})

testIt('matchSites：无匹配返回空数组；非法输入不抛错', () => {
  const sites = [fakeSite('github', 'GitHub')]
  assert.deepEqual(palette.matchSites('zzzz', sites), [])
  assert.doesNotThrow(() => palette.matchSites('git', null))
  assert.doesNotThrow(() => palette.matchSites('git', undefined))
  assert.deepEqual(palette.matchSites('git', [{ noId: true }, null]), [])
})

testIt('matchSites：结果上限 8 条', () => {
  const sites = Array.from({ length: 12 }, (_, index) => fakeSite(`site-${index}`, `Site ${index}`))
  const result = palette.matchSites('site', sites)
  assert.ok(result.length <= 8, `matchSites 结果应 ≤8，实际 ${result.length}`)
  assert.equal(result.length, 8, '候选足够时应填满 8 条上限')
})

// ---------------------------------------------------------------- matchCommands

testIt('matchCommands：空查询返回全部命令（保持原顺序）', () => {
  const commands = [
    { id: 'open-settings', label: 'Open settings' },
    { id: 'toggle-theme', label: 'Toggle theme' },
    { id: 'open-sites', label: 'My sites' },
  ]
  assert.deepEqual(ids(palette.matchCommands('', commands)), ['open-settings', 'toggle-theme', 'open-sites'])
  assert.deepEqual(ids(palette.matchCommands('   ', commands)), ['open-settings', 'toggle-theme', 'open-sites'])
})

testIt('matchCommands：前缀优先 + 包含/子序列命中', () => {
  const commands = [
    { id: 'open-settings', label: 'Open settings' },
    { id: 'toggle-theme', label: 'Toggle theme' },
    { id: 'open-sites', label: 'My sites' },
    { id: 'clear-history', label: 'Clear history' },
  ]
  const prefixed = ids(palette.matchCommands('sett', commands))
  assert.equal(prefixed[0], 'open-settings', '前缀命中应排第一')

  const subsequence = ids(palette.matchCommands('the', commands))
  assert.ok(subsequence.includes('toggle-theme'), `子序列/包含应命中 toggle-theme：${JSON.stringify(subsequence)}`)
})

testIt('matchCommands：中文文案命中、无匹配返回空数组、非法输入不抛错', () => {
  const commands = [
    { id: 'zh-settings', label: '打开设置' },
    { id: 'zh-theme', label: '切换主题' },
  ]
  assert.equal(ids(palette.matchCommands('设置', commands))[0], 'zh-settings')
  assert.deepEqual(palette.matchCommands('zzzz', commands), [])
  assert.doesNotThrow(() => palette.matchCommands('x', null))
  assert.deepEqual(palette.matchCommands('x', [null, {}]), [])
})
