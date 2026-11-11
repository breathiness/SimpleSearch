// 联网联想：百度联想 JSONP（无 CORS，file:// 可用）。
// 契约 §5.6：永不 reject；关闭/空词/超时/失败一律 resolve([])。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const KEY = 'ss.remote'
  const DEFAULT_TIMEOUT_MS = 700
  const DEFAULT_LIMIT = 5
  const MAX_WORD_LENGTH = 100
  const CACHE_TTL_MS = 10 * 60 * 1000
  const CACHE_MAX_ENTRIES = 100
  const MAX_REQUEST_WORDS = 10
  const CALLBACK_PREFIX = 'ss_suggest_'

  let callbackSeq = 0
  let requestSeq = 0
  const cache = new Map()
  const inFlight = new Map()
  let sessionEnabled = null

  function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, ' ')
  }

  function normalizeTimeout(value) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS
    return Math.max(100, Math.min(5000, Math.floor(number)))
  }

  function normalizeLimit(value) {
    if (value === undefined || value === null) return DEFAULT_LIMIT
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0) return DEFAULT_LIMIT
    return Math.max(0, Math.min(20, Math.floor(number)))
  }

  function normalizeWords(words, limit) {
    const result = []
    const seen = new Set()
    const source = Array.isArray(words) ? words : []
    for (const value of source) {
      if (typeof value !== 'string') continue
      const word = value.trim()
      if (word === '' || word.length > MAX_WORD_LENGTH) continue
      const dedupeKey = word.toLowerCase()
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      result.push(word)
      if (result.length >= limit) break
    }
    return result
  }

  function readStorage() {
    try {
      const storage = root.localStorage
      if (storage && typeof storage.getItem === 'function') return storage
    } catch (e) {
      /* 存储被禁用 */
    }
    return null
  }

  function enabled() {
    if (sessionEnabled !== null) return sessionEnabled
    const storage = readStorage()
    if (!storage) return true
    try {
      const stored = storage.getItem(KEY)
      if (stored === 'off') return false
      if (stored === 'on') return true
    } catch (e) {
      /* 读取异常回落默认开启 */
    }
    return true
  }

  function setEnabled(value) {
    const on = Boolean(value)
    const storage = readStorage()
    if (storage && typeof storage.setItem === 'function') {
      try {
        storage.setItem(KEY, on ? 'on' : 'off')
        if (typeof storage.getItem === 'function' && storage.getItem(KEY) === (on ? 'on' : 'off')) {
          sessionEnabled = null
          return on
        }
      } catch (e) {
        /* 写失败退化为会话内生效 */
      }
    }
    sessionEnabled = on
    return on
  }

  // ---------------------------------------------------------------- 缓存

  function readCache(cacheKey) {
    const entry = cache.get(cacheKey)
    if (!entry) return null
    if (Date.now() - entry.time > CACHE_TTL_MS) {
      cache.delete(cacheKey)
      return null
    }
    cache.delete(cacheKey)
    cache.set(cacheKey, entry)
    return entry.words.slice()
  }

  function writeCache(cacheKey, words) {
    if (!words || words.length === 0) return
    cache.delete(cacheKey)
    cache.set(cacheKey, { time: Date.now(), words: words.slice() })
    while (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next()
      if (oldest.done) break
      cache.delete(oldest.value)
    }
  }

  // ---------------------------------------------------------------- provider

  function buildBaiduUrl(query, callbackName) {
    return 'https://suggestion.baidu.com/su?wd=' + encodeURIComponent(query) +
      '&cb=' + encodeURIComponent(callbackName)
  }

  function parseJsonpBody(text) {
    let body = text.trim()
    if (body === '') return null
    const open = body.indexOf('(')
    const close = body.lastIndexOf(')')
    if (open !== -1 && close > open) body = body.slice(open + 1, close).trim()
    body = body.replace(/;\s*$/, '')
    try {
      return JSON.parse(body)
    } catch (e) {
      /* 继续尝试 */
    }
    const quoted = body.replace(/([,{]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    try {
      return JSON.parse(quoted)
    } catch (e) {
      return null
    }
  }

  function parseBaiduSuggestion(input) {
    let payload = input
    if (typeof payload === 'string') payload = parseJsonpBody(payload)
    if (!payload || typeof payload !== 'object') return []

    const source = Array.isArray(payload.s)
      ? payload.s
      : (Array.isArray(payload) ? payload : [])
    const words = []
    for (const value of source) {
      if (typeof value !== 'string') continue
      const word = value.trim()
      if (word === '' || word.length > MAX_WORD_LENGTH) continue
      words.push(word)
    }
    return words
  }

  const baiduProvider = {
    id: 'baidu',
    label: '百度',
    buildUrl: buildBaiduUrl,
    parse: parseBaiduSuggestion,
  }

  function currentProvider() {
    const candidate = SS.remote && SS.remote.provider
    if (candidate &&
      typeof candidate.buildUrl === 'function' &&
      typeof candidate.parse === 'function') {
      return candidate
    }
    return baiduProvider
  }

  // ---------------------------------------------------------------- JSONP

  function requestJsonp(query, options) {
    return new Promise((resolve) => {
      const doc = root.document
      const provider = currentProvider()
      if (!doc || typeof doc.createElement !== 'function') {
        resolve([])
        return
      }

      const timeout = normalizeTimeout(options.timeout)
      const callbackName = CALLBACK_PREFIX + (callbackSeq += 1)
      let script = null
      let timer = 0
      let settled = false
      let abortHandler = null

      function cleanup() {
        if (timer) {
          root.clearTimeout(timer)
          timer = 0
        }
        if (abortHandler && options.signal &&
          typeof options.signal.removeEventListener === 'function') {
          try {
            options.signal.removeEventListener('abort', abortHandler)
          } catch (e) {
            /* 忽略 */
          }
        }
        abortHandler = null
        if (script) {
          try {
            if (script.parentNode) script.parentNode.removeChild(script)
          } catch (e) {
            /* 忽略 */
          }
          script.onerror = null
          script.onload = null
          script = null
        }
        try {
          delete root[callbackName]
        } catch (e) {
          root[callbackName] = undefined
        }
      }

      function finish(words) {
        if (settled) return
        settled = true
        cleanup()
        resolve(Array.isArray(words) ? words : [])
      }

      root[callbackName] = function (payload) {
        let words = []
        try {
          words = provider.parse(payload)
        } catch (e) {
          words = []
        }
        finish(words)
      }

      if (options.signal) {
        if (options.signal.aborted) {
          finish([])
          return
        }
        abortHandler = () => finish([])
        try {
          options.signal.addEventListener('abort', abortHandler, { once: true })
        } catch (e) {
          abortHandler = null
        }
      }

      timer = root.setTimeout(() => finish([]), timeout)

      try {
        script = doc.createElement('script')
        script.async = true
        script.onerror = () => finish([])
        script.src = provider.buildUrl(query, callbackName)
        const parent = doc.head || doc.body || doc.documentElement
        if (!parent) {
          finish([])
          return
        }
        parent.appendChild(script)
      } catch (e) {
        finish([])
      }
    })
  }

  // ---------------------------------------------------------------- fetch

  function fetchWords(rawQuery, opts) {
    const options = opts && typeof opts === 'object' ? opts : {}
    const query = normalize(rawQuery)
    const limit = normalizeLimit(options.limit)

    if (query === '' || limit === 0) return Promise.resolve([])
    if (!enabled()) return Promise.resolve([])
    if (!root.document) return Promise.resolve([])

    const cacheKey = query.toLowerCase()

    const cached = readCache(cacheKey)
    if (cached) return Promise.resolve(cached.slice(0, limit))

    const pending = inFlight.get(cacheKey)
    if (pending) {
      return pending.then((words) => words.slice(0, limit)).catch(() => [])
    }

    const seq = (requestSeq += 1)
    const promise = requestJsonp(query, {
      timeout: options.timeout,
      signal: options.signal,
    })
      .then((words) => {
        const normalized = normalizeWords(words, MAX_REQUEST_WORDS)
        if (normalized.length > 0) writeCache(cacheKey, normalized)
        if (seq !== requestSeq) return []
        return normalized
      })
      .catch(() => [])
      .then((words) => {
        inFlight.delete(cacheKey)
        return words
      })

    inFlight.set(cacheKey, promise)
    return promise.then((words) => words.slice(0, limit))
  }

  SS.remote = {
    KEY,
    enabled,
    setEnabled,
    fetch: fetchWords,
    provider: baiduProvider,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
