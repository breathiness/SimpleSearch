// 关键词联想：纯函数，不读 DOM、不发任何网络请求。
// 数据来源：SS.history（只读）+ SS.sites + SS.engines，全部可通过 opts 注入，便于单测。
// 默认完全离线可用；网络联想（如需）由 input.js 自行决定，不在本模块内。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const MAX_ITEMS = 8
  const DEFAULT_ENGINE = 'bing'
  const FALLBACK_ENGINE_LABEL = 'Bing'

  // 查询词规范化：非字符串按空串；去首尾空白；连续空白折叠为一个空格
  function normalize(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, ' ')
  }

  function lower(value) {
    return String(value == null ? '' : value).toLowerCase()
  }

  function resolveMax(opts) {
    if (opts.max === undefined || opts.max === null) return MAX_ITEMS
    const number = Number(opts.max)
    if (!Number.isFinite(number) || number < 0) return MAX_ITEMS
    return Math.floor(number)
  }

  function resolveSites(opts) {
    const source = Array.isArray(opts.sites) ? opts.sites : SS.sites
    if (!Array.isArray(source)) return []
    return source.filter((site) => site &&
      typeof site === 'object' &&
      typeof site.id === 'string' && site.id !== '' &&
      typeof site.label === 'string' && site.label !== '')
  }

  function resolveHistory(opts) {
    if (Array.isArray(opts.history)) return opts.history
    // 读取真实历史（只读）；history.js 未加载时按无历史处理
    try {
      if (SS.history && typeof SS.history.list === 'function') {
        const list = SS.history.list()
        return Array.isArray(list) ? list : []
      }
    } catch (e) {
      /* 历史读取失败不影响联想 */
    }
    return []
  }

  // 当前默认引擎（id + 展示名）：优先 opts，其次 SS.defaultEngine / SS.engines，缺失回退 Bing
  function resolveEngine(opts) {
    const fallback = { id: DEFAULT_ENGINE, label: FALLBACK_ENGINE_LABEL }
    const engines = opts.engines && typeof opts.engines === 'object' ? opts.engines : SS.engines
    if (!engines || typeof engines !== 'object') return fallback

    const preferred = typeof opts.defaultEngine === 'string'
      ? opts.defaultEngine
      : (typeof SS.defaultEngine === 'string' ? SS.defaultEngine : DEFAULT_ENGINE)
    const ids = [preferred, DEFAULT_ENGINE].concat(Object.keys(engines))
    for (const id of ids) {
      const engine = engines[id]
      if (!engine || typeof engine.label !== 'string' || engine.label.trim() === '') continue
      return {
        id: typeof engine.id === 'string' && engine.id !== '' ? engine.id : id,
        label: engine.label.trim(),
      }
    }
    return fallback
  }

  // 去重器：同一个 siteId 或同一个 label（不区分大小写）只保留第一条
  function createDeduper() {
    const seen = new Set()
    return function keep(item) {
      const keys = []
      if (item.siteId) keys.push('site:' + item.siteId)
      keys.push('label:' + lower(item.label).trim())
      for (const key of keys) {
        if (seen.has(key)) return false
      }
      for (const key of keys) seen.add(key)
      return true
    }
  }

  // 站点与查询词的匹配强度：3 = 完全相同，2 = 前缀，1 = 包含，0 = 不匹配。
  // 参与匹配的字段：label、id、keywords（大小写不敏感）。
  function matchSite(site, needle) {
    if (needle === '') return 0
    const fields = [site.label, site.id]
    if (Array.isArray(site.keywords)) {
      for (const keyword of site.keywords) fields.push(keyword)
    }

    let best = 0
    for (const field of fields) {
      const value = lower(field).trim()
      if (value === '') continue
      if (value === needle) return 3
      if (value.startsWith(needle)) {
        if (best < 2) best = 2
      } else if (value.includes(needle)) {
        if (best < 1) best = 1
      }
    }
    return best
  }

  // 空 query：历史（新的在前）+ 注册表顺序的站点，共用一个全局上限
  function emptyQueryItems(opts) {
    const max = resolveMax(opts)
    const sites = resolveSites(opts)
    const history = resolveHistory(opts)
    const items = []
    const keep = createDeduper()

    for (const term of history) {
      if (items.length >= max) break
      const label = normalize(term)
      if (label === '') continue
      const item = { type: 'history', label, sublabel: '历史搜索' }
      if (keep(item)) items.push(item)
    }

    for (const site of sites) {
      if (items.length >= max) break
      const item = { type: 'site', label: site.label, sublabel: '站内搜索', siteId: site.id }
      if (keep(item)) items.push(item)
    }

    return items
  }

  // 非空 query：固定「用 <引擎> 搜索：<词>」+ 命中的站点（相关度优先）+ 历史匹配
  function queryItems(query, opts) {
    const max = resolveMax(opts)
    const sites = resolveSites(opts)
    const history = resolveHistory(opts)
    const needle = lower(query)
    const items = []
    const keep = createDeduper()

    function push(item) {
      if (items.length >= max) return
      if (keep(item)) items.push(item)
    }

    const engine = resolveEngine(opts)
    push({
      type: 'engine',
      label: '用 ' + engine.label + ' 搜索：' + query,
      sublabel: '搜索引擎',
      engineId: engine.id,
    })

    // 站点命中：相关度高的在前，同相关度保持注册表顺序
    const matched = []
    sites.forEach((site, index) => {
      const rank = matchSite(site, needle)
      if (rank > 0) matched.push({ site, rank, index })
    })
    matched.sort((a, b) => (b.rank - a.rank) || (a.index - b.index))
    for (const entry of matched) {
      push({ type: 'site', label: entry.site.label, sublabel: '站内搜索', siteId: entry.site.id })
    }

    // 历史命中：历史词包含当前输入
    for (const term of history) {
      if (items.length >= max) break
      const label = normalize(term)
      if (label === '' || !lower(label).includes(needle)) continue
      push({ type: 'history', label, sublabel: '历史搜索' })
    }

    return items
  }

  // 主入口：纯函数。返回最多 max（默认 8）条 { type, label, sublabel, siteId? }
  function getItems(rawQuery, opts) {
    const options = opts && typeof opts === 'object' ? opts : {}
    const max = resolveMax(options)
    if (max === 0) return []

    const query = normalize(rawQuery)
    if (query === '') return emptyQueryItems(options)
    return queryItems(query, options)
  }

  SS.suggest = {
    MAX_ITEMS,
    getItems,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
