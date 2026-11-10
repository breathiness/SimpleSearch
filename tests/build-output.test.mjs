// v2.2 产物静态校验：站点分组 chip、内联 SVG 图标（sprite / button-icon）。
// 契约依据：docs/contract.md §13.1、§13.2。
//
// 直接对生成的 index.html 做静态解析（不跑浏览器）：
//   - sprite 必须内联、隐藏、覆盖全部内置站点，体积 ≤ 4KB
//   - 每个 data-site 按钮必须有 .button-icon：内置站点用 <use href="#i-xxx">，自加站点可退化为 monogram
//   - #group-chips-wrap 初始 hidden（无 JS 兜底）、chip 数量/顺序/data-group/aria-pressed 正确
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

const INDEX = 'index.html'
const present = hasRepo(INDEX)
const html = present ? readRepo(INDEX) : ''
const built = present && BUILD_MARKER.test(html)
// 当前产物是否已经包含 v2.2 签名（sprite 或 data-group）。
// 都没有 = lead 还没重建 v2.2 产物，按任务约定先 skip，等「产物已重建」通知后跑真值。
const isV22 = built && /icon-sprite|data-group/.test(html)
const skipReason = !present
  ? '等待 lead 重建产物：index.html 不存在'
  : !built
    ? '等待 lead 重建产物：index.html 不是 build.mjs 生成物'
    : !isV22
      ? '等待 lead「产物已重建」：当前 index.html 还是 v2.1 产物（无 sprite/data-group）'
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
    svg: svgMatch ? svgMatch[0] : null,
  }
}

function extractChips(source) {
  const wrapMatch = source.match(/<div\b[^>]*\bid\s*=\s*["']group-chips-wrap["'][^>]*>/i)
  const containerMatch = source.match(
    /<div\b[^>]*\bid\s*=\s*["']group-chips["'][^>]*>([\s\S]*?)<\/div>/i,
  )
  const chips = []
  if (containerMatch) {
    for (const match of containerMatch[1].matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
      const tag = match[0]
      const inner = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))
      chips.push({
        group: getAttr(tag, 'data-group'),
        pressed: getAttr(tag, 'aria-pressed'),
        label: decodeHtmlEntities(stripTags(inner)).trim(),
        openTag: tag.slice(0, tag.indexOf('>') + 1),
      })
    }
  }
  return {
    wrapOpenTag: wrapMatch ? wrapMatch[0] : null,
    container: containerMatch ? containerMatch[1] : null,
    chips,
  }
}

function hasHiddenAttr(openTag) {
  return /\shidden(?:\s|=|>|\/)/i.test(openTag)
}

// ---------------------------------------------------------------- sprite

testOutput('index.html 含隐藏的内联 <svg class="icon-sprite">，体积 ≤ 4KB', () => {
  const sprite = extractSprite(stripHtmlComments(html))
  assert.ok(sprite, 'index.html 缺少 <svg class="icon-sprite">（v2.2 图标必须内联）')
  assert.ok(
    hasHiddenAttr(sprite.openTag) ||
      /aria-hidden\s*=\s*["']true["']/i.test(sprite.openTag) ||
      /display\s*:\s*none/i.test(sprite.openTag),
    `icon-sprite 必须是隐藏的（hidden / aria-hidden / display:none）：${sprite.openTag}`,
  )
  const bytes = Buffer.byteLength(sprite.outer, 'utf8')
  assert.ok(bytes <= 4096, `sprite 体积 ${bytes} 字节，超过 4KB 红线（未压缩）`)
})

testOutput('sprite 覆盖全部内置站点：symbol id 合法唯一、无孤儿、数量 = 内置站点数', () => {
  const sprite = extractSprite(stripHtmlComments(html))
  assert.ok(sprite, '缺少 icon-sprite')
  const symbols = extractSymbols(sprite.inner)
  assert.ok(symbols.length > 0, 'sprite 里没有任何 <symbol>')

  const ids = symbols.map((symbol) => symbol.id)
  assert.ok(!ids.includes(null), `symbol 缺少 id：${JSON.stringify(ids)}`)
  assert.equal(new Set(ids).size, ids.length, `symbol id 重复：${JSON.stringify(ids)}`)

  const siteIds = new Set(SS.sites.map((site) => site.id))
  for (const id of ids) {
    assert.match(String(id), /^i-[a-z0-9-]+$/, `symbol id 不合法：${id}`)
    assert.ok(siteIds.has(String(id).slice(2)), `symbol ${id} 对应的站点在 SS.sites 中不存在`)
  }

  for (const builtinId of BUILTIN_IDS) {
    assert.ok(ids.includes(`i-${builtinId}`), `sprite 缺少内置站点图标 #i-${builtinId}`)
  }
  assert.equal(
    ids.length,
    BUILTIN_IDS.length,
    `sprite 的 symbol 数量（${ids.length}）应等于内置站点数（${BUILTIN_IDS.length}）`,
  )

  for (const symbol of symbols) {
    assert.ok(
      /<(path|rect|circle|line|polyline|polygon|ellipse)\b/i.test(symbol.body || ''),
      `symbol ${symbol.id} 里没有几何图形`,
    )
  }
})

// ---------------------------------------------------------------- 按钮图标

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

// ---------------------------------------------------------------- 分组 chip

testOutput('#group-chips-wrap 初始 hidden；chip 数量 = 分组数 + 1（全部）', () => {
  const clean = stripHtmlComments(html)
  const { wrapOpenTag, container, chips } = extractChips(clean)
  assert.ok(wrapOpenTag, 'index.html 缺少 #group-chips-wrap')
  assert.ok(hasHiddenAttr(wrapOpenTag), '#group-chips-wrap 初始应带 hidden 属性（无 JS 兜底）')
  assert.ok(container !== null, '#group-chips 必须位于 #group-chips-wrap 内')

  assert.ok(Array.isArray(SS.siteGroups), '缺少 SS.siteGroups')
  const groupIds = SS.siteGroups.map((group) => group.id)
  assert.equal(chips.length, groupIds.length + 1, `chip 数量应为 ${groupIds.length + 1}（全部 + ${groupIds.length} 类）`)

  const allowed = new Set(['all', ...groupIds])
  for (const chip of chips) {
    assert.ok(allowed.has(chip.group), `chip 的 data-group=${JSON.stringify(chip.group)} 非法`)
    assert.ok(chip.label.length > 0, `chip data-group=${chip.group} 的文案为空`)
  }

  assert.deepEqual(
    chips.map((chip) => chip.group),
    ['all', ...groupIds],
    `chip 顺序应为「全部 + 分组表顺序」：${['all', ...groupIds].join(', ')}`,
  )
})

testOutput('chip 的 aria-pressed：只有「全部」初始为 true，其余为 false', () => {
  const { chips } = extractChips(stripHtmlComments(html))
  assert.ok(chips.length > 0, '没有解析到任何 chip')
  for (const chip of chips) {
    assert.ok(
      chip.pressed === 'true' || chip.pressed === 'false',
      `chip data-group=${chip.group} 的 aria-pressed 缺失或非法：${JSON.stringify(chip.pressed)}`,
    )
  }
  const pressed = chips.filter((chip) => chip.pressed === 'true')
  assert.equal(pressed.length, 1, `初始应只有一个 chip aria-pressed="true"，实际 ${pressed.length} 个`)
  assert.equal(pressed[0].group, 'all', '初始选中的必须是「全部」chip')
  assert.match(pressed[0].label, /全部/, `「全部」chip 文案不含「全部」：${JSON.stringify(pressed[0].label)}`)
})

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

  assert.ok(!/<img\b/i.test(clean), 'index.html 出现 <img>，v2.2 图标必须内联 SVG')
  assert.ok(!/<picture\b/i.test(clean), 'index.html 出现 <picture>')

  for (const match of clean.matchAll(/<(link|script|img|source|iframe|embed|object)\b[^>]*>/gi)) {
    const tag = match[0]
    for (const attr of ['src', 'href', 'data']) {
      const url = getAttr(tag, attr)
      if (!url) continue
      assert.ok(
        !/^(https?:)?\/\//i.test(url),
        `出现外部资源引用：<${match[1]}> ${attr}=${url}（v2.2 零额外请求红线）`,
      )
    }
  }

  assert.ok(
    !/icons\.duckduckgo\.com|favicon\.(io|cc|com)|google\.com\/s2\/favicons/i.test(clean),
    '出现外链 favicon 服务',
  )

  const styleBlocks = clean.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []
  for (const block of styleBlocks) {
    assert.ok(
      !/url\(\s*['"]?(?!data:)[^)]*\.(svg|png|jpe?g|gif|webp|ico)\b/i.test(block),
      '内联 <style> 中出现图片 url()（应使用内联 SVG，不能新增图片请求）',
    )
  }

  // favicon 允许保留但必须是本地资源
  for (const match of clean.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = getAttr(tag, 'rel') || ''
    if (!/\bicon\b/i.test(rel)) continue
    const href = getAttr(tag, 'href') || ''
    assert.ok(!/^(https?:)?\/\//i.test(href), `favicon 不得外链：${href}`)
  }
})
