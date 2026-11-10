// 搜索历史（assets/js/history.js）契约测试：注入内存 fake storage，验证去重置顶 / 上限 / 容错。
// 契约依据：docs/contract.md §4.3、§5.3。
// 实现未交付时全部用例显式 skip，交付后自动跑真值。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic, makeTester } from './helpers/load.mjs'

const loaded = await loadClassic('history')
const testIt = makeTester(loaded)
const { SS } = loaded
const history = loaded.ok ? SS.history : null

// storage 只需 getItem/setItem；额外提供 removeItem 以兼容可能实现。
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
  }
}

// 模拟隐私模式 / 禁用 localStorage：任何访问都抛异常。
function createThrowingStorage() {
  return {
    getItem() {
      throw new Error('storage 不可用')
    },
    setItem() {
      throw new Error('storage 不可用')
    },
    removeItem() {
      throw new Error('storage 不可用')
    },
  }
}

function create(initial) {
  return history.create(createStorage(initial))
}

testIt('SS.history.KEY 为 ss.history', () => {
  assert.equal(history.KEY, 'ss.history')
})

testIt('create(storage) 返回 list/add/remove/clear 四个方法', () => {
  const store = create()
  assert.equal(typeof store.list, 'function')
  assert.equal(typeof store.add, 'function')
  assert.equal(typeof store.remove, 'function')
  assert.equal(typeof store.clear, 'function')
})

testIt('初始 list() 为空数组', () => {
  assert.deepEqual(create().list(), [])
})

testIt('add 去重、置顶、返回最新列表', () => {
  const store = create()
  assert.deepEqual(store.add('a'), ['a'])
  assert.deepEqual(store.add('b'), ['b', 'a'])
  // 重复词应移到最前而不是重复出现
  assert.deepEqual(store.add('a'), ['a', 'b'])
  assert.deepEqual(store.list(), ['a', 'b'])
})

testIt('add 最多保留 10 条（新的在前，最旧的被丢弃）', () => {
  const store = create()
  const all = []
  for (let i = 1; i <= 12; i += 1) {
    const word = `q${i}`
    all.push(word)
    store.add(word)
  }
  const list = store.list()
  assert.equal(list.length, 10)
  // 12 条里最新 10 条 = q12..q3
  assert.deepEqual(list, all.slice(-10).reverse())
  assert.ok(!list.includes('q1'))
  assert.ok(!list.includes('q2'))
})

testIt('remove 删除指定词；删除不存在的词不抛错', () => {
  const store = create()
  store.add('a')
  store.add('b')
  store.add('c')
  assert.deepEqual(store.remove('b'), ['c', 'a'])
  assert.deepEqual(store.list(), ['c', 'a'])
  assert.doesNotThrow(() => store.remove('not-exist'))
  assert.deepEqual(store.list(), ['c', 'a'])
})

testIt('clear 清空历史', () => {
  const store = create()
  store.add('a')
  store.add('b')
  store.clear()
  assert.deepEqual(store.list(), [])
})

testIt('读写会落到注入的 storage（另一个实例能读回）', () => {
  const storage = createStorage()
  const first = history.create(storage)
  first.add('持久化')
  const second = history.create(storage)
  assert.deepEqual(second.list(), ['持久化'])
})

testIt('storage 抛异常时不崩（读取返回空、写入静默失败）', () => {
  const store = history.create(createThrowingStorage())
  assert.doesNotThrow(() => store.list())
  assert.ok(Array.isArray(store.list()))
  assert.deepEqual(store.list(), [])
  assert.doesNotThrow(() => store.add('x'))
  assert.doesNotThrow(() => store.remove('x'))
  assert.doesNotThrow(() => store.clear())
})

testIt('存量数据损坏（非法 JSON）时读取不崩，视为空历史', () => {
  for (const bad of ['{oops', 'not-json', '{}', 'null', '42', '"str"']) {
    const store = create({ 'ss.history': bad })
    assert.doesNotThrow(() => store.list(), `损坏数据 ${bad} 不应抛错`)
    assert.deepEqual(store.list(), [], `损坏数据 ${bad} 应视为空历史`)
  }
})

testIt('存量数据为非字符串数组（含非字符串元素）时过滤，不崩', () => {
  const store = create({ 'ss.history': JSON.stringify(['ok', 42, null, '', '  ']) })
  assert.doesNotThrow(() => store.list())
  const list = store.list()
  assert.ok(Array.isArray(list))
  for (const item of list) {
    assert.equal(typeof item, 'string', '历史项必须是字符串')
    assert.ok(item.trim().length > 0, '历史项不应为空字符串')
  }
  assert.deepEqual(list, ['ok'])
})

testIt('add 之后覆盖损坏的存量数据', () => {
  const store = create({ 'ss.history': '{oops' })
  assert.deepEqual(store.add('fresh'), ['fresh'])
  assert.deepEqual(store.list(), ['fresh'])
})
