// v2.4 产物静态校验：MDUI 文档站骨架 + 主题色 + 内联 SVG sprite（契约 §13、§14、§15）。
//
// 直接对生成的 index.html / tokens.css 做静态解析（不跑浏览器）：
//   - 骨架：.appbar（含 .appbar-logo → #i-logo）/ .shell / #main-content / 卡片 / 左侧 #site-nav
//   - 分类：nav-item 数量 = 分组数 + 1，aria-current 选中语义；每个 nav-item 有 .nav-icon（#i-cat-<group>）+ .nav-label
//   - 设置面板：#settings-panel[role=dialog][hidden]、两个 .switch-row（固定文案）、主题色行 .settings-row + #color-swatches（空容器）
//   - 无 #site-footer；<html data-color="indigo">
//   - tokens.css：19 组 :root[data-color='…']（每组 4 个 --c-*）+ 语义变量 --primary-bg 等
//   - sprite：11 站点 + 3 UI(menu/settings/close) + 1 logo + 6 分类 = 21 个 symbol，体积 ≤ 8KB
//   - 零额外图片请求
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

// 契约 §14.2 + §15.2/§15.3：sprite 里的 UI 图标（与站点图标共存）
const UI_SYMBOL_IDS = [
  'i-menu',
  'i-settings',
  'i-close',
  'i-logo',
  'i-cat-all',
  'i-cat-tech',
  'i-cat-community',
  'i-cat-media',
  'i-cat-shopping',
  'i-cat-content',
]

// 契约 §15.1：19 组 MDUI 主色（顺序同表）
const COLOR_IDS = [
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'grey',
  'blue-grey',
]

// 契约 §15.1：语义变量（从 --c-500/700/200/on 派生）
const SEMANTIC_VARS = ['--primary-bg', '--primary-bg-hover', '--primary', '--focus-ring', '--on-primary']

const INDEX = 'index.html'
const TOKENS = 'assets/css/tokens.css'
const present = hasRepo(INDEX)
const html = present ? readRepo(INDEX) : ''
const built = present && BUILD_MARKER.test(html)
// v2.4 签名：<html data-color=…> 或 .appbar-logo / #i-logo / nav-icon。
// 没有 = lead 还没重建 v2.4 产物，按任务约定先 skip，等「产物已重建」通知后跑真值。
const isV24 = built && /data-color|appbar-logo|nav-icon|i-logo/.test(html)
const skipReason = !present
  ? '等待 lead 重建产物：index.html 不存在'
  : !built
    ? '等待 lead 重建产物：index.html 不是 build.mjs 生成物'
    : !isV24
      ? '等待 lead「产物已重建」：当前 index.html 还是 v2.3 产物（无 data-color/logo/nav-icon）'
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

/** 取某个元素（按 id 或 class 定位的起始标签）的内部 HTML 到同名闭合标签。 */
function innerOfTag(source, tag, tagName) {
  const start = source.indexOf(tag) + tag.length
  const end = source.indexOf(`</${tagName}>`, start)
  return end === -1 ? null : source.slice(start, end)
}

function textOf(inner) {
  if (inner === null) return null
  return decodeHtmlEntities(stripTags(inner)).trim()
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
    const itemInner = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))
    const iconSvg = itemInner.match(
      /<svg\b[^>]*\bclass\s*=\s*["'][^"']*\bnav-icon\b[^"']*["'][^>]*>[\s\S]*?<\/svg>/i,
    )
    const iconUse = iconSvg
      ? iconSvg[0].match(/<use\b[^>]*\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/i)
      : null
    const labelSpan = itemInner.match(
      /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bnav-label\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    )
    items.push({
      group: getAttr(openTag, 'data-group'),
      current: getAttr(openTag, 'aria-current'),
      iconTarget: iconUse ? iconUse[1] : null,
      hasIconClass: /class\s*=\s*["'][^"']*\bnav-icon\b/i.test(itemInner),
      label: labelSpan ? decodeHtmlEntities(stripTags(labelSpan[1])).trim() : textOf(itemInner),
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

// ---------------------------------------------------------------- tokens.css 解析

function parseColorGroups(css) {
  const groups = new Map()
  for (const match of css.matchAll(/:root\s*\[\s*data-color\s*=\s*["']?([a-z-]+)["']?\s*\]\s*\{([^}]*)\}/g)) {
    groups.set(match[1], match[2])
  }
  return groups
}

function cssVar(block, name) {
  const match = block.match(new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*([^;]+?)\\s*(?:;|$)`))
  return match ? match[1].trim() : null
}

function rootBlock(css) {
  const match = css.match(/(?:^|\n)\s*:root\s*\{([^}]*)\}/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------- sprite

testOutput('index.html 含隐藏的内联 <svg class="icon-sprite">，体积 ≤ 8KB', () => {
  const sprite = extractSprite(stripHtmlComments(html))
  assert.ok(sprite, 'index.html 缺少 <svg class="icon-sprite">（图标必须内联）')
  assert.ok(
    hasHiddenAttr(sprite.openTag) ||
      /aria-hidden\s*=\s*["']true["']/i.test(sprite.openTag) ||
      /display\s*:\s*none/i.test(sprite.openTag),
    `icon-sprite 必须是隐藏的（hidden / aria-hidden / display:none）：${sprite.openTag}`,
  )
  const bytes = Buffer.byteLength(sprite.outer, 'utf8')
  assert.ok(bytes <= 8192, `sprite 体积 ${bytes} 字节，超过 8KB 红线（未压缩）`)
})

testOutput('sprite = 21 个 symbol（11 站点 + 3 UI + 1 logo + 6 分类）；所有 use 目标都能命中', () => {
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
  const expectedTotal = BUILTIN_IDS.length + UI_SYMBOL_IDS.length
  assert.equal(ids.length, expectedTotal, `symbol 总数应为 ${expectedTotal}（11 站点 + 3 UI + 1 logo + 6 分类），实际 ${ids.length}`)

  // 不允许孤儿 symbol
  const allowedUi = new Set(UI_SYMBOL_IDS)
  for (const id of ids) {
    if (allowedUi.has(id)) continue
    assert.ok(siteIds.has(String(id).slice(2)), `symbol ${id} 既不是站点图标也不是约定的 UI 图标`)
  }

  for (const symbol of symbols) {
    assert.ok(
      /<(path|rect|circle|line|polyline|polygon|ellipse)\b/i.test(symbol.body || ''),
      `symbol ${symbol.id} 里没有几何图形`,
    )
  }

  const symbolSet = new Set(ids)
  const useTargets = extractUseTargets(clean)
  assert.ok(useTargets.length > 0, '页面里没有任何 <use> 图标引用')
  for (const target of useTargets) {
    assert.ok(symbolSet.has(target), `use 目标 #${target} 不在 sprite 中`)
  }
})

// ---------------------------------------------------------------- v2.4 主题色

testOutput('<html data-color="indigo">（缺省主题色）', () => {
  const htmlTag = stripHtmlComments(html).match(/<html\b[^>]*>/i)
  assert.ok(htmlTag, '找不到 <html> 标签')
  const dataColor = getAttr(htmlTag[0], 'data-color')
  assert.equal(dataColor, 'indigo', `html 的 data-color 缺省应为 "indigo"，实际 ${JSON.stringify(dataColor)}`)
})

testOutput('tokens.css：19 组 :root[data-color] 齐全（每组 4 个 --c-*）+ 语义变量存在', () => {
  claimTokens: {
    assert.ok(hasRepo(TOKENS), `缺少 ${TOKENS}`)
    const css = readRepo(TOKENS)
    const groups = parseColorGroups(css)

    assert.equal(groups.size, COLOR_IDS.length, `data-color 分组应为 ${COLOR_IDS.length} 组，实际 ${groups.size} 组：${[...groups.keys()].join(', ')}`)
    for (const colorId of COLOR_IDS) {
      assert.ok(groups.has(colorId), `tokens.css 缺少 :root[data-color='${colorId}'] 分组`)
    }

    for (const colorId of COLOR_IDS) {
      const block = groups.get(colorId)
      for (const varName of ['--c-500', '--c-700', '--c-200', '--c-on']) {
        const value = cssVar(block, varName)
        assert.ok(value, `主题色 ${colorId} 缺少 ${varName} 或值为空`)
      }
    }

    const root = rootBlock(css)
    assert.ok(root, 'tokens.css 缺少基础 :root 块')
    for (const varName of SEMANTIC_VARS) {
      assert.ok(cssVar(root, varName), `tokens.css 的 :root 缺少语义变量 ${varName}`)
    }
  }
})

// ---------------------------------------------------------------- 图标引用（顶栏 / 按钮 / 面板 / logo）

testOutput('.appbar-logo 存在且 use 指向 #i-logo', () => {
  const clean = stripHtmlComments(html)
  const logo = findTagWithClass(clean, 'appbar-logo')
  assert.ok(logo, '缺少 .appbar-logo（顶栏圆形 logo）')
  const tagName = (logo.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(clean, logo, tagName)
  assert.ok(inner !== null, '无法读取 .appbar-logo 内容')
  assert.ok(
    /<use\b[^>]*\bhref\s*=\s*["']#i-logo["']/i.test(inner),
    '.appbar-logo 内应有 <use href="#i-logo">',
  )
})

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
    const tagName = (tag.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
    const inner = innerOfTag(clean, tag, tagName)
    assert.ok(
      new RegExp(`<use\\b[^>]*\\bhref\\s*=\\s*["']#${symbolId}["']`, 'i').test(inner || ''),
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
      assert.ok(icon.useTarget, `内置站点 ${button.id} 应使用 <svg class="button-icon"><use href="#i-${button.id}">`)
      assert.equal(icon.useTarget, `i-${button.id}`, `站点 ${button.id} 的 use 目标应为 #i-${button.id}`)
      assert.ok(symbolIds.has(icon.useTarget), `use 目标 #${icon.useTarget} 不在 sprite 中`)
    } else {
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

  assert.ok(findTagWithClass(clean, 'appbar'), '缺少 header.appbar')
  assert.ok(findTagWithClass(clean, 'appbar-title'), '缺少 .appbar-title')
  assert.ok(findTagById(clean, 'nav-toggle'), '缺少 #nav-toggle（汉堡按钮）')
  assert.ok(findTagById(clean, 'settings-toggle'), '缺少 #settings-toggle（设置按钮）')
  assert.ok(findTagWithClass(clean, 'shell'), '缺少 .shell 布局容器')
  assert.ok(findTagById(clean, 'main-content'), '缺少 #main-content')
  assert.ok(findTagWithClass(clean, 'card-search'), '缺少 .card.card-search')
  assert.ok(findTagWithClass(clean, 'card-sites'), '缺少 .card.card-sites')
  assert.ok(findAllTags(clean).some((tag) => hasClass(tag, 'card-title')), '缺少 h2.card-title（内容卡片标题）')
})

testOutput('#site-nav 存在；#group-chips.nav-list 内 .nav-item 数量 = 分组数 + 1、顺序与 data-group 合法', () => {
  const clean = stripHtmlComments(html)
  assert.ok(findTagById(clean, 'site-nav'), '缺少 aside#site-nav（左侧分类导航）')
  assert.ok(findTagWithClass(clean, 'nav-group-title'), '缺少 .nav-group-title')

  assert.ok(Array.isArray(SS.siteGroups), '缺少 SS.siteGroups')
  const groupIds = SS.siteGroups.map((group) => group.id)
  const nav = extractGroupNav(clean)
  assert.ok(nav, '缺少 nav#group-chips')
  assert.ok(nav.navOpen && hasClass(nav.navOpen, 'nav-list'), '#group-chips 应带 .nav-list 类')
  assert.equal(/^<nav\b/i.test(nav.navOpen), true, '#group-chips 应是 <nav> 元素')

  const expectedGroups = ['all', ...groupIds]
  assert.equal(
    nav.items.length,
    expectedGroups.length,
    `nav-item 数量应为 ${expectedGroups.length}（全部 + ${groupIds.length} 类），实际 ${nav.items.length}`,
  )
  assert.deepEqual(
    nav.items.map((item) => item.group),
    expectedGroups,
    `nav-item 顺序应为「全部 + 分组表顺序」：${expectedGroups.join(', ')}`,
  )
  for (const item of nav.items) {
    assert.ok(item.label.length > 0, `nav-item data-group=${item.group} 文案为空`)
    assert.ok(
      item.current === 'true' || item.current === 'false',
      `nav-item data-group=${item.group} 的 aria-current 缺失或非法：${JSON.stringify(item.current)}`,
    )
  }
})

testOutput('每个 .nav-item 有 .nav-icon（use #i-cat-<group>）与 .nav-label，label 与分组表一致', () => {
  const clean = stripHtmlComments(html)
  assert.ok(Array.isArray(SS.siteGroups), '缺少 SS.siteGroups')
  const groupLabels = new Map([['all', '全部']])
  for (const group of SS.siteGroups) groupLabels.set(group.id, group.label)

  const nav = extractGroupNav(clean)
  assert.ok(nav, '缺少 nav#group-chips')
  const symbolIds = new Set(extractSymbols(extractSprite(clean).inner).map((symbol) => symbol.id))

  for (const item of nav.items) {
    assert.ok(item.hasIconClass, `nav-item data-group=${item.group} 缺少 .nav-icon`)
    assert.equal(item.iconTarget, `i-cat-${item.group}`, `nav-item data-group=${item.group} 的图标应为 #i-cat-${item.group}`)
    assert.ok(symbolIds.has(item.iconTarget), `nav-item 图标 #${item.iconTarget} 不在 sprite 中`)
    assert.equal(
      item.label,
      groupLabels.get(item.group),
      `nav-item data-group=${item.group} 的 .nav-label 应为 ${JSON.stringify(groupLabels.get(item.group))}，实际 ${JSON.stringify(item.label)}`,
    )
  }
})

testOutput('nav-item 的 aria-current：初始只有「全部」为 true，同一时刻只有一个 true', () => {
  const nav = extractGroupNav(stripHtmlComments(html))
  assert.ok(nav, '缺少 nav#group-chips')
  const current = nav.items.filter((item) => item.current === 'true')
  assert.equal(current.length, 1, `初始应只有一个 nav-item aria-current="true"，实际 ${current.length} 个`)
  assert.equal(current[0].group, 'all', '初始选中的必须是「全部」分类')
})

// ---------------------------------------------------------------- 设置面板（v2.3 + v2.4 主题色行）

testOutput('#settings-panel 是隐藏的 dialog，含标题/关闭按钮/两个开关/面板链接', () => {
  const clean = stripHtmlComments(html)
  const panel = findTagById(clean, 'settings-panel')
  assert.ok(panel, '缺少 #settings-panel')
  assert.equal((getAttr(panel, 'role') || '').toLowerCase(), 'dialog', '#settings-panel 的 role 应为 dialog')
  assert.equal(getAttr(panel, 'aria-modal'), 'true', '#settings-panel 的 aria-modal 应为 true')
  assert.ok(hasHiddenAttr(panel), '#settings-panel 初始应带 hidden（关闭状态）')

  assert.ok(findTagById(clean, 'settings-title'), '缺少 #settings-title')
  assert.ok(findTagById(clean, 'settings-close'), '缺少 #settings-close')
  assert.ok(findTagWithClass(clean, 'panel-link'), '缺少 .panel-link（关于链接）')
  assert.equal(extractSwitchRows(clean).length, 2, '#settings-panel 内应恰好有 2 个 .switch-row')
})

testOutput('两个 .switch-row：id 正确、文案固定、初始 aria-pressed 正确（theme=false / remote=true）', () => {
  const clean = stripHtmlComments(html)
  const rows = extractSwitchRows(clean)
  const byId = new Map(rows.map((row) => [row.id, row]))

  const themeRow = byId.get('theme-toggle')
  assert.ok(themeRow, '缺少 #theme-toggle.switch-row')
  assert.equal(themeRow.text, '夜间模式', `#theme-toggle 文案应固定为「夜间模式」，实际 ${JSON.stringify(themeRow.text)}`)
  assert.equal(themeRow.pressed, 'false', `#theme-toggle 初始 aria-pressed 应为 "false"，实际 ${JSON.stringify(themeRow.pressed)}`)

  const remoteRow = byId.get('suggest-source-toggle')
  assert.ok(remoteRow, '缺少 #suggest-source-toggle.switch-row')
  assert.equal(remoteRow.text, '联网联想', `#suggest-source-toggle 文案应固定为「联网联想」，实际 ${JSON.stringify(remoteRow.text)}`)
  assert.equal(remoteRow.pressed, 'true', `#suggest-source-toggle 初始 aria-pressed 应为 "true"，实际 ${JSON.stringify(remoteRow.pressed)}`)
})

testOutput('v2.4 主题色行：.settings-row > .settings-label「主题色」+ 空容器 #color-swatches.swatches', () => {
  const clean = stripHtmlComments(html)
  const settingsRow = findTagWithClass(clean, 'settings-row')
  assert.ok(settingsRow, '设置面板里缺少 .settings-row（主题色行）')

  const label = findTagWithClass(clean, 'settings-label')
  assert.ok(label, '缺少 .settings-label')
  const labelTagName = (label.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  assert.equal(
    textOf(innerOfTag(clean, label, labelTagName)),
    '主题色',
    '.settings-label 文案应为「主题色」',
  )

  const swatches = findTagById(clean, 'color-swatches')
  assert.ok(swatches, '缺少 #color-swatches')
  assert.ok(hasClass(swatches, 'swatches'), '#color-swatches 应带 .swatches 类')
  const swatchTagName = (swatches.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(clean, swatches, swatchTagName)
  assert.ok(inner !== null, '无法读取 #color-swatches 内容')
  assert.equal(inner.trim(), '', `#color-swatches 在产物里必须是空容器（色块由 theme.js 运行时生成），实际内容：${JSON.stringify(inner.trim())}`)
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
      assert.ok(!/^(https?:)?\/\//i.test(url), `出现外部资源引用：<${match[1]}> ${attr}=${url}（零额外请求红线）`)
    }
  }

  assert.ok(!/icons\.duckduckgo\.com|favicon\.(io|cc|com)|google\.com\/s2\/favicons/i.test(clean), '出现外链 favicon 服务')

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
