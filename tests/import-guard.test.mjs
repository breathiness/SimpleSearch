// v2.11 §22.4 导入大小上限守卫单测：SS.sitesStore.parseImport 的 1,000,000 字符保护。
// 契约：`text.length > 1_000_000` 时拒绝（不得抛异常）；恰好 1,000,000 字符的合法 JSON 仍可解析。
// files: assets/js/sites-store.js（input-ux）；缺失时显式 skip。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic } from './helpers/load.mjs'

const loaded = await loadClassic('sites', 'sites-store')
const store = loaded.ok ? loaded.SS.sitesStore : null

function testImport(name, fn) {
  test(name, loaded.ok ? {} : { skip: loaded.skipReason }, fn)
}

const MAX_LENGTH = 1_000_000

// 构造「恰好 length 个字符」的合法导入 JSON（通过 settings.pad 填充，settings 内容不参与 20.1 校验）
function buildConfigText(length) {
  const base = {
    app: 'SimpleSearch',
    schema: 1,
    customSites: [],
    order: [],
    settings: { pad: '' },
  }
  const stubLength = JSON.stringify(base).length // pad:'' 时的长度
  const padLength = length - stubLength
  assert.ok(padLength >= 0, `目标长度 ${length} 小于最小 JSON 长度 ${stubLength}`)
  const config = {
    app: 'SimpleSearch',
    schema: 1,
    customSites: [],
    order: [],
    settings: { pad: 'x'.repeat(padLength) },
  }
  const text = JSON.stringify(config)
  assert.equal(text.length, length, '构造的 JSON 长度必须精确等于目标')
  return text
}

testImport('parseImport：超长文本（1,000,001 字符）→ {ok:false} 且不抛异常', () => {
  const text = buildConfigText(MAX_LENGTH + 1)
  let result
  assert.doesNotThrow(() => {
    result = store.parseImport(text)
  })
  assert.equal(result.ok, false, '超过 1,000,000 字符应被拒绝')
  assert.equal(typeof result.error, 'string')
  assert.ok(result.error.length > 0)
})

testImport('parseImport：1,000,001 个非 JSON 字符 → {ok:false} 且不抛异常', () => {
  const text = 'x'.repeat(MAX_LENGTH + 1)
  let result
  assert.doesNotThrow(() => {
    result = store.parseImport(text)
  })
  assert.equal(result.ok, false)
  assert.equal(typeof result.error, 'string')
})

testImport('parseImport：恰好 1,000,000 字符的合法 JSON → ok:true（阈值是 > 才拒绝）', () => {
  const text = buildConfigText(MAX_LENGTH)
  const result = store.parseImport(text)
  assert.equal(result.ok, true, `恰好上限应可解析：${JSON.stringify(result).slice(0, 200)}`)
  assert.equal(result.data.app, 'SimpleSearch')
  assert.equal(result.data.schema, 1)
})

testImport('parseImport：999,999 字符的合法 JSON → ok:true（边界内）', () => {
  const text = buildConfigText(MAX_LENGTH - 1)
  const result = store.parseImport(text)
  assert.equal(result.ok, true)
  assert.equal(result.data.app, 'SimpleSearch')
})

testImport('parseImport：普通小配置仍可解析（回归）', () => {
  const text = buildConfigText(200)
  const result = store.parseImport(text)
  assert.equal(result.ok, true)
  assert.deepEqual([...result.data.customSites], [])
})
