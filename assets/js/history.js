// 搜索历史：纯工厂（storage 由调用方注入，便于单测）+ 基于真实 localStorage 的便利封装。
// 契约：key 固定 'ss.history'，最多 10 条，新的在前，去重置顶；storage 读写异常一律吞掉，绝不抛出。
// 写历史只由 app.js 触发；suggest.js / input.js 只读。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const KEY = 'ss.history'
  const MAX = 10

  // 内存兜底 storage：localStorage 不可用（隐私模式、禁用存储、Node 环境）时使用，
  // 保证本模块在任何环境下都能工作而不会抛错。
  function createMemoryStorage() {
    const map = new Map()
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
    }
  }

  // 契约只要求 getItem/setItem；这里放宽到「有这两个方法即可」
  function isUsableStorage(storage) {
    return Boolean(storage) &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function'
  }

  // 查询词规范化：非字符串按空串；去首尾空白；连续空白折叠为一个空格
  function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, ' ')
  }

  // 读取并清洗：只接受字符串数组，非空、去重（保留先出现的顺序），截断到上限
  function read(storage) {
    let raw = null
    try {
      raw = storage.getItem(KEY)
    } catch (e) {
      return []
    }
    if (typeof raw !== 'string' || raw === '') return []

    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      // 存储被手工改坏 / 旧格式：按空历史处理，不抛错
      return []
    }
    if (!Array.isArray(parsed)) return []

    const seen = new Set()
    const result = []
    for (const value of parsed) {
      const term = normalize(value)
      if (term === '' || seen.has(term)) continue
      seen.add(term)
      result.push(term)
      if (result.length >= MAX) break
    }
    return result
  }

  // 写入失败（隐私模式、配额满）静默忽略
  function write(storage, list) {
    try {
      storage.setItem(KEY, JSON.stringify(list))
    } catch (e) {
      /* 忽略：存储不可用时降级为「会话内有效」 */
    }
  }

  // 纯工厂：storage 只需 getItem/setItem；不合法时自动降级为内存存储
  function create(storage) {
    const target = isUsableStorage(storage) ? storage : createMemoryStorage()

    function list() {
      return read(target)
    }

    function add(raw) {
      const term = normalize(raw)
      if (term === '') return list()
      // 去重后置顶，再截断
      const next = list().filter((item) => item !== term)
      next.unshift(term)
      const trimmed = next.slice(0, MAX)
      write(target, trimmed)
      return trimmed
    }

    function remove(raw) {
      const term = normalize(raw)
      if (term === '') return list()
      const next = list().filter((item) => item !== term)
      write(target, next)
      return next
    }

    function clear() {
      // 优先 removeItem；storage 只有 getItem/setItem 时退化为写空数组
      if (typeof target.removeItem === 'function') {
        try {
          target.removeItem(KEY)
          return
        } catch (e) {
          /* 继续尝试写空数组 */
        }
      }
      write(target, [])
    }

    return { list, add, remove, clear }
  }

  // 便利封装的懒实例：首次调用时才访问 localStorage，访问本身也可能抛错
  let cachedInstance = null
  let memoryStorage = null

  function getInstance() {
    if (cachedInstance) return cachedInstance
    let storage = null
    try {
      const candidate = root.localStorage
      if (isUsableStorage(candidate)) storage = candidate
    } catch (e) {
      storage = null
    }
    if (!storage) {
      if (!memoryStorage) memoryStorage = createMemoryStorage()
      storage = memoryStorage
    }
    cachedInstance = create(storage)
    return cachedInstance
  }

  SS.history = {
    KEY,
    MAX,
    create,
    record(raw) {
      return getInstance().add(raw)
    },
    list() {
      return getInstance().list()
    },
    remove(raw) {
      return getInstance().remove(raw)
    },
    clear() {
      getInstance().clear()
    },
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
