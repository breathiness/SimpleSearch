// v2.3 产物静态校验：MDUI 文档站骨架 + 内联 SVG 图标（契约 §13、§14）。
//
// 直接对生成的 index.html 做静态解析（不跑浏览器）：
//   - 骨架：.appbar / .shell / #main-content / .card 卡片 / 左侧 #site-nav 导航 / 右侧 #settings-panel
//   - 分类：nav-item 数量 = 分组数 + 1，选中语义是 aria-current（不再是 aria-pressed）
//   - 设置面板：#settings-panel[role=dialog][hidden]、两个 .switch-row（固定文案 + 初始 aria-pressed）
//   - 无 #site-footer（v2.3 移除页脚）
//   - 内联 sprite：11 个站点 symbol + 3 个 UI symbol（i-menu / i-settings / i-close），体积 ≤ 6KB
//   - 每个 data-site 按钮有 .button-icon（内置站点 use 图标，自加站点可 monogram 兜底）
//   - 零额外图片请求（无 <img>、无外链 favicon 服务、CSS 无图片 url()）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadClassic, makeTester, hasRepo, readRepo, BUILD_MARKER } from './helpers/load.mjs'

const loaded = await loadClassic('sites')
const testIt = makeTester(loaded)
const { SS } = loaded

// 契约 §4.1：内置 11 站（顺序固定）
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

// 契约 §14.2：UI 图标（sprite 里与站点图标共存）
const UI_SYMBOL_IDS = ['i-menu', 'i-settings', 'i-close']

const INDEX = 'index.html'
const present = hasRepo(INDEX)
const html = present ? readRepo(INDEX) : ''
const built = present && BUILD_MARKER.test(html)
// 当前产物是否已经包含 v2.3 签名（appbar 或 nav-item 或 settings-panel）。
// 没有 = lead 还没重建 v2.3 产物，按任务约定先 skip，等「产物已重建」通知后跑真值。
const isV23 = built && /class="appbar"|nav-item|settings-panel/.test(html)
const skipReason = !present
  ? '等待 lead 重建产物：index.html 不存在'
  : !built
    ? '等待 lead 重建产物：index.html 不是 build.mjs 生成物'
    : !isV23
      ? '等待 lead「产物已重建」：当前 index.html 还是 v2.2 产物（无 appbar/nav-item/settings-panel）'
      : null

function testOutput(name, fn) {
  test(name, skipReason ? { skip: skipReason } : {}, fn)
}

// ---------------------------------------------------------------- 解析工具

function getAttr(source, name) {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = source.match(regex)
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? null
}

function stripHtmlComments(source) {
  return String(source).replace(/<!--[\s\S]*?-->/g, '')
}

function stripTags(source) {
  return String(source).replace(/<[^>]*>/g, '')
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function hasHiddenAttr(openTag) {
  return /\shidden(?:\s|=|>|\/)/i.test(openTag)
}

/** 扫描所有起始标签，按属性找元素。 */
function findAllTags(source) {
  return [...String(source).matchAll(/<[a-zA-Z][\w:-]*\b[^>]*>/g)].map((match) => match[0])
}

function findTagById(source, id) {
  for (const tag of findAllTags(source)) {
    if (getAttr(tag, 'id') === id) return tag
  }
  return null
}

function hasClass(tag, className) {
  const cls = getAttr(tag, 'class')
  if (!cls) return false
  return cls.split(/\s+/).includes(className)
}

function findTagWithClass(source, className) {
  for (const tag of findAllTags(source)) {
    if (hasClass(tag, className)) return tag
  }
  return null
}

/** 取某个 id 元素的内部文本（按同名闭合标签截取；内部只有文本/图标时足够）。 */
function textOfId(source, id) {
  const tag = findTagById(source, id)
  if (!tag) return null
  const tagName = (tag.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const start = source.indexOf(tag) + tag.length
  const end = source.indexOf(`</${tagName}>`, start)
  if (end === -1) return null
  return decodeHtmlEntities(stripTags(source.slice(start, end))).trim()
}

function extractSprite(source) {
  const open = source.match(/<svg\b[^>]*\bclass\s*=\s*["'][^"']*\bicon-sprite\b[^"']*["'][^>]*>/i)
  if (!open) return null
  const start = open.index + open[0].length
  const end = source.indexOf('</svg>', start)
  if (end === -1) return null
  return {
    openTag: open[0],
    inner: source.slice(start, end),
    outer: source.slice(open.index, end + '</svg>'.length),
  }
}

function extractSymbols(spriteInner) {
  const symbols = []
  for (const match of spriteInner.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/gi)) {
    symbols.push({ id: getAttr(match[0], 'id'), body: match[2] })
  }
  return symbols
}

function extractUseTargets(source) {
  const targets = []
  for (const match of source.matchAll(/<use\b[^>]*\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/gi)) {
    targets.push(match[1])
  }
  return targets
}

function extractSiteButtons(source) {
  const buttons = []
  for (const match of source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const id = getAttr(tag, 'data-site')
    if (id === null) continue
    const inner = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))
    buttons.push({
      id: decodeHtmlEntities(id),
      group: getAttr(tag, 'data-group'),
      inner,
      openTag: tag.slice(0, tag.indexOf('>') + 1),
    })
  }
  return buttons
}

function inspectButtonIcon(inner) {
  const svgMatch = inner.match(/<svg\b[^>]*\bclass\s*=\s*["'][^"']*\bbutton-icon\b[^"']*["'][^>]*>[\s\S]*?<\/svg>/i)
  const useMatch = svgMatch
    ? svgMatch[0].match(/<use\b[^>]*\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/i)
    : null
  const monogramMatch = inner.match(
    /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bbutton-icon-text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  )
  return {
    hasIconClass: /class\s*=\s*["'][^"']*\bbutton-icon\b/i.test(inner),
    useTarget: useMatch ? useMatch[1] : null,
    monogram: monogramMatch ? decodeHtmlEntities(stripTags(monogramMatch[1])).trim() : null,
  }
}

/** 左侧分类导航：nav#group-chips.nav-list 内的 button.nav-item[data-group][aria-current]。 */
function extractGroupNav(source) {
  const navOpen = findTagById(source, 'group-chips')
  if (!navOpen) return null
  const start = source.indexOf(navOpen) + navOpen.length
  const end = source.indexOf('</nav>', start)
  if (end === -1) return null
  const inner = source.slice(start, end)
  const items = []
  for (const match of inner.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'nav-item')) continue
    const text = decodeHtmlEntities(stripTags(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>')))).trim()
    items.push({
      group: getAttr(openTag, 'data-group'),
      current: getAttr(openTag, 'aria-current'),
      label: text,
      openTag,
    })
  }
  return { navOpen, items }
}

/** 设置面板里的 .switch-row 按钮。 */
function extractSwitchRows(source) {
  const rows = []
  for (const match of source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'switch-row')) continue
    const text = decodeHtmlEntities(stripTags(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>')))).trim()
    rows.push({ id: getAttr(openTag, 'id'), pressed: getAttr(openTag, 'aria-pressed'), text, openTag })
  }
  return rows
}

// ---------------------------------------------------------------- sprite

testOutput('index.html 含隐藏的内联 <svg class="icon-sprite">，体积 ≤ 6KB', () => {
  const sprite = extractSprite(stripHtmlComments(html))
  assert.ok(sprite, 'index.html 缺少 <svg class="icon-sprite">（图标必须内联）')
  assert.ok(
    hasHiddenAttr(sprite.openTag) ||
      /aria-hidden\s*=\s*["']true["']/i.test(sprite.openTag) ||
      /display\s*:\s*none/i.test(sprite.openTag),
    `icon-sprite 必须是隐藏的（hidden / aria-hidden / display:none）：${sprite.openTag}`,
  )
  const bytes = Buffer.byteLength(sprite.outer, 'utf8')
  assert.ok(bytes <= 6144, `sprite 体积 ${bytes} 字节，超过 6KB 红线（未压缩）`)
})

testOutput('sprite = 11 个站点 symbol + 3 个 UI symbol；所有 use 目标都能命中', () => {
  const clean = stripHtmlComments(html)
  const sprite = extractSprite(clean)
  assert.ok(sprite, '缺少 icon-sprite')
  const symbols = extractSymbols(sprite.inner)
  const ids = symbols.map((symbol) => symbol.id)

  assert.ok(!ids.includes(null), `symbol 缺少 id：${JSON.stringify(ids)}`)
  assert.equal(new Set(ids).size, ids.length, `symbol id 重复：${JSON.stringify(ids)}`)

  const siteIds = new Set(SS.sites.map((site) => site.id))
  for (const builtinId of BUILTIN_IDS) {
    assert.ok(ids.includes(`i-${builtinId}`), `sprite 缺少内置站点图标 #i-${builtinId}`)
  }
  for (const uiId of UI_SYMBOL_IDS) {
    assert.ok(ids.includes(uiId), `sprite 缺少 UI 图标 #${uiId}`)
  }

  const siteSymbols = ids.filter((id) => id !== null && siteIds.has(String(id).slice(2)))
  assert.equal(siteSymbols.length, BUILTIN_IDS.length, `站点 symbol 应为 ${BUILTIN_IDS.length} 个，实际 ${siteSymbols.length}`)
  assert.equal(ids.length, BUILTIN_IDS.length + UI_SYMBOL_IDS.length, `symbol 总数应为 ${BUILTIN_IDS.length + UI_SYMBOL_IDS.length}（11 站点 + 3 UI）`)

  // 不允许孤儿 symbol（既不是站点图标也不是约定的 UI 图标）
  for (const id of ids) {
    if (UI_SYMBOL_IDS.includes(id)) continue
    assert.ok(siteIds.has(String(id).slice(2)), `symbol ${id} 既不是站点图标也不是 UI 图标`)
  }

  for (const symbol of symbols) {
    assert.ok(
      /<(path|rect|circle|line|polyline|polygon|ellipse)\b/i.test(symbol.body || ''),
      `symbol ${symbol.id} 里没有几何图形`,
    )
  }

  // 页面里每一处 <use href="#..."> 都必须能在 sprite 里找到
  const symbolSet = new Set(ids)
  const useTargets = extractUseTargets(clean)
  assert.ok(useTargets.length > 0, '页面里没有任何 <use> 图标引用')
  for (const target of useTargets) {
    assert.ok(symbolSet.has(target), `use 目标 #${target} 不在 sprite 中`)
  }
})

// ---------------------------------------------------------------- 图标引用（顶栏 / 按钮 / 面板）

testOutput('顶栏与面板图标引用正确：#nav-toggle→i-menu、#settings-toggle→i-settings、#settings-close→i-close', () => {
  const clean = stripHtmlComments(html)
  const expectations = [
    ['nav-toggle', 'i-menu'],
    ['settings-toggle', 'i-settings'],
    ['settings-close', 'i-close'],
  ]
  for (const [id, symbolId] of expectations) {
    const tag = findTagById(clean, id)
    assert.ok(tag, `缺少 #${id}`)
    const start = clean.indexOf(tag) + tag.length
    const tagName = (tag.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
    const end = clean.indexOf(`</${tagName}>`, start)
    const inner = clean.slice(start, end === -1 ? undefined : end)
    assert.ok(
      new RegExp(`<use\\b[^>]*\\bhref\\s*=\\s*["']#${symbolId}["']`, 'i').test(inner),
      `#${id} 应引用图标 #${symbolId}`,
    )
  }
})

testOutput('每个 data-site 按钮都有 .button-icon；内置站点为 <use> 且目标存在', () => {
  const clean = stripHtmlComments(html)
  const sprite = extractSprite(clean)
  assert.ok(sprite, '缺少 icon-sprite')
  const symbolIds = new Set(extractSymbols(sprite.inner).map((symbol) => symbol.id))
  const builtinSet = new Set(BUILTIN_IDS)

  const buttons = extractSiteButtons(clean)
  assert.equal(buttons.length, SS.sites.length, 'data-site 按钮数应等于注册表站点数')

  for (const button of buttons) {
    const icon = inspectButtonIcon(button.inner)
    assert.ok(icon.hasIconClass, `站点 ${button.id} 的按钮缺少 .button-icon`)

    if (builtinSet.has(button.id)) {
      assert.ok(
        icon.useTarget,
        `内置站点 ${button.id} 应使用 <svg class="button-icon"><use href="#i-${button.id}">`,
      )
      assert.equal(icon.useTarget, `i-${button.id}`, `站点 ${button.id} 的 use 目标应为 #i-${button.id}`)
      assert.ok(symbolIds.has(icon.useTarget), `use 目标 #${icon.useTarget} 不在 sprite 中`)
    } else {
      // 自加站点：允许没有图标，但必须退化为 monogram，不能留空
      assert.ok(
        icon.useTarget || (icon.monogram && icon.monogram.length > 0),
        `自加站点 ${button.id} 既没有 svg 图标也没有 monogram 兜底`,
      )
      if (icon.useTarget) assert.ok(symbolIds.has(icon.useTarget), `use 目标 #${icon.useTarget} 不在 sprite 中`)
    }
  }
})

// ---------------------------------------------------------------- 页面骨架（v2.3 文档站式）

testOutput('骨架：.appbar/.appbar-title + .shell + #main-content + 两张 .card（含 h2.card-title）', () => {
  const clean = stripHtmlComments(html)

  const appbar = findTagWithClass(clean, 'appbar')
  assert.ok(appbar, '缺少 header.appbar')
  assert.ok(findTagWithClass(clean, 'appbar-title'), '缺少 .appbar-title')
  assert.ok(findTagById(clean, 'nav-toggle'), '缺少 #nav-toggle（汉堡按钮）')
  assert.ok(findTagById(clean, 'settings-toggle'), '缺少 #settings-toggle（设置按钮）')

  assert.ok(findTagWithClass(clean, 'shell'), '缺少 .shell 布局容器')
  assert.ok(findTagById(clean, 'main-content'), '缺少 #main-content')

  assert.ok(findTagWithClass(clean, 'card-search'), '缺少 .card.card-search')
  assert.ok(findTagWithClass(clean, 'card-sites'), '缺少 .card.card-sites')
  const cardTitles = findAllTags(clean).filter((tag) => hasClass(tag, 'card-title'))
  assert.ok(cardTitles.length >= 1, '缺少 h2.card-title（内容卡片标题）')
})

testOutput('#site-nav 存在；#group-chips.nav-list 内 .nav-item 数量 = 分组数 + 1、顺序与 data-group 合法', () => {
  const clean = stripHtmlComments(html)
  const siteNav = findTagById(clean, 'site-nav')
  assert.ok(siteNav, '缺少 aside#site-nav（左侧分类导航）')
  assert.ok(findTagWithClass(clean, 'nav-group-title'), '缺少 .nav-group-title')

  assert.ok(Array.isArray(SS.siteGroups), '缺少 SS.siteGroups')
  const groupIds = SS.siteGroups.map((group) => group.id)
  const nav = extractGroupNav(clean)
  assert.ok(nav, '缺少 nav#group-chips')
  assert.ok(nav.navOpen && hasClass(nav.navOpen, 'nav-list'), '#group-chips 应带 .nav-list 类')
  assert.equal(nav.navOpen && /^<nav\b/i.test(nav.navOpen), true, '#group-chips 应是 <nav> 元素')

  const expectedGroups = ['all', ...groupIds]
  assert.equal(
    nav.items.length,
    expectedGroups.length,
    `nav-item 数量应为 ${expectedGroups.length}（全部 + ${groupIds.length} 类），实际 ${nav.items.length}`,
  )
  const actualGroups = nav.items.map((item) => item.group)
  assert.deepEqual(actualGroups, expectedGroups, `nav-item 顺序应为「全部 + 分组表顺序」：${expectedGroups.join(', ')}`)

  for (const item of nav.items) {
    assert.ok(item.label.length > 0, `nav-item data-group=${item.group} 文案为空`)
    assert.ok(
      item.current === 'true' || item.current === 'false',
      `nav-item data-group=${item.group} 的 aria-current 缺失或非法：${JSON.stringify(item.current)}`,
    )
  }
})

testOutput('nav-item 的 aria-current：初始只有「全部」为 true，同一时刻只有一个 true', () => {
  const nav = extractGroupNav(stripHtmlComments(html))
  assert.ok(nav, '缺少 nav#group-chips')
  const current = nav.items.filter((item) => item.current === 'true')
  assert.equal(current.length, 1, `初始应只有一个 nav-item aria-current="true"，实际 ${current.length} 个`)
  assert.equal(current[0].group, 'all', '初始选中的必须是「全部」分类')
  assert.equal(current[0].label, '全部', `「全部」nav-item 文案应为「全部」，实际 ${JSON.stringify(current[0].label)}`)
})

// ---------------------------------------------------------------- 设置面板（v2.3）

testOutput('#settings-panel 是隐藏的 dialog，含标题/关闭按钮/两个开关/面板链接', () => {
  const clean = stripHtmlComments(html)
  const panel = findTagById(clean, 'settings-panel')
  assert.ok(panel, '缺少 #settings-panel')
  assert.equal((getAttr(panel, 'role') || '').toLowerCase(), 'dialog', `#settings-panel 的 role 应为 dialog`)
  assert.equal(getAttr(panel, 'aria-modal'), 'true', `#settings-panel 的 aria-modal 应为 true`)
  assert.ok(hasHiddenAttr(panel), '#settings-panel 初始应带 hidden（关闭状态）')

  assert.ok(findTagById(clean, 'settings-title'), '缺少 #settings-title')
  assert.ok(findTagById(clean, 'settings-close'), '缺少 #settings-close')
  assert.ok(findTagWithClass(clean, 'panel-link'), '缺少 .panel-link（关于链接）')

  const rows = extractSwitchRows(clean)
  assert.equal(rows.length, 2, `#settings-panel 内应恰好有 2 个 .switch-row，实际 ${rows.length}`)
})

testOutput('两个 .switch-row：id 正确、文案固定、初始 aria-pressed 正确（theme=false / remote=true）', () => {
  const clean = stripHtmlComments(html)
  const rows = extractSwitchRows(clean)
  const byId = new Map(rows.map((row) => [row.id, row]))

  const themeRow = byId.get('theme-toggle')
  assert.ok(themeRow, '缺少 #theme-toggle.switch-row')
  assert.equal(themeRow.text, '夜间模式', `#theme-toggle 文案应固定为「夜间模式」，实际 ${JSON.stringify(themeRow.text)}`)
  assert.equal(themeRow.pressed, 'false', `#theme-toggle 初始 aria-pressed 应为 "false"（浅色），实际 ${JSON.stringify(themeRow.pressed)}`)

  const remoteRow = byId.get('suggest-source-toggle')
  assert.ok(remoteRow, '缺少 #suggest-source-toggle.switch-row')
  assert.equal(
    remoteRow.text,
    '联网联想',
    `#suggest-source-toggle 文案应固定为「联网联想」，实际 ${JSON.stringify(remoteRow.text)}`,
  )
  assert.equal(remoteRow.pressed, 'true', `#suggest-source-toggle 初始 aria-pressed 应为 "true"（默认开启），实际 ${JSON.stringify(remoteRow.pressed)}`)
})

testOutput('#scrim.scrim 初始 hidden', () => {
  const clean = stripHtmlComments(html)
  const scrim = findTagById(clean, 'scrim')
  assert.ok(scrim, '缺少 #scrim')
  assert.ok(hasClass(scrim, 'scrim'), '#scrim 应带 .scrim 类')
  assert.ok(hasHiddenAttr(scrim), '#scrim 初始应带 hidden')
})

testOutput('页脚已移除：不存在 #site-footer，也不存在 <footer>', () => {
  const clean = stripHtmlComments(html)
  assert.ok(!/id\s*=\s*["']site-footer["']/i.test(clean), 'v2.3 已移除 #site-footer，页面里不应再出现')
  assert.ok(!/<footer\b/i.test(clean), 'v2.3 已移除页脚，不应出现 <footer> 元素')
})

// ---------------------------------------------------------------- 分类与按钮对应

testOutput('每个站点按钮的 data-group 与其在 sites.js 里的 group 一致', () => {
  const buttons = extractSiteButtons(stripHtmlComments(html))
  const byId = new Map(buttons.map((button) => [button.id, button]))
  for (const site of SS.sites) {
    const button = byId.get(site.id)
    assert.ok(button, `站点 ${site.id} 没有渲染按钮`)
    assert.equal(
      button.group,
      site.group,
      `站点 ${site.id} 的按钮 data-group 应为 ${JSON.stringify(site.group)}，实际为 ${JSON.stringify(button.group)}`,
    )
  }
})

// ---------------------------------------------------------------- 零额外请求红线

testOutput('图标零额外请求：无 <img>/<picture>、无外链 favicon 服务、CSS 无图片 url()', () => {
  const clean = stripHtmlComments(html)

  assert.ok(!/<img\b/i.test(clean), 'index.html 出现 <img>，图标必须内联 SVG')
  assert.ok(!/<picture\b/i.test(clean), 'index.html 出现 <picture>')

  for (const match of clean.matchAll(/<(link|script|img|source|iframe|embed|object)\b[^>]*>/gi)) {
    const tag = match[0]
    for (const attr of ['src', 'href', 'data']) {
      const url = getAttr(tag, attr)
      if (!url) continue
      assert.ok(
        !/^(https?:)?\/\//i.test(url),
        `出现外部资源引用：<${match[1]}> ${attr}=${url}（零额外请求红线）`,
      )
    }
  }

  assert.ok(
    !/icons\.duckduckgo\.com|favicon\.(io|cc|com)|google\.com\/s2\/favicons/i.test(clean),
    '出现外链 favicon 服务',
  )

  for (const block of clean.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []) {
    assert.ok(
      !/url\(\s*['"]?(?!data:)[^)]*\.(svg|png|jpe?g|gif|webp|ico)\b/i.test(block),
      '内联 <style> 中出现图片 url()（应使用内联 SVG，不能新增图片请求）',
    )
  }

  for (const match of clean.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = getAttr(tag, 'rel') || ''
    if (!/\bicon\b/i.test(rel)) continue
    const href = getAttr(tag, 'href') || ''
    assert.ok(!/^(https?:)?\/\//i.test(href), `favicon 不得外链：${href}`)
  }
})
