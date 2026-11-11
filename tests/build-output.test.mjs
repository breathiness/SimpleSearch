// v2.8 产物静态校验：常用（featured）视图 / PWA / 搜索引擎分段 / 快捷键对话框 / 33 站点图标（契约 §13-§19）。
//
// 直接对生成的 index.html / tokens.css / manifest.webmanifest / sw.js 做静态解析（不跑浏览器）：
//   - 常用视图：11 个 featured 按钮 data-featured="true" 无 hidden、22 个非 featured 带 hidden；
//     导航首项文案「常用」；.card-title 初始「常用网站」（可见性/切换由 app.js + e2e 覆盖）
//   - PWA：<link rel="manifest"> + manifest JSON（name/start_url/scope/display/icons）+ 192/512 图标文件存在
//   - service worker：sw.js 生成物含版本号与 precache（首页 + 全部 CSS/JS/图标/manifest），经典脚本无 import/export
//   - 搜索引擎：#engine-mode 4 个 .segmented-item[data-engine]，初始只有 bing 选中
//   - 快捷键对话框：#shortcuts-dialog 结构 + ≥8 行 <kbd> + 设置面板 #shortcuts-open
//   - 图标 sprite：站点/UI/分类/共享图标动态数量（v2.7 站点 33，symbol 总数 ≥21），体积 ≤ 12KB
//   - 骨架/主题三态/历史行/版本号/分类导航/零图片请求（v2.3-v2.6 断言保留）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
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
// v2.5 签名：#theme-mode 分段控件 / #history-count / .panel-version。
// 没有 = lead 还没重建 v2.5 产物，按任务约定先 skip，等「产物已重建」通知后跑真值。
const isV25 = built && /theme-mode|history-count|panel-version/.test(html)
const skipReason = !present
  ? '等待 lead 重建产物：index.html 不存在'
  : !built
    ? '等待 lead 重建产物：index.html 不是 build.mjs 生成物'
    : !isV25
      ? '等待 lead「产物已重建」：当前 index.html 还是 v2.4 产物（无 #theme-mode/#history-count/.panel-version）'
      : null

// v2.6 签名：manifest 链接 / #engine-mode / #shortcuts-dialog。缺失时 v2.6 专项用例先 skip。
const v3SkipReason = !present
  ? '等待 lead 重建产物：index.html 不存在'
  : !built
    ? '等待 lead 重建产物：index.html 不是 build.mjs 生成物'
    : /rel\s*=\s*["']manifest["']|engine-mode|shortcuts-dialog/.test(html)
      ? null
      : '等待 lead「产物已重建」：当前产物还是 v2.5（无 manifest/#engine-mode/#shortcuts-dialog）'

function testV3(name, fn) {
  test(name, v3SkipReason ? { skip: v3SkipReason } : {}, fn)
}

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

/** 查找内部 HTML 含 token 的 .settings-row（v2.5 有多行，且 <div class="settings-row"> 重复出现，
 *  必须按 match.index 计算各自的内部区域，不能再用 indexOf(tag) 取第一次出现）。 */
function findSettingsRowContaining(source, token) {
  const text = String(source)
  const tagRe = /<([a-zA-Z][\w:-]*)\b[^>]*>/g
  for (const match of text.matchAll(tagRe)) {
    const tag = match[0]
    if (!hasClass(tag, 'settings-row')) continue
    const tagName = match[1]
    const start = match.index + tag.length
    const end = text.indexOf(`</${tagName}>`, start)
    if (end === -1) continue
    const inner = text.slice(start, end)
    if (inner.includes(token)) return { openTag: tag, inner }
  }
  return null
}

/** v2.5 §16.2：主题三态分段控件 #theme-mode > 3 个 .segmented-item[data-mode]。 */
function extractSegmented(source) {
  const container = findTagById(source, 'theme-mode')
  if (!container) return null
  const tagName = (container.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(source, container, tagName) || ''
  const items = []
  for (const match of inner.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'segmented-item')) continue
    items.push({
      mode: getAttr(openTag, 'data-mode'),
      pressed: getAttr(openTag, 'aria-pressed'),
      type: getAttr(openTag, 'type'),
      text: textOf(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))),
      openTag,
    })
  }
  return {
    container,
    role: getAttr(container, 'role'),
    label: getAttr(container, 'aria-label'),
    hasSegmentedClass: hasClass(container, 'segmented'),
    items,
  }
}

function hasDisabledAttr(openTag) {
  return /\sdisabled(?:\s|=|>|\/)/i.test(openTag)
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

testOutput('index.html 含隐藏的内联 <svg class="icon-sprite">，体积 ≤ 12KB（v2.7 §18）', () => {
  const sprite = extractSprite(stripHtmlComments(html))
  assert.ok(sprite, 'index.html 缺少 <svg class="icon-sprite">（图标必须内联）')
  assert.ok(
    hasHiddenAttr(sprite.openTag) ||
      /aria-hidden\s*=\s*["']true["']/i.test(sprite.openTag) ||
      /display\s*:\s*none/i.test(sprite.openTag),
    `icon-sprite 必须是隐藏的（hidden / aria-hidden / display:none）：${sprite.openTag}`,
  )
  const bytes = Buffer.byteLength(sprite.outer, 'utf8')
  assert.ok(bytes <= 12288, `sprite 体积 ${bytes} 字节，超过 12KB 红线（未压缩，契约 §18）`)
})

testOutput('sprite：内置 11 站 + UI 图标齐全，symbol 总数 ≥ 21 且所有 use 目标命中', () => {
  const clean = stripHtmlComments(html)
  const sprite = extractSprite(clean)
  assert.ok(sprite, '缺少 icon-sprite')
  const symbols = extractSymbols(sprite.inner)
  const ids = symbols.map((symbol) => symbol.id)
  const idSet = new Set(ids)

  assert.ok(!ids.includes(null), `symbol 缺少 id：${JSON.stringify(ids)}`)
  assert.equal(idSet.size, ids.length, `symbol id 重复：${JSON.stringify(ids)}`)
  for (const id of ids) assert.match(String(id), /^i-[a-z0-9-]+$/, `symbol id 不合法：${id}`)

  const siteIds = new Set(SS.sites.map((site) => site.id))
  const useTargets = extractUseTargets(clean)
  const useTargetSet = new Set(useTargets)
  assert.ok(useTargets.length > 0, '页面里没有任何 <use> 图标引用')

  // 内置 11 站专属图标 + 约定的 UI 图标必须存在
  for (const builtinId of BUILTIN_IDS) {
    assert.ok(idSet.has(`i-${builtinId}`), `sprite 缺少内置站点图标 #i-${builtinId}`)
  }
  for (const uiId of UI_SYMBOL_IDS) {
    assert.ok(idSet.has(uiId), `sprite 缺少 UI 图标 #${uiId}`)
  }

  // v2.7：总数会随 33 个站点/专属图标增加，只断言下界
  const minTotal = BUILTIN_IDS.length + UI_SYMBOL_IDS.length
  assert.ok(idSet.size >= minTotal, `symbol 总数应 ≥ ${minTotal}，实际 ${idSet.size}`)
  const siteSymbols = ids.filter((id) => siteIds.has(String(id).slice(2)))
  assert.ok(
    siteSymbols.length >= BUILTIN_IDS.length,
    `站点 symbol 应 ≥ ${BUILTIN_IDS.length} 个，实际 ${siteSymbols.length}`,
  )

  // 所有 <use> 目标都能在 sprite 命中
  for (const target of useTargets) {
    assert.ok(idSet.has(target), `use 目标 #${target} 不在 sprite 中`)
  }

  // 不允许孤儿 symbol：允许 UI 图标 / 站点图标 / 页面实际引用到的共享图标（如 cat-*）
  for (const id of ids) {
    if (UI_SYMBOL_IDS.includes(id)) continue
    if (siteIds.has(String(id).slice(2))) continue
    assert.ok(useTargetSet.has(id), `symbol ${id} 既不是站点/UI 图标，也没有被页面 <use> 引用`)
  }

  for (const symbol of symbols) {
    assert.ok(
      /<(path|rect|circle|line|polyline|polygon|ellipse)\b/i.test(symbol.body || ''),
      `symbol ${symbol.id} 里没有几何图形`,
    )
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

testOutput('v2.8 常用视图（静态 DOM）：33 个按钮齐全，11 featured 可见、22 非 featured 带 hidden', () => {
  const clean = stripHtmlComments(html)
  const sprite = extractSprite(clean)
  assert.ok(sprite, '缺少 icon-sprite')
  const symbolIds = new Set(extractSymbols(sprite.inner).map((symbol) => symbol.id))
  const builtinSet = new Set(BUILTIN_IDS)

  const buttons = extractSiteButtons(clean)
  assert.equal(buttons.length, SS.sites.length, `data-site 按钮数应等于注册表站点数（${SS.sites.length}）`)

  const buttonIds = buttons.map((button) => button.id)
  assert.equal(new Set(buttonIds).size, buttonIds.length, `data-site 按钮重复：${JSON.stringify(buttonIds)}`)

  // v2.8 §19.1：11 个 featured 可见（无 hidden），22 个非 featured 直接带 hidden（无 JS 兜底）
  const featured = buttons.filter((button) => getAttr(button.openTag, 'data-featured') === 'true')
  const nonFeatured = buttons.filter((button) => getAttr(button.openTag, 'data-featured') === null)
  assert.equal(featured.length, BUILTIN_IDS.length, `featured 按钮应为 ${BUILTIN_IDS.length} 个，实际 ${featured.length}`)
  assert.equal(
    nonFeatured.length,
    SS.sites.length - BUILTIN_IDS.length,
    `非 featured 按钮应为 ${SS.sites.length - BUILTIN_IDS.length} 个，实际 ${nonFeatured.length}`,
  )
  assert.deepEqual(
    [...featured.map((button) => button.id)].sort(),
    [...BUILTIN_IDS].sort(),
    'data-featured="true" 的按钮应恰好是内置 11 站',
  )
  for (const button of featured) {
    assert.ok(!hasHiddenAttr(button.openTag), `featured 按钮 ${button.id} 初始不应带 hidden（默认可见）`)
  }
  for (const button of nonFeatured) {
    assert.ok(hasHiddenAttr(button.openTag), `v2.8 §19.1：非 featured 按钮 ${button.id} 必须带 hidden`)
  }

  // DOM 里 33 个按钮齐全（可见性由 app.js 的 applyGroupFilter 控制），data-group / 图标逐个校验
  const byId = new Map(buttons.map((button) => [button.id, button]))
  for (const site of SS.sites) {
    assert.ok(buttonIds.includes(site.id), `常用视图 DOM 缺少站点按钮 data-site="${site.id}"`)
    const button = byId.get(site.id)
    assert.equal(button.group, site.group, `站点 ${site.id} 的 data-group 应与注册表一致`)

    const icon = inspectButtonIcon(button.inner)
    assert.ok(icon.hasIconClass, `站点 ${site.id} 的按钮缺少 .button-icon`)

    if (builtinSet.has(site.id)) {
      assert.ok(icon.useTarget, `内置站点 ${site.id} 应使用 <svg class="button-icon"><use href="#i-${site.id}">`)
      assert.equal(icon.useTarget, `i-${site.id}`, `内置站点 ${site.id} 的 use 目标应为 #i-${site.id}`)
      assert.ok(symbolIds.has(icon.useTarget), `use 目标 #${icon.useTarget} 不在 sprite 中`)
      continue
    }

    // v2.7 §18：新增站点可用专属图标（i-<id>）、复用 icon 字段指向的 symbol，或 monogram 兜底
    if (site.icon) {
      assert.ok(icon.useTarget, `站点 ${site.id} 声明了 icon="${site.icon}"，应由 <use> 引用`)
      assert.ok(
        icon.useTarget === `i-${site.id}` || icon.useTarget === `i-${site.icon}`,
        `站点 ${site.id} 的 use 目标应为 #i-${site.id} 或 #i-${site.icon}，实际 #${icon.useTarget}`,
      )
    }
    assert.ok(
      icon.useTarget || (icon.monogram && icon.monogram.length > 0),
      `站点 ${site.id} 既没有 svg 图标也没有 monogram 兜底`,
    )
    if (icon.useTarget) assert.ok(symbolIds.has(icon.useTarget), `use 目标 #${icon.useTarget} 不在 sprite 中`)
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

testOutput('v2.8 默认（常用）视图：.card-title 初始文案为「常用网站」', () => {
  const clean = stripHtmlComments(html)
  const title = findTagWithClass(clean, 'card-title')
  assert.ok(title, '缺少 .card-title')
  const tagName = (title.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const text = textOf(innerOfTag(clean, title, tagName))
  assert.equal(text, '常用网站', `.card-title 初始文案应为「常用网站」，实际 ${JSON.stringify(text)}`)
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
    `nav-item 数量应为 ${expectedGroups.length}（常用 + ${groupIds.length} 类），实际 ${nav.items.length}`,
  )
  assert.deepEqual(
    nav.items.map((item) => item.group),
    expectedGroups,
    `nav-item 顺序应为「常用 + 分组表顺序」：${expectedGroups.join(', ')}`,
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
  const groupLabels = new Map([['all', '常用']])
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

testOutput('nav-item 的 aria-current：初始只有「常用」为 true，同一时刻只有一个 true', () => {
  const nav = extractGroupNav(stripHtmlComments(html))
  assert.ok(nav, '缺少 nav#group-chips')
  const current = nav.items.filter((item) => item.current === 'true')
  assert.equal(current.length, 1, `初始应只有一个 nav-item aria-current="true"，实际 ${current.length} 个`)
  assert.equal(current[0].group, 'all', '初始选中的必须是「常用」(data-group="all")')
  assert.equal(current[0].label, '常用', `v2.8 §19.2：导航首项文案应为「常用」，实际 ${JSON.stringify(current[0].label)}`)
})

// ---------------------------------------------------------------- 设置面板（v2.5：主题三态 / 历史行 / 版本号）

testOutput('#settings-panel 是隐藏的 dialog，含标题/关闭按钮/面板链接；唯一 .switch-row 是联网联想', () => {
  const clean = stripHtmlComments(html)
  const panel = findTagById(clean, 'settings-panel')
  assert.ok(panel, '缺少 #settings-panel')
  assert.equal((getAttr(panel, 'role') || '').toLowerCase(), 'dialog', '#settings-panel 的 role 应为 dialog')
  assert.equal(getAttr(panel, 'aria-modal'), 'true', '#settings-panel 的 aria-modal 应为 true')
  assert.ok(hasHiddenAttr(panel), '#settings-panel 初始应带 hidden（关闭状态）')

  assert.ok(findTagById(clean, 'settings-title'), '缺少 #settings-title')
  assert.ok(findTagById(clean, 'settings-close'), '缺少 #settings-close')
  assert.ok(findTagWithClass(clean, 'panel-link'), '缺少 .panel-link（关于链接）')

  const rows = extractSwitchRows(clean)
  assert.equal(rows.length, 1, `v2.5 起 .switch-row 只剩 #suggest-source-toggle 一个，实际 ${rows.length} 个`)
  const remoteRow = rows[0]
  assert.equal(remoteRow.id, 'suggest-source-toggle')
  assert.equal(remoteRow.text, '联网联想', `#suggest-source-toggle 文案应固定为「联网联想」`)
  assert.equal(remoteRow.pressed, 'true', `#suggest-source-toggle 初始 aria-pressed 应为 "true"`)
})

testOutput('#theme-mode 分段控件：3 个 .segmented-item（auto/light/dark，初始只有 auto aria-pressed=true）', () => {
  const clean = stripHtmlComments(html)
  const segmented = extractSegmented(clean)
  assert.ok(segmented, '缺少 #theme-mode 分段控件')
  assert.ok(segmented.hasSegmentedClass, '#theme-mode 应带 .segmented 类')
  assert.equal((segmented.role || '').toLowerCase(), 'group', '#theme-mode 的 role 应为 group')
  assert.equal(segmented.label, '主题模式', '#theme-mode 的 aria-label 应为「主题模式」')

  assert.equal(segmented.items.length, 3, `#theme-mode 内应有 3 个 .segmented-item，实际 ${segmented.items.length}`)
  assert.deepEqual(
    [...segmented.items.map((item) => item.mode)],
    ['auto', 'light', 'dark'],
    '分段项 data-mode 顺序应为 auto / light / dark',
  )
  assert.deepEqual(
    [...segmented.items.map((item) => item.text)],
    ['跟随系统', '浅色', '深色'],
    '分段项文案应为「跟随系统 / 浅色 / 深色」',
  )

  for (const item of segmented.items) {
    assert.ok(
      item.pressed === 'true' || item.pressed === 'false',
      `分段项 ${item.mode} 的 aria-pressed 缺失或非法：${JSON.stringify(item.pressed)}`,
    )
  }
  const pressed = segmented.items.filter((item) => item.pressed === 'true')
  assert.equal(pressed.length, 1, `初始应只有一个分段项 aria-pressed="true"，实际 ${pressed.length} 个`)
  assert.equal(pressed[0].mode, 'auto', '初始选中的应为「跟随系统」(data-mode="auto")')
})

testOutput('#theme-toggle 已移除：不得存在 id="theme-toggle"', () => {
  const clean = stripHtmlComments(html)
  assert.ok(!/id\s*=\s*["']theme-toggle["']/i.test(clean), 'v2.5 已移除 #theme-toggle，页面里不应再出现')
})

testOutput('主题色行：主题色 .settings-row 内 .settings-label「主题色」+ 空容器 #color-swatches.swatches', () => {
  const clean = stripHtmlComments(html)
  const row = findSettingsRowContaining(clean, 'color-swatches')
  assert.ok(row, '设置面板里缺少含 #color-swatches 的 .settings-row（主题色行）')

  const labelMatch = row.inner.match(
    /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bsettings-label\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  )
  assert.ok(labelMatch, '主题色行缺少 .settings-label')
  assert.equal(textOf(labelMatch[1]), '主题色', '主题色行 .settings-label 文案应为「主题色」')

  const swatches = findTagById(clean, 'color-swatches')
  assert.ok(swatches, '缺少 #color-swatches')
  assert.ok(hasClass(swatches, 'swatches'), '#color-swatches 应带 .swatches 类')
  const swatchTagName = (swatches.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(clean, swatches, swatchTagName)
  assert.ok(inner !== null, '无法读取 #color-swatches 内容')
  assert.equal(
    inner.trim(),
    '',
    `#color-swatches 在产物里必须是空容器（色块由 theme.js 运行时生成），实际内容：${JSON.stringify(inner.trim())}`,
  )
})

testOutput('v2.5 历史行：.settings-row-inline 内「搜索历史」+ #history-count「0 条」+ #history-clear[disabled]', () => {
  const clean = stripHtmlComments(html)
  const row = findSettingsRowContaining(clean, 'history-count')
  assert.ok(row, '设置面板里缺少含 #history-count 的 .settings-row（历史行）')
  assert.ok(hasClass(row.openTag, 'settings-row-inline'), '历史行应带 .settings-row-inline 类')

  const labelMatch = row.inner.match(
    /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bsettings-label\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  )
  assert.ok(labelMatch, '历史行缺少 .settings-label')
  assert.match(textOf(labelMatch[1]) || '', /搜索历史/, '历史行 .settings-label 应含「搜索历史」')

  const count = findTagById(clean, 'history-count')
  assert.ok(count, '缺少 #history-count')
  assert.ok(hasClass(count, 'settings-value'), '#history-count 应带 .settings-value')
  const countTagName = (count.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  assert.equal(textOf(innerOfTag(clean, count, countTagName)), '0 条', '#history-count 初始应为「0 条」')

  const clearButton = findTagById(clean, 'history-clear')
  assert.ok(clearButton, '缺少 #history-clear')
  assert.ok(hasClass(clearButton, 'text-button'), '#history-clear 应带 .text-button')
  assert.ok(hasDisabledAttr(clearButton), '#history-clear 在 0 条时初始应带 disabled')
})

testOutput('v2.5 版本号：.panel-version 文案为「简单搜索 v<semver>」', () => {
  const clean = stripHtmlComments(html)
  const version = findTagWithClass(clean, 'panel-version')
  assert.ok(version, '缺少 .panel-version（设置面板版本号）')
  const tagName = (version.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const text = textOf(innerOfTag(clean, version, tagName))
  assert.match(
    text || '',
    /^简单搜索 v\d+\.\d+\.\d+$/,
    `版本号文案应为「简单搜索 vX.Y.Z」，实际 ${JSON.stringify(text)}`,
  )
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

// ---------------------------------------------------------------- v2.6 §17：PWA / 搜索引擎 / 快捷键对话框

function extractSegmentedItems(source, containerId, keyAttr) {
  const container = findTagById(source, containerId)
  if (!container) return null
  const tagName = (container.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(source, container, tagName) || ''
  const items = []
  for (const match of inner.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'segmented-item')) continue
    items.push({
      key: getAttr(openTag, keyAttr),
      pressed: getAttr(openTag, 'aria-pressed'),
      text: textOf(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))),
    })
  }
  return {
    container,
    role: getAttr(container, 'role'),
    label: getAttr(container, 'aria-label'),
    hasSegmentedClass: hasClass(container, 'segmented'),
    items,
  }
}

function extractResourceRefs(source) {
  const refs = []
  for (const match of String(source).matchAll(/<(link|script|img|source|iframe|embed|object)\b[^>]*>/gi)) {
    const tag = match[0]
    const tagName = match[1].toLowerCase()
    for (const attr of ['src', 'href', 'data', 'poster']) {
      if (attr === 'data' && tagName !== 'object') continue
      const url = getAttr(tag, attr)
      if (!url || url.trim() === '') continue
      refs.push({ tagName, attr, url: url.trim() })
    }
  }
  return refs
}

function isExternalUrl(url) {
  return /^(https?:)?\/\//i.test(url) || /^(data|blob|mailto|tel):/i.test(url)
}

testV3('PWA：<link rel="manifest"> + manifest.webmanifest 合法且 icons(192/512) 文件存在', () => {
  const clean = stripHtmlComments(html)
  const manifestHrefs = []
  for (const match of clean.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = (getAttr(tag, 'rel') || '').toLowerCase()
    if (!rel.split(/\s+/).includes('manifest')) continue
    manifestHrefs.push(getAttr(tag, 'href') || '')
  }
  assert.ok(manifestHrefs.length > 0, 'index.html 缺少 <link rel="manifest">')
  assert.ok(
    manifestHrefs.some((href) => /manifest\.webmanifest/.test(href)),
    `manifest 链接目标不对：${JSON.stringify(manifestHrefs)}`,
  )

  assert.ok(hasRepo('manifest.webmanifest'), '缺少 manifest.webmanifest')
  let manifest
  assert.doesNotThrow(() => {
    manifest = JSON.parse(readRepo('manifest.webmanifest'))
  }, 'manifest.webmanifest 必须是合法 JSON')

  assert.equal(manifest.name, '简单搜索', `manifest.name 应为「简单搜索」，实际 ${JSON.stringify(manifest.name)}`)
  assert.equal(
    manifest.short_name,
    '简单搜索',
    `manifest.short_name 应为「简单搜索」，实际 ${JSON.stringify(manifest.short_name)}`,
  )
  assert.equal(manifest.start_url, './index.html')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.display, 'standalone')
  assert.ok(Array.isArray(manifest.icons), 'manifest.icons 必须是数组')

  const sizes = manifest.icons.map((icon) => String(icon.sizes || ''))
  assert.ok(sizes.includes('192x192'), `manifest.icons 缺少 192x192：${sizes.join(', ')}`)
  assert.ok(sizes.includes('512x512'), `manifest.icons 缺少 512x512：${sizes.join(', ')}`)
  for (const icon of manifest.icons) {
    assert.match(String(icon.src || ''), /\.png$/i, `manifest icon 应为 png：${icon.src}`)
    assert.ok(hasRepo(String(icon.src).replace(/^\.\//, '')), `manifest icon 文件不存在：${icon.src}`)
  }
})

testV3('sw.js：build 生成物含版本号 + precache 覆盖首页/CSS/JS/图标/manifest，且为经典脚本', () => {
  assert.ok(hasRepo('sw.js'), '缺少 sw.js（应由 build 从 templates/sw.js 生成）')
  const sw = readRepo('sw.js')
  const pkg = JSON.parse(readRepo('package.json'))

  assert.ok(sw.includes(pkg.version), `sw.js 未包含 package.json 版本号 ${pkg.version}`)
  assert.ok(/index\.html/.test(sw), 'sw.js 的 precache 应包含 index.html')
  assert.ok(/manifest\.webmanifest/.test(sw), 'sw.js 的 precache 应包含 manifest.webmanifest')
  assert.ok(/icon-192\.png/.test(sw), 'sw.js 的 precache 应包含 icon-192.png')
  assert.ok(/icon-512\.png/.test(sw), 'sw.js 的 precache 应包含 icon-512.png')

  for (const ref of extractResourceRefs(html)) {
    if (!ref.url || isExternalUrl(ref.url) || ref.url.startsWith('#')) continue
    const pathOnly = ref.url.split('?')[0].split('#')[0]
    if (!/\.(css|js|png|svg)$/i.test(pathOnly)) continue
    assert.ok(sw.includes(pathOnly), `sw.js 的 precache 缺少 index.html 引用的资源：${pathOnly}`)
  }

  assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw.js' }), 'sw.js 含 ESM 语法（应使用经典脚本）')
  assert.ok(
    !/<script\b[^>]*\bsrc\s*=\s*["'][^"']*sw\.js/i.test(stripHtmlComments(html)),
    'index.html 不应直接 <script src="sw.js">（只由 app.js 注册）',
  )
})

testV3('搜索引擎：#engine-mode 4 个 .segmented-item[data-engine]，初始只有 bing 选中', () => {
  const clean = stripHtmlComments(html)
  const segmented = extractSegmentedItems(clean, 'engine-mode', 'data-engine')
  assert.ok(segmented, '缺少 #engine-mode 分段控件（搜索引擎切换）')
  assert.ok(segmented.hasSegmentedClass, '#engine-mode 应带 .segmented 类')
  assert.equal((segmented.role || '').toLowerCase(), 'group', '#engine-mode 的 role 应为 group')
  assert.equal(segmented.label, '搜索引擎', '#engine-mode 的 aria-label 应为「搜索引擎」')

  assert.equal(segmented.items.length, 4, `#engine-mode 内应有 4 个 .segmented-item，实际 ${segmented.items.length}`)
  assert.deepEqual([...segmented.items.map((item) => item.key)], ['bing', 'google', 'ddg', 'baidu'])
  assert.deepEqual([...segmented.items.map((item) => item.text)], ['Bing', 'Google', 'DDG', '百度'])

  const pressed = segmented.items.filter((item) => item.pressed === 'true')
  assert.equal(pressed.length, 1, `初始应只有一个引擎选中，实际 ${pressed.length} 个`)
  assert.equal(pressed[0].key, 'bing', '初始选中的应为 bing')
})

testV3('快捷键对话框：#shortcuts-dialog 结构 + ≥8 个 <kbd> + 设置面板 #shortcuts-open', () => {
  const clean = stripHtmlComments(html)
  const dialog = findTagById(clean, 'shortcuts-dialog')
  assert.ok(dialog, '缺少 #shortcuts-dialog')
  assert.ok(hasClass(dialog, 'dialog'), '#shortcuts-dialog 应带 .dialog 类')
  assert.equal((getAttr(dialog, 'role') || '').toLowerCase(), 'dialog', '#shortcuts-dialog 的 role 应为 dialog')
  assert.equal(getAttr(dialog, 'aria-modal'), 'true', '#shortcuts-dialog 的 aria-modal 应为 true')
  assert.ok(hasHiddenAttr(dialog), '#shortcuts-dialog 初始应带 hidden')

  assert.ok(findTagById(clean, 'shortcuts-title'), '缺少 #shortcuts-title')
  assert.ok(findTagById(clean, 'shortcuts-close'), '缺少 #shortcuts-close')
  assert.ok(findTagWithClass(clean, 'shortcut-list'), '缺少 .shortcut-list')

  const kbdCount = (clean.match(/<kbd\b/gi) || []).length
  assert.ok(kbdCount >= 8, `.shortcut-list 至少应有 8 行快捷键，实际 <kbd> 数量 ${kbdCount}`)

  assert.ok(findTagById(clean, 'shortcuts-open'), '设置面板缺少 #shortcuts-open（快捷键按钮）')
})

// ---------------------------------------------------------------- v2.6 单文件便携版 SimpleSearch.html

function testSingle(name, fn) {
  const reason = hasRepo('SimpleSearch.html') ? v3SkipReason : '等待 lead 重建产物：SimpleSearch.html 不存在'
  test(name, reason ? { skip: reason } : {}, fn)
}

testSingle('v2.6 单文件便携版：build 生成 + CSS/JS 全内联 + 无 assets/manifest/apple-touch-icon 引用', () => {
  const single = readRepo('SimpleSearch.html')
  const clean = stripHtmlComments(single)

  assert.ok(BUILD_MARKER.test(single), 'SimpleSearch.html 缺少「由 scripts/build.mjs 生成」注释')
  assert.match(single, /单文件|便携/, 'SimpleSearch.html 文件头缺少单文件/便携版说明')
  assert.ok(single.includes('__SS_SINGLE_FILE'), '缺少 __SS_SINGLE_FILE 标记（app.js 用它跳过 SW 注册）')

  assert.ok(!/<script\b[^>]*\bsrc\s*=/i.test(clean), '单文件版不应有 <script src>')
  const styleCount = (clean.match(/<style\b/gi) || []).length
  assert.ok(styleCount >= 3, `应内联 ≥3 个 <style>，实际 ${styleCount}`)
  const inlineScripts = [...clean.matchAll(/<script\b([^>]*)>/gi)].filter((match) => !/\bsrc\s*=/i.test(match[1])).length
  assert.ok(inlineScripts >= 9, `应内联 ≥9 个 <script>，实际 ${inlineScripts}`)

  assert.ok(!/<link\b[^>]*\brel\s*=\s*["'][^"']*\bmanifest\b/i.test(clean), '单文件版不应包含 <link rel="manifest">')
  assert.ok(!/apple-touch-icon/i.test(clean), '单文件版不应包含 apple-touch-icon')

  const iconLink = [...clean.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\brel\s*=\s*["'][^"']*\bicon\b/i.test(tag))
  assert.ok(iconLink, '缺少 favicon <link rel="icon">')
  assert.match(iconLink, /\bhref\s*=\s*["']data:/i, '单文件版的 favicon 必须是 data: URI')

  assert.ok(!/(?:src|href)\s*=\s*["']assets\//i.test(clean), '单文件版不应引用 assets/ 文件')

  for (const ref of extractResourceRefs(clean)) {
    if (!ref.url || ref.url.startsWith('#') || ref.url.startsWith('data:')) continue
    assert.fail(`单文件版资源 <${ref.tagName}> 未内联：${ref.url}`)
  }
})

testSingle('v2.6 单文件体积 ≤ 200KB（未压缩，零外部请求）', () => {
  const bytes = Buffer.byteLength(readRepo('SimpleSearch.html'), 'utf8')
  assert.ok(bytes <= 200 * 1024, `SimpleSearch.html 体积 ${(bytes / 1024).toFixed(1)} KB，超过 200KB 上限`)
})
