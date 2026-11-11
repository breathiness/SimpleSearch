// 搜索核心：查询词规范化、URL 构建与站点/引擎决策，以及 !bang 快捷搜索解析。
// 全部是纯函数：不碰 DOM、不碰 localStorage、不发网络请求，Node 里可直接 import 做单测。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  // 默认引擎，与 SS.defaultEngine 对应
  const DEFAULT_ENGINE = 'bing'

  // 兜底引擎：search.js 被单独加载（或引擎表缺失）时仍能工作
  const FALLBACK_ENGINE = {
    id: 'bing',
    label: 'Bing',
    search: 'https://www.bing.com/search?q={q}',
    param: 'q',
  }
  const BING_HOME = 'https://www.bing.com'

  // !bang 前缀：站点快捷搜索，如 !gh rust
  const BANG = '!'

  // 查询词规范化：非字符串按空串；去首尾空白；连续空白折叠为一个空格
  function normalizeQuery(raw) {
    if (typeof raw !== 'string') return ''
    return raw.trim().replace(/\s+/g, ' ')
  }

  // 用 {q} 模板构建 URL，查询词内部 encodeURIComponent 编码（& # + % 空格 中文 emoji 都不会断链）
  function buildUrl(template, query) {
    if (typeof template !== 'string' || template.indexOf('{q}') === -1) {
      throw new TypeError('buildUrl: template 必须是包含 {q} 占位符的字符串')
    }
    const encoded = encodeURIComponent(normalizeQuery(query))
    return template.split('{q}').join(encoded)
  }

  // 从注册表里按 id 找站点（每次调用时读取，便于测试注入 SS.sites）
  function findSite(siteId) {
    if (typeof siteId !== 'string' || siteId === '') return null
    const sites = Array.isArray(SS.sites) ? SS.sites : []
    for (const site of sites) {
      if (site && site.id === siteId) return site
    }
    return null
  }

  // !bang 的 token 匹配：先比站点 id，再比 keywords（都转小写后精确比较，按注册表顺序取第一个命中的站点）
  function findBangSite(token) {
    const sites = Array.isArray(SS.sites) ? SS.sites : []
    const needle = token.toLowerCase()
    for (const site of sites) {
      if (!site) continue
      if (typeof site.id === 'string' && site.id.toLowerCase() === needle) return site
      if (!Array.isArray(site.keywords)) continue
      for (const keyword of site.keywords) {
        if (typeof keyword === 'string' && keyword.toLowerCase() === needle) return site
      }
    }
    return null
  }

  // 当前默认引擎：SS.defaultEngine 与 SS.engines 均可用时优先，否则回退 bing
  function currentEngine() {
    const engines = SS.engines && typeof SS.engines === 'object' ? SS.engines : {}
    const preferred = typeof SS.defaultEngine === 'string' ? SS.defaultEngine : DEFAULT_ENGINE
    const engine = engines[preferred] || engines[DEFAULT_ENGINE]
    if (engine && typeof engine.search === 'string' && engine.search.indexOf('{q}') !== -1) {
      return engine
    }
    return FALLBACK_ENGINE
  }

  // 站点决策：空词直达首页（kind: 'nav'），有词站内搜索（kind: 'search'），未知 id 返回 null
  function resolveSite(siteId, rawQuery) {
    const site = findSite(siteId)
    if (!site) return null
    const query = normalizeQuery(rawQuery)
    if (query === '') {
      return { kind: 'nav', url: site.home, siteId: site.id, query }
    }
    return { kind: 'search', url: buildUrl(site.search, query), siteId: site.id, query }
  }

  // !bang 解析：`!<token> [搜索词]`，token 按小写匹配站点 id 或 keywords。
  // 命中返回 { siteId, term, url, kind, token }（url/kind 复用 resolveSite，无词即 nav 首页）；
  // 未命中或非法（! 单独、!!x、! 后紧跟空白等）返回 null，绝不抛错。
  function resolveBang(raw) {
    const query = normalizeQuery(raw)
    if (query === '' || query.charAt(0) !== BANG) return null

    // token 必须紧跟 ! 且不含空白；term 是其后剩余部分（可为空）
    const body = query.slice(BANG.length)
    const matched = /^(\S+)(?:\s+([\s\S]*))?$/.exec(body)
    if (!matched) return null

    const token = matched[1]
    // !!x 这类以 ! 开头的 token 视为非法
    if (token.charAt(0) === BANG) return null

    const site = findBangSite(token)
    if (!site) return null

    const term = normalizeQuery(matched[2] || '')
    const decision = resolveSite(site.id, term)
    if (!decision) return null

    return {
      siteId: decision.siteId,
      term: decision.query,
      url: decision.url,
      kind: decision.kind,
      token: token.toLowerCase(),
    }
  }

  // 默认引擎决策：空词去 Bing 首页，有词用当前默认引擎搜索
  function resolveDefault(rawQuery) {
    const query = normalizeQuery(rawQuery)
    if (query === '') {
      return { kind: 'nav', url: BING_HOME, query }
    }
    return { kind: 'search', url: buildUrl(currentEngine().search, query), query }
  }

  SS.search = {
    DEFAULT_ENGINE,
    BANG,
    normalizeQuery,
    buildUrl,
    resolveSite,
    resolveBang,
    resolveDefault,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
