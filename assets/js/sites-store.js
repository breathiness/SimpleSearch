// v2.9 自定义站点数据层（契约 §20.1）。
// 纯数据：不碰 DOM、不读真实 localStorage —— storage 由调用方注入（{getItem,setItem}）。
// 经典脚本：只注册 SS.sitesStore，Node 里可直接 import 后从 globalThis.SimpleSearch 读取。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  const CUSTOM_KEY = 'ss.customSites'
  const ORDER_KEY = 'ss.order'
  const MAX_CUSTOM = 100
  const MAX_LABEL = 24
  const MAX_KEYWORDS = 8
  const MAX_KEYWORD_LENGTH = 32
  const VERSION = '2.9.0'
  const ID_RE = /^[a-z0-9-]+$/

  // 内置 UI 图标 symbol 名（i-xxx 去掉 i- 前缀）；站点图标另从 SS.sites 推导
  const UI_ICONS = [
    'menu', 'settings', 'close', 'logo',
    'cat-all', 'cat-tech', 'cat-community', 'cat-media', 'cat-shopping', 'cat-content',
  ]

  // ---------------------------------------------------------------- 基础工具

  function hasStorage(storage) {
    return Boolean(storage) &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function'
  }

  function readJson(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null
    try {
      const raw = storage.getItem(key)
      if (typeof raw !== 'string' || raw === '') return null
      return JSON.parse(raw)
    } catch (error) {
      return null
    }
  }

  function writeJson(storage, key, value) {
    if (!hasStorage(storage)) return false
    try {
      storage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      return false
    }
  }

  function groupIds() {
    const groups = SS.siteGroups
    if (!Array.isArray(groups)) return []
    return groups
      .filter((group) => group && typeof group.id === 'string' && group.id !== '')
      .map((group) => group.id)
  }

  // 是否是合法 https URL（search 模板先把 {q} 换成占位符再校验）
  function isHttpsUrl(value) {
    if (typeof value !== 'string') return false
    const text = value.trim()
    if (text === '' || /\s/.test(text)) return false
    if (!/^https:\/\/[^/?#]+/i.test(text)) return false
    try {
      const url = new URL(text)
      return url.protocol === 'https:' && url.hostname !== ''
    } catch (error) {
      return false
    }
  }

  function charLength(value) {
    return Array.from(value).length
  }

  // ---------------------------------------------------------------- 字段归一化

  function normalizeKeywords(input) {
    if (input === undefined || input === null) return { ok: true, keywords: [] }
    let source = null
    if (Array.isArray(input)) source = input
    else if (typeof input === 'string') source = input.split(/\s+/)
    else return { ok: false, error: '关键词必须是数组，或用空格分隔的字符串' }

    const keywords = []
    const seen = Object.create(null)
    for (const value of source) {
      if (typeof value !== 'string') continue
      const word = value.trim()
      if (word === '' || word.length > MAX_KEYWORD_LENGTH) continue
      if (seen[word]) continue
      seen[word] = true
      keywords.push(word)
      if (keywords.length >= MAX_KEYWORDS) break
    }
    return { ok: true, keywords }
  }

  function normalizeGroup(input) {
    const ids = groupIds()
    const value = typeof input === 'string' ? input.trim() : ''
    if (ids.length === 0) {
      // 站点分组表未加载（模块单独使用）：保留原值并提示，不崩
      if (value === '') return { ok: false, error: '分类不能为空' }
      return { ok: true, group: value, warning: '站点分组表未加载，分类未校验' }
    }
    if (value !== '' && ids.indexOf(value) !== -1) return { ok: true, group: value, warning: '' }
    return { ok: false, error: '分类「' + (value || '空') + '」不存在，请重新选择' }
  }

  // 已知 symbol 名：内置站点 id + 站点 icon 字段 + UI 图标
  function knownIconNames() {
    const known = Object.create(null)
    for (const name of UI_ICONS) known[name] = true
    const sites = Array.isArray(SS.sites) ? SS.sites : []
    for (const site of sites) {
      if (!site || typeof site !== 'object') continue
      if (typeof site.id === 'string' && site.id !== '') known[site.id] = true
      if (typeof site.icon === 'string' && site.icon !== '') {
        known[site.icon.replace(/^i-/, '')] = true
      }
    }
    return known
  }

  function normalizeIcon(input) {
    if (input === undefined || input === null || input === '') return { icon: '', warning: '' }
    if (typeof input !== 'string') return { icon: '', warning: '图标值不合法，已忽略' }
    const name = input.trim().replace(/^#/, '').replace(/^i-/, '')
    if (name === '') return { icon: '', warning: '' }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return { icon: '', warning: '图标「' + input + '」不存在，已忽略' }
    }
    if (!knownIconNames()[name]) {
      return { icon: '', warning: '图标「' + input + '」不存在，已忽略' }
    }
    return { icon: name, warning: '' }
  }

  // ---------------------------------------------------------------- 校验入口

  // 校验 + 归一化单个自定义站点：{ ok:true, site, warnings? } | { ok:false, error }
  function normalizeSite(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: '站点数据格式不正确' }
    }
    const warnings = []

    const label = typeof input.label === 'string' ? input.label.trim() : ''
    if (label === '') return { ok: false, error: '名称不能为空' }
    if (charLength(label) > MAX_LABEL) {
      return { ok: false, error: '名称不能超过 ' + MAX_LABEL + ' 个字符' }
    }

    if (!isHttpsUrl(input.home)) {
      return { ok: false, error: '首页网址必须是有效的 https 地址' }
    }
    if (typeof input.search !== 'string' || input.search.indexOf('{q}') === -1) {
      return { ok: false, error: '搜索模板必须包含 {q} 占位符' }
    }
    if (!isHttpsUrl(input.search.split('{q}').join('q'))) {
      return { ok: false, error: '搜索模板必须是有效的 https 地址' }
    }

    const group = normalizeGroup(input.group)
    if (!group.ok) return { ok: false, error: group.error }
    if (group.warning) warnings.push(group.warning)

    const keywords = normalizeKeywords(input.keywords)
    if (!keywords.ok) return { ok: false, error: keywords.error }

    const icon = normalizeIcon(input.icon)
    if (icon.warning) warnings.push(icon.warning)

    let id = ''
    if (input.id !== undefined && input.id !== null && input.id !== '') {
      if (typeof input.id !== 'string' || !ID_RE.test(input.id)) {
        return { ok: false, error: '站点 id 只能包含小写字母、数字和连字符' }
      }
      id = input.id
    }

    const site = {
      label,
      home: input.home.trim(),
      search: input.search.trim(),
      group: group.group,
      keywords: keywords.keywords,
      featured: input.featured === true || input.featured === 1 || input.featured === 'true',
    }
    if (id !== '') site.id = id
    if (icon.icon !== '') site.icon = icon.icon

    const result = { ok: true, site }
    if (warnings.length > 0) result.warnings = warnings
    return result
  }

  // ---------------------------------------------------------------- id 生成

  function assignGeneratedId(site, used, list) {
    let max = 0
    const scan = (value) => {
      if (!value || typeof value !== 'string') return
      const match = /^custom-(\d+)$/.exec(value)
      if (match) max = Math.max(max, Number(match[1]))
    }
    if (used && typeof used.forEach === 'function') used.forEach(scan)
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item && typeof item.id === 'string') scan(item.id)
      }
    }
    let next = max + 1
    while (used && typeof used.has === 'function' && used.has('custom-' + next)) next += 1
    return Object.assign({}, site, { id: 'custom-' + next })
  }

  // ---------------------------------------------------------------- 读写存储

  function listCustom(storage) {
    const parsed = readJson(storage, CUSTOM_KEY)
    if (!Array.isArray(parsed)) return []
    const result = []
    const used = new Set()
    for (const item of parsed) {
      if (result.length >= MAX_CUSTOM) break
      const normalized = normalizeSite(item)
      if (!normalized.ok) continue
      let site = normalized.site
      if (!site.id || used.has(site.id)) site = assignGeneratedId(site, used, result)
      used.add(site.id)
      result.push(site)
    }
    return result
  }

  function saveCustom(storage, list) {
    if (!Array.isArray(list) || list.length > MAX_CUSTOM) return false
    const normalized = []
    const used = new Set()
    for (const item of list) {
      const result = normalizeSite(item)
      if (!result.ok) return false
      let site = result.site
      if (!site.id || used.has(site.id)) site = assignGeneratedId(site, used, normalized)
      used.add(site.id)
      normalized.push(site)
    }
    return writeJson(storage, CUSTOM_KEY, normalized)
  }

  function addCustom(storage, input) {
    const normalized = normalizeSite(input)
    if (!normalized.ok) return normalized
    const list = listCustom(storage)
    if (list.length >= MAX_CUSTOM) {
      return { ok: false, error: '最多只能保存 ' + MAX_CUSTOM + ' 个自定义站点' }
    }
    const used = new Set()
    for (const site of list) if (site && site.id) used.add(site.id)
    const site = assignGeneratedId(normalized.site, used, list)
    list.push(site)
    if (!writeJson(storage, CUSTOM_KEY, list)) {
      return { ok: false, error: '本地存储不可用，无法保存站点' }
    }
    const result = { ok: true, site }
    if (normalized.warnings) result.warnings = normalized.warnings
    return result
  }

  function updateCustom(storage, id, input) {
    const list = listCustom(storage)
    let index = -1
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        index = i
        break
      }
    }
    if (index === -1) return { ok: false, error: '找不到要编辑的站点' }

    const normalized = normalizeSite(input)
    if (!normalized.ok) return normalized
    const site = Object.assign({}, normalized.site, { id })
    list[index] = site
    if (!writeJson(storage, CUSTOM_KEY, list)) {
      return { ok: false, error: '本地存储不可用，无法保存站点' }
    }
    const result = { ok: true, site }
    if (normalized.warnings) result.warnings = normalized.warnings
    return result
  }

  function removeCustom(storage, id) {
    const list = listCustom(storage)
    let index = -1
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        index = i
        break
      }
    }
    if (index === -1) return false
    list.splice(index, 1)
    return writeJson(storage, CUSTOM_KEY, list)
  }

  // ---------------------------------------------------------------- 常用排序

  function getOrder(storage) {
    const parsed = readJson(storage, ORDER_KEY)
    if (!Array.isArray(parsed)) return []
    const order = []
    const seen = new Set()
    for (const value of parsed) {
      if (typeof value !== 'string' || !ID_RE.test(value) || seen.has(value)) continue
      seen.add(value)
      order.push(value)
    }
    return order
  }

  function saveOrder(storage, ids) {
    if (!Array.isArray(ids)) return false
    const order = []
    const seen = new Set()
    for (const value of ids) {
      if (typeof value !== 'string' || !ID_RE.test(value) || seen.has(value)) continue
      seen.add(value)
      order.push(value)
    }
    return writeJson(storage, ORDER_KEY, order)
  }

  // 内置保持原顺序，自定义追加在后
  function merge(builtin, custom) {
    const head = Array.isArray(builtin) ? builtin.slice() : []
    const tail = Array.isArray(custom) ? custom.slice() : []
    return head.concat(tail)
  }

  // order 中出现的 id 按其顺序放前面，其余站点保持原相对顺序；未知 id 忽略
  function applyOrder(sites, orderIds) {
    const list = Array.isArray(sites) ? sites.slice() : []
    const order = Array.isArray(orderIds) ? orderIds : []
    const byId = new Map()
    for (const site of list) {
      if (site && typeof site.id === 'string') byId.set(site.id, site)
    }
    const front = []
    const placed = new Set()
    for (const id of order) {
      if (typeof id !== 'string' || placed.has(id)) continue
      const site = byId.get(id)
      if (!site) continue
      placed.add(id)
      front.push(site)
    }
    const rest = list.filter((site) => !site || typeof site.id !== 'string' || !placed.has(site.id))
    return front.concat(rest)
  }

  // ---------------------------------------------------------------- 导入 / 导出

  function exportConfig(storage, settings) {
    let safeSettings = {}
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      try {
        safeSettings = JSON.parse(JSON.stringify(settings))
      } catch (error) {
        safeSettings = {}
      }
    }
    return {
      app: 'SimpleSearch',
      schema: 1,
      version: VERSION,
      customSites: listCustom(storage),
      order: getOrder(storage),
      settings: safeSettings,
    }
  }

  function serializeConfig(config) {
    try {
      return JSON.stringify(config, null, 2)
    } catch (error) {
      return ''
    }
  }

  // 只做 JSON.parse，绝不执行任何代码；坏 JSON / 坏 schema / 超量 / 非法站点 → 整包拒绝
  function parseImport(text) {
    if (typeof text !== 'string' || text.trim() === '') {
      return { ok: false, error: '导入内容为空' }
    }
    let data = null
    try {
      data = JSON.parse(text)
    } catch (error) {
      return { ok: false, error: '不是合法的 JSON 文件' }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: '配置文件格式不正确' }
    }
    if (data.app !== 'SimpleSearch') {
      return { ok: false, error: '这不是简单搜索的配置文件' }
    }
    if (data.schema !== 1) {
      return { ok: false, error: '不支持的配置版本 schema=' + String(data.schema) }
    }
    if (!Array.isArray(data.customSites)) {
      return { ok: false, error: '配置里的 customSites 必须是数组' }
    }
    if (data.customSites.length > MAX_CUSTOM) {
      return { ok: false, error: '自定义站点超过上限（最多 ' + MAX_CUSTOM + ' 个）' }
    }

    const customSites = []
    const used = new Set()
    for (let index = 0; index < data.customSites.length; index += 1) {
      const normalized = normalizeSite(data.customSites[index])
      if (!normalized.ok) {
        return {
          ok: false,
          error: '第 ' + (index + 1) + ' 个站点不合法：' + normalized.error,
        }
      }
      let site = normalized.site
      if (site.id) {
        if (used.has(site.id)) {
          return { ok: false, error: '存在重复的站点 id：' + site.id }
        }
      } else {
        site = assignGeneratedId(site, used, customSites)
      }
      used.add(site.id)
      customSites.push(site)
    }

    const order = []
    const seenOrder = new Set()
    if (Array.isArray(data.order)) {
      for (const id of data.order) {
        if (typeof id !== 'string' || !ID_RE.test(id) || seenOrder.has(id)) continue
        seenOrder.add(id)
        order.push(id)
      }
    }

    const settings =
      data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? data.settings
        : {}

    return {
      ok: true,
      data: {
        app: 'SimpleSearch',
        schema: 1,
        version: typeof data.version === 'string' && data.version !== '' ? data.version : VERSION,
        customSites,
        order,
        settings,
      },
    }
  }

  SS.sitesStore = {
    CUSTOM_KEY,
    ORDER_KEY,
    MAX_CUSTOM,
    VERSION,
    normalizeSite,
    listCustom,
    saveCustom,
    addCustom,
    updateCustom,
    removeCustom,
    getOrder,
    saveOrder,
    merge,
    applyOrder,
    exportConfig,
    serializeConfig,
    parseImport,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
