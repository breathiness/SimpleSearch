// SimpleSearch v2.3 静态校验与产物一致性门禁。
// 用法：node scripts/validate.mjs（npm run validate）
//
// 产物模型（docs/contract.md §7、§12、§13、§14）：
//   index.html                唯一真实页面（MDUI 文档站骨架：appbar + 左侧分类导航 + 内容卡片 + 右侧设置面板）
//   SimpleSearch-Light.html   0 秒重定向壳 → index.html?theme=light
//   SimpleSearch-Dark.html    0 秒重定向壳 → index.html?theme=dark
//
// 检查内容：
//   1. 生成产物与模板/注册表一致（spawnSync 调 `node scripts/build.mjs --check`，退出码透传为失败）
//   2. 三个产物齐全、均由 build.mjs 生成（带构建标记）
//   3. index.html head：charset / lang / viewport / theme-color / favicon / data-theme / data-theme-default=auto
//   4. index.html 硬约束：无 type="module"、无内联 on* 事件、无未替换 {{...}}、无重复 id、DOM 契约 id 齐全
//   5. index.html 引用的所有本地 resources 真实存在
//   6. index.html 按契约顺序引用 8 个经典脚本（remote.js 在 input.js 之前）
//   7. index.html 的 data-site 与 SS.sites 一一对应（顺序/label/数量/data-group）
//   8. v2.3 骨架：.appbar/.shell/#main-content/.card 卡片、设置面板（dialog/hidden/2 个 .switch-row/固定文案）、
//      无页脚；#scrim 初始 hidden
//   9. v2.3 左侧分类导航：#site-nav + nav#group-chips.nav-list 内 .nav-item 数量/顺序/data-group，
//      选中语义 aria-current（初始只有「全部」为 true）
//  10. v2.3 图标：sprite = 11 个站点 symbol + 3 个 UI symbol（i-menu/i-settings/i-close）；
//      每个按钮 .button-icon，所有 <use> 目标都能在 sprite 命中
//  11. sprite 内联体积 ≤ 6KB（未压缩，契约 §14.2）
//  12. 图标零图片请求：无 .png/.jpg/.webp/.gif/.ico 引用、无外链 favicon 服务
//  13. 两个重定向壳：meta refresh 0 秒 + canonical + location.replace 均指向 index.html?theme=X；
//      壳不得包含真实页内容（#buttons-container / data-site / assets/js bundle），体积 < 1KB
//  14. 唯一性：只有 index.html 是真实页
//  15. CSS 不含 !important（契约 §6）
//  16. 体积信息：index.html 单页加载资源合计 < 100KB（仅提示，契约 §9.9）
// 任一失败 → 退出码 1，并打印失败详情。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const REAL_PAGE = 'index.html'
const SHELLS = [
  { file: 'SimpleSearch-Light.html', theme: 'light' },
  { file: 'SimpleSearch-Dark.html', theme: 'dark' },
]

// 契约 §6 / §12.1：入口页脚本顺序（remote.js 必须在 input.js 之前）
const EXPECTED_SCRIPTS = [
  'assets/js/sites.js',
  'assets/js/search.js',
  'assets/js/suggest.js',
  'assets/js/history.js',
  'assets/js/theme.js',
  'assets/js/remote.js',
  'assets/js/input.js',
  'assets/js/app.js',
]

// 契约 §6 / §14.1：真实页必须存在的 DOM 挂载点（v2.3 移除 #site-footer，新增文档站骨架与设置面板）
const REQUIRED_IDS = [
  'search-form',
  'search-input',
  'clear-button',
  'suggest-list',
  'search-submit',
  'buttons-container',
  'theme-toggle',
  'suggest-source-toggle',
  'site-nav',
  'group-chips',
  'main-content',
  'nav-toggle',
  'settings-toggle',
  'settings-panel',
  'settings-title',
  'settings-close',
  'scrim',
]

// 契约 §14.2：sprite 里的 UI 图标（与 11 个站点图标共存）
const UI_SYMBOL_IDS = ['i-menu', 'i-settings', 'i-close']

// 契约 §4.1：内置 11 站（顺序固定；v2.2 §13.2 要求 sprite symbol 数量与之对应）
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

const BUILD_MARKER = /<!--\s*由 scripts\/build\.mjs/
// 体积预算口径（lead 2026-11-11 v2.3）：单页加载 < 100 KB（gzip 前；契约 §9.9，v2.3 应用外壳后更新）
const BUDGET_KB = 100
const SHELL_MAX_BYTES = 1024

// ---------------------------------------------------------------- 通用工具

function rel(target) {
  return path.relative(ROOT, target).split(path.sep).join('/')
}

function readText(file) {
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

// 去掉 HTML 注释，避免注释里的示例文本干扰属性/占位符检查。
function stripHtmlComments(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, '')
}

function getAttr(source, name) {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = source.match(regex)
  if (!match) return null
  return match[1] ?? match[2] ?? match[3] ?? null
}

function findAll(html, regex) {
  return [...String(html).matchAll(regex)]
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, '')
}

/** 从 <meta ...> 里按 name= 查找。 */
function findMetaByName(html, name) {
  for (const match of findAll(stripHtmlComments(html), /<meta\b[^>]*>/gi)) {
    const tag = match[0]
    if (getAttr(tag, 'name')?.toLowerCase() === name.toLowerCase()) return tag
  }
  return null
}

/** 从 <meta ...> 里按 http-equiv= 查找（含内容）。 */
function findMetaByHttpEquiv(html, value) {
  for (const match of findAll(stripHtmlComments(html), /<meta\b[^>]*>/gi)) {
    const tag = match[0]
    if (getAttr(tag, 'http-equiv')?.toLowerCase() === value.toLowerCase()) return tag
  }
  return null
}

/** 提取页面里所有 <link rel="...icon..."> 的 href。 */
function findFaviconHrefs(html) {
  const hrefs = []
  for (const match of findAll(stripHtmlComments(html), /<link\b[^>]*>/gi)) {
    const tag = match[0]
    const relValue = getAttr(tag, 'rel')
    if (!relValue) continue
    const kinds = relValue.toLowerCase().split(/\s+/)
    if (kinds.includes('icon') || kinds.includes('shortcut')) {
      const href = getAttr(tag, 'href')
      if (href) hrefs.push(href)
    }
  }
  return hrefs
}

/** 提取 rel="canonical" 的 href 列表。 */
function findCanonicalHrefs(html) {
  const hrefs = []
  for (const match of findAll(stripHtmlComments(html), /<link\b[^>]*>/gi)) {
    const tag = match[0]
    const relValue = getAttr(tag, 'rel')
    if (!relValue) continue
    if (!relValue.toLowerCase().split(/\s+/).includes('canonical')) continue
    const href = getAttr(tag, 'href')
    if (href) hrefs.push(href)
  }
  return hrefs
}

/** 提取 location.replace('...') 的目标 URL 列表（支持单双引号与反引号）。 */
function extractLocationReplaceTargets(html) {
  const targets = []
  const regex = /location\.replace\s*\(\s*([`'"])([^`'"]*)\1\s*\)/g
  for (const match of findAll(html, regex)) targets.push(match[2])
  return targets
}

/** 解析 HTML 里会触发子资源加载的本地路径（外部 URL / data: / # 锚点跳过）。 */
function extractResourceRefs(html) {
  const refs = []
  const tagRe = /<(link|script|img|source|iframe|video|audio|embed|object)\b[^>]*>/gi
  for (const tagMatch of findAll(stripHtmlComments(html), tagRe)) {
    const tagName = tagMatch[1].toLowerCase()
    const tag = tagMatch[0]
    for (const attrName of ['src', 'href', 'poster', 'data']) {
      if (attrName === 'data' && tagName !== 'object') continue
      const url = getAttr(tag, attrName)
      if (!url) continue
      refs.push({ tagName, attrName, url: url.trim() })
    }
  }
  return refs
}

/** 判断一个 URL 是否是外部地址。 */
function isExternalUrl(url) {
  return /^(https?:)?\/\//i.test(url) || /^(data|blob|mailto|tel):/i.test(url)
}

// 按钮文字：优先取 .button-label（v2.2 起按钮内还有 .button-icon / monogram，不能直接 stripTags）。
function extractButtonLabel(inner) {
  const labelSpan = inner.match(
    /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bbutton-label\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  )
  let source = labelSpan ? labelSpan[1] : inner
  if (!labelSpan) {
    // 兼容旧模板：去掉图标 svg 与 monogram span，避免把图标文字算进按钮文字
    source = source
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
      .replace(/<span\b[^>]*\bclass\s*=\s*["'][^"']*\bbutton-icon\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
  }
  return decodeHtmlEntities(stripTags(source)).trim()
}

/** 把站点按钮解析为 [{ id, label }]，保持文档顺序。 */
function extractSiteButtons(html) {
  const buttons = []
  const buttonRe = /<button\b[^>]*>[\s\S]*?<\/button>/gi
  for (const match of findAll(stripHtmlComments(html), buttonRe)) {
    const buttonHtml = match[0]
    const id = getAttr(buttonHtml, 'data-site')
    if (id === null) continue
    const inner = buttonHtml.slice(buttonHtml.indexOf('>') + 1, buttonHtml.lastIndexOf('</button>'))
    buttons.push({
      id: decodeHtmlEntities(id),
      label: extractButtonLabel(inner),
      group: getAttr(buttonHtml, 'data-group'),
      inner,
    })
  }
  return buttons
}

function extractScriptSrcs(html) {
  const srcs = []
  for (const match of findAll(stripHtmlComments(html), /<script\b[^>]*>/gi)) {
    const src = getAttr(match[0], 'src')
    if (src) srcs.push(src.trim())
  }
  return srcs
}

// ---------------------------------------------------------------- v2.2 §13 解析工具

function hasHiddenAttr(openTag) {
  return /\shidden(?:\s|=|>|\/)/i.test(openTag)
}

/** 提取内联图标 sprite：<svg class="icon-sprite">…<symbol id="i-xxx">…</symbol>…</svg> */
function extractSprite(html) {
  const open = String(html).match(/<svg\b[^>]*\bclass\s*=\s*["'][^"']*\bicon-sprite\b[^"']*["'][^>]*>/i)
  if (!open) return null
  const start = open.index + open[0].length
  const end = String(html).indexOf('</svg>', start)
  if (end === -1) return null
  return {
    openTag: open[0],
    inner: String(html).slice(start, end),
    outer: String(html).slice(open.index, end + '</svg>'.length),
  }
}

function extractSymbols(spriteInner) {
  const symbols = []
  for (const match of findAll(spriteInner, /<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/gi)) {
    symbols.push({ id: getAttr(match[0], 'id'), body: match[2] })
  }
  return symbols
}

/** 扫描所有起始标签（v2.3 骨架/面板按 id/class 定位用）。 */
function findAllTags(source) {
  return findAll(String(source), /<[a-zA-Z][\w:-]*\b[^>]*>/g).map((match) => match[0])
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

/** 取某个 id 元素的内部文本（按同名闭合标签截取）。 */
function textOfId(source, id) {
  const tag = findTagById(source, id)
  if (!tag) return null
  const tagName = (tag.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const start = source.indexOf(tag) + tag.length
  const end = source.indexOf(`</${tagName}>`, start)
  if (end === -1) return null
  return decodeHtmlEntities(stripTags(source.slice(start, end))).trim()
}

/** v2.3 左侧分类导航：nav#group-chips.nav-list 内的 button.nav-item[data-group][aria-current]。 */
function extractGroupNav(html) {
  const clean = stripHtmlComments(html)
  const navOpen = findTagById(clean, 'group-chips')
  if (!navOpen) return null
  const start = clean.indexOf(navOpen) + navOpen.length
  const end = clean.indexOf('</nav>', start)
  if (end === -1) return null
  const inner = clean.slice(start, end)
  const items = []
  for (const match of findAll(inner, /<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'nav-item')) continue
    const text = decodeHtmlEntities(stripTags(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>')))).trim()
    items.push({
      group: getAttr(openTag, 'data-group'),
      current: getAttr(openTag, 'aria-current'),
      label: text,
    })
  }
  return { navOpen, items }
}

/** v2.3 设置面板里的 .switch-row 按钮。 */
function extractSwitchRows(html) {
  const clean = stripHtmlComments(html)
  const rows = []
  for (const match of findAll(clean, /<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'switch-row')) continue
    const text = decodeHtmlEntities(stripTags(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>')))).trim()
    rows.push({ id: getAttr(openTag, 'id'), pressed: getAttr(openTag, 'aria-pressed'), text })
  }
  return rows
}

/** 页面里所有 <use href="#..."> 的目标 symbol id。 */
function extractUseTargets(html) {
  const targets = []
  for (const match of findAll(html, /<use\b[^>]*\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/gi)) {
    targets.push(match[1])
  }
  return targets
}

/** 检查一个按钮内部是否带 .button-icon（svg <use> 或 monogram 兜底）。 */
function inspectButtonIcon(inner) {
  const svgMatch = inner.match(
    /<svg\b[^>]*\bclass\s*=\s*["'][^"']*\bbutton-icon\b[^"']*["'][^>]*>[\s\S]*?<\/svg>/i,
  )
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

function indent(text, prefix) {
  return String(text)
    .trim()
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

// ---------------------------------------------------------------- 检查框架

const checks = []

function check(name, run) {
  const record = { name, problems: [], notes: [] }
  try {
    const result = run()
    if (Array.isArray(result)) {
      record.problems.push(...result.filter(Boolean))
    } else if (result && typeof result === 'object') {
      record.problems.push(...(result.problems || []).filter(Boolean))
      record.notes.push(...(result.notes || []).filter(Boolean))
    }
  } catch (error) {
    record.problems.push(`检查执行异常：${error && error.stack ? error.stack : error}`)
  }
  checks.push(record)
  return record
}

// ---------------------------------------------------------------- 读取产物与注册表

async function loadRegistry() {
  const sitesPath = path.join(ROOT, 'assets', 'js', 'sites.js')
  if (!fs.existsSync(sitesPath)) {
    return { sites: null, problem: '缺少 assets/js/sites.js，无法校验站点渲染' }
  }
  try {
    delete globalThis.SimpleSearch
    await import(`${pathToFileURL(sitesPath).href}?validate=${Date.now()}`)
    const SS = globalThis.SimpleSearch
    if (!SS || !Array.isArray(SS.sites)) {
      return { sites: null, problem: 'assets/js/sites.js 未在 globalThis.SimpleSearch.sites 注册站点数组' }
    }
    return { sites: SS.sites, siteGroups: SS.siteGroups, problem: null }
  } catch (error) {
    return { sites: null, problem: `加载 sites.js 失败：${error && error.message ? error.message : error}` }
  }
}

const registry = await loadRegistry()
const sites = registry.sites
const siteGroups = registry.siteGroups || null
const siteIds = sites ? sites.map((site) => site.id) : []

const realPage = {
  file: REAL_PAGE,
  path: path.join(ROOT, REAL_PAGE),
  html: readText(path.join(ROOT, REAL_PAGE)),
}
realPage.exists = realPage.html !== null

const shells = SHELLS.map((shell) => {
  const filePath = path.join(ROOT, shell.file)
  const html = readText(filePath)
  return { ...shell, path: filePath, html, exists: html !== null }
})

// ---------------------------------------------------------------- 1. 产物一致性

check('产物一致性：node scripts/build.mjs --check', () => {
  const buildScript = path.join(ROOT, 'scripts', 'build.mjs')
  if (!fs.existsSync(buildScript)) return ['缺少 scripts/build.mjs']

  const result = spawnSync(process.execPath, [buildScript, '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
  })

  if (result.error) return [`无法执行 scripts/build.mjs --check：${result.error.message}`]
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter((part) => part && part.trim()).join('\n')
    return [
      `build --check 退出码 ${result.status}（产物与模板/注册表不一致，或构建失败）` +
        (output ? `\n${indent(output, '        ')}` : ''),
    ]
  }
  return { problems: [], notes: [(result.stdout || '').trim().split('\n').filter(Boolean).join(' / ')] }
})

// ---------------------------------------------------------------- 2. 三产物齐全

check('三个产物齐全且均由 templates + build.mjs 生成（带构建标记）', () => {
  const problems = []
  const outputs = [realPage, ...shells]
  for (const output of outputs) {
    if (!output.exists) {
      problems.push(`${output.file} 不存在（先运行 npm run build）`)
      continue
    }
    if (output.html.trim() === '') problems.push(`${output.file} 是空文件`)
    else if (!BUILD_MARKER.test(output.html)) {
      problems.push(`${output.file} 缺少「由 scripts/build.mjs 生成」注释，疑似手改或旧版本`)
    }
  }
  return problems
})

// ---------------------------------------------------------------- 3. index.html head

check('index.html head：charset / lang / viewport / theme-color / favicon / data-theme-default=auto', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const html = realPage.html
  const clean = stripHtmlComments(html)
  const problems = []

  // charset=utf-8
  let charsetOk = false
  for (const match of findAll(clean, /<meta\b[^>]*>/gi)) {
    const value = getAttr(match[0], 'charset')
    if (value && value.toLowerCase() === 'utf-8') charsetOk = true
  }
  if (!charsetOk) problems.push(`${REAL_PAGE} 缺少 <meta charset="utf-8">`)

  const htmlTagMatch = clean.match(/<html\b[^>]*>/i)
  if (!htmlTagMatch) {
    problems.push(`${REAL_PAGE} 找不到 <html> 标签`)
  } else {
    const htmlTag = htmlTagMatch[0]
    const lang = getAttr(htmlTag, 'lang')
    if (lang !== 'zh-CN') problems.push(`${REAL_PAGE} 的 lang 应为 zh-CN，实际为 ${JSON.stringify(lang)}`)

    const dataTheme = getAttr(htmlTag, 'data-theme')
    if (dataTheme !== 'light' && dataTheme !== 'dark') {
      problems.push(`${REAL_PAGE} 的 data-theme 应为 light|dark，实际为 ${JSON.stringify(dataTheme)}`)
    }

    const dataThemeDefault = getAttr(htmlTag, 'data-theme-default')
    if (dataThemeDefault !== 'auto') {
      problems.push(
        `${REAL_PAGE} 的 data-theme-default 应为 "auto"（单页主题），实际为 ${JSON.stringify(dataThemeDefault)}`,
      )
    }
  }

  const viewportMeta = findMetaByName(html, 'viewport')
  if (!viewportMeta) problems.push(`${REAL_PAGE} 缺少 <meta name="viewport">`)
  else if (!/width\s*=\s*device-width/i.test(getAttr(viewportMeta, 'content') || '')) {
    problems.push(`${REAL_PAGE} 的 viewport 缺少 width=device-width`)
  }

  const themeColorMeta = findMetaByName(html, 'theme-color')
  if (!themeColorMeta) problems.push(`${REAL_PAGE} 缺少 <meta name="theme-color">`)
  else if (!getAttr(themeColorMeta, 'content')) problems.push(`${REAL_PAGE} 的 theme-color 内容为空`)

  if (findFaviconHrefs(html).length === 0) problems.push(`${REAL_PAGE} 缺少 <link rel="icon">`)

  return problems
})

// ---------------------------------------------------------------- 4. index.html 硬约束

check('index.html 硬约束：无 type="module" / 无内联事件 / 无占位符 / 无重复 id / DOM 契约 id 齐全', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []

  if (/type\s*=\s*["']module["']/i.test(clean)) {
    problems.push(`${REAL_PAGE} 出现 type="module"（破坏 file:// 双击可用性）`)
  }

  const inlineEvents = clean.match(/\son[a-z]+\s*=\s*["']/gi) || []
  if (inlineEvents.length > 0) {
    problems.push(`${REAL_PAGE} 含内联事件属性：${[...new Set(inlineEvents.map((item) => item.trim()))].join(', ')}`)
  }

  const placeholders = [...new Set(clean.match(/\{\{[A-Za-z0-9_]+\}\}/g) || [])]
  if (placeholders.length > 0) {
    problems.push(`${REAL_PAGE} 存在未替换的模板占位符：${placeholders.join(', ')}`)
  }

  const ids = []
  for (const match of findAll(clean, /<[a-zA-Z][\w:-]*\b[^>]*\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const id = match[1] ?? match[2]
    if (id) ids.push(id)
  }
  const seen = new Set()
  const duplicates = new Set()
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  if (duplicates.size > 0) problems.push(`${REAL_PAGE} 存在重复 id：${[...duplicates].join(', ')}`)

  for (const id of REQUIRED_IDS) {
    if (!seen.has(id)) problems.push(`${REAL_PAGE} 缺少契约 §6 要求的挂载点 id="${id}"`)
  }

  return problems
})

// ---------------------------------------------------------------- 5. 本地资源存在性

check('index.html 引用的本地资源全部存在', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const problems = []

  for (const ref of extractResourceRefs(realPage.html)) {
    if (!ref.url || ref.url.startsWith('#')) continue
    if (/^javascript:/i.test(ref.url)) {
      problems.push(`${REAL_PAGE} 出现 javascript: 伪协议：${ref.url}`)
      continue
    }
    if (isExternalUrl(ref.url)) continue

    const withoutQuery = ref.url.split('?')[0].split('#')[0]
    if (withoutQuery === '') continue
    let decodedPath = withoutQuery
    try {
      decodedPath = decodeURIComponent(withoutQuery)
    } catch {
      // 编码异常时按原文处理
    }
    const target = decodedPath.startsWith('/')
      ? path.join(ROOT, decodedPath)
      : path.resolve(ROOT, decodedPath)

    if (!target.startsWith(ROOT)) {
      problems.push(`${REAL_PAGE} 的资源路径越出仓库：${ref.url}`)
      continue
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      problems.push(`${REAL_PAGE} 引用不存在的本地资源：${ref.url}（<${ref.tagName}>）`)
    }
  }
  return problems
})

// ---------------------------------------------------------------- 6. 脚本顺序

check('index.html 按契约顺序引用 8 个经典脚本（remote.js 在 input.js 之前）', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const localScripts = extractScriptSrcs(realPage.html).filter((src) => !isExternalUrl(src))
  if (localScripts.join(',') !== EXPECTED_SCRIPTS.join(',')) {
    return [
      `${REAL_PAGE} 的脚本引用与契约 §6 不一致：\n` +
        `        期望：${EXPECTED_SCRIPTS.join(', ')}\n` +
        `        实际：${localScripts.join(', ') || '（无）'}`,
    ]
  }
  return []
})

// ---------------------------------------------------------------- 7. 站点渲染

check('index.html 站点渲染：data-site 合法、无重复、顺序/label/数量与注册表一致', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  if (!sites) return [registry.problem || '无法读取 SS.sites']

  const problems = []
  const buttons = extractSiteButtons(realPage.html)
  const ids = buttons.map((button) => button.id)

  if (ids.length === 0) return [`${REAL_PAGE} 没有渲染任何 data-site 按钮`]

  for (const id of ids) {
    if (!siteIds.includes(id)) problems.push(`${REAL_PAGE} 的 data-site="${id}" 在 SS.sites 中不存在`)
  }

  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) problems.push(`${REAL_PAGE} 的 data-site="${id}" 重复渲染`)
    seen.add(id)
  }

  if (ids.length !== siteIds.length) {
    problems.push(`${REAL_PAGE} 按钮数 ${ids.length} 与注册表站点数 ${siteIds.length} 不一致`)
  }

  const expectedOrder = siteIds.filter((id) => seen.has(id))
  const actualOrder = ids.filter((id) => siteIds.includes(id))
  if (actualOrder.join(',') !== expectedOrder.join(',')) {
    problems.push(
      `${REAL_PAGE} 站点按钮顺序与注册表不一致：\n` +
        `        期望：${expectedOrder.join(', ')}\n` +
        `        实际：${actualOrder.join(', ')}`,
    )
  }

  for (const id of siteIds) {
    if (!seen.has(id)) problems.push(`${REAL_PAGE} 缺少站点按钮 data-site="${id}"`)
  }

  for (const button of buttons) {
    const site = sites.find((item) => item.id === button.id)
    if (!site) continue
    if (button.label !== site.label) {
      problems.push(
        `${REAL_PAGE} 站点 ${button.id} 的按钮文字应为 ${JSON.stringify(site.label)}，实际为 ${JSON.stringify(button.label)}`,
      )
    }
    // v2.2 §13.1：按钮的 data-group 必须与注册表 group 一致
    if (typeof site.group === 'string' && button.group !== site.group) {
      problems.push(
        `${REAL_PAGE} 站点 ${button.id} 的 data-group 应为 ${JSON.stringify(site.group)}，实际为 ${JSON.stringify(button.group)}`,
      )
    }
  }
  return problems
})

// ---------------------------------------------------------------- 8. v2.3 文档站骨架 + 设置面板

check('v2.3 骨架：.appbar/.shell/#main-content/.card 卡片、#scrim[hidden]、#settings-panel 对话框（2 个 .switch-row/固定文案），无页脚', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const problems = []
  const clean = stripHtmlComments(realPage.html)

  // 顶栏与布局
  if (!findTagWithClass(clean, 'appbar')) problems.push(`${REAL_PAGE} 缺少 header.appbar`)
  if (!findTagWithClass(clean, 'appbar-title')) problems.push(`${REAL_PAGE} 缺少 .appbar-title`)
  if (!findTagById(clean, 'nav-toggle')) problems.push(`${REAL_PAGE} 缺少 #nav-toggle（汉堡按钮）`)
  if (!findTagById(clean, 'settings-toggle')) problems.push(`${REAL_PAGE} 缺少 #settings-toggle（设置按钮）`)
  if (!findTagWithClass(clean, 'shell')) problems.push(`${REAL_PAGE} 缺少 .shell 布局容器`)
  if (!findTagById(clean, 'main-content')) problems.push(`${REAL_PAGE} 缺少 #main-content`)
  if (!findTagWithClass(clean, 'card-search')) problems.push(`${REAL_PAGE} 缺少 .card.card-search`)
  if (!findTagWithClass(clean, 'card-sites')) problems.push(`${REAL_PAGE} 缺少 .card.card-sites`)
  if (!findTagWithClass(clean, 'card-title')) problems.push(`${REAL_PAGE} 缺少 h2.card-title`)
  if (!findTagWithClass(clean, 'nav-group-title')) problems.push(`${REAL_PAGE} 缺少 .nav-group-title`)

  // scrim（抽屉/面板共用遮罩）
  const scrim = findTagById(clean, 'scrim')
  if (!scrim) {
    problems.push(`${REAL_PAGE} 缺少 #scrim`)
  } else {
    if (!hasClass(scrim, 'scrim')) problems.push('#scrim 应带 .scrim 类')
    if (!hasHiddenAttr(scrim)) problems.push('#scrim 初始应带 hidden')
  }

  // 设置面板
  const panel = findTagById(clean, 'settings-panel')
  if (!panel) {
    problems.push(`${REAL_PAGE} 缺少 #settings-panel`)
  } else {
    if ((getAttr(panel, 'role') || '').toLowerCase() !== 'dialog') {
      problems.push(`#settings-panel 的 role 应为 dialog，实际 ${JSON.stringify(getAttr(panel, 'role'))}`)
    }
    if (getAttr(panel, 'aria-modal') !== 'true') problems.push('#settings-panel 的 aria-modal 应为 true')
    if (!hasHiddenAttr(panel)) problems.push('#settings-panel 初始应带 hidden（关闭状态）')
    if (!findTagById(clean, 'settings-title')) problems.push(`${REAL_PAGE} 缺少 #settings-title`)
    if (!findTagById(clean, 'settings-close')) problems.push(`${REAL_PAGE} 缺少 #settings-close`)
    if (!findTagWithClass(clean, 'panel-link')) problems.push(`${REAL_PAGE} 缺少 .panel-link`)

    const rows = extractSwitchRows(clean)
    if (rows.length !== 2) problems.push(`#settings-panel 内应有 2 个 .switch-row，实际 ${rows.length}`)
    const byId = new Map(rows.map((row) => [row.id, row]))

    const themeRow = byId.get('theme-toggle')
    if (!themeRow) {
      problems.push('缺少 #theme-toggle.switch-row')
    } else {
      if (themeRow.text !== '夜间模式') {
        problems.push(`#theme-toggle 文案应固定为「夜间模式」，实际 ${JSON.stringify(themeRow.text)}`)
      }
      if (themeRow.pressed !== 'false') {
        problems.push(`#theme-toggle 初始 aria-pressed 应为 "false"，实际 ${JSON.stringify(themeRow.pressed)}`)
      }
    }

    const remoteRow = byId.get('suggest-source-toggle')
    if (!remoteRow) {
      problems.push('缺少 #suggest-source-toggle.switch-row')
    } else {
      if (remoteRow.text !== '联网联想') {
        problems.push(`#suggest-source-toggle 文案应固定为「联网联想」，实际 ${JSON.stringify(remoteRow.text)}`)
      }
      if (remoteRow.pressed !== 'true') {
        problems.push(`#suggest-source-toggle 初始 aria-pressed 应为 "true"，实际 ${JSON.stringify(remoteRow.pressed)}`)
      }
    }
  }

  // v2.3 移除页脚
  if (/id\s*=\s*["']site-footer["']/i.test(clean)) problems.push('v2.3 已移除 #site-footer，产物里不应出现')
  if (/<footer\b/i.test(clean)) problems.push('v2.3 已移除页脚，产物里不应出现 <footer>')

  return problems
})

// ---------------------------------------------------------------- 9. v2.3 左侧分类导航

check('v2.3 左侧分类导航：#site-nav + #group-chips.nav-list，.nav-item 数量/顺序/data-group/aria-current 正确', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  if (!Array.isArray(siteGroups)) return ['SS.siteGroups 不存在或不是数组（§13.1）']

  const problems = []
  const clean = stripHtmlComments(realPage.html)
  if (!findTagById(clean, 'site-nav')) problems.push(`${REAL_PAGE} 缺少 aside#site-nav（左侧分类导航）`)

  const nav = extractGroupNav(clean)
  if (!nav) return [...problems, `${REAL_PAGE} 缺少 nav#group-chips`]
  if (!hasClass(nav.navOpen, 'nav-list')) problems.push('#group-chips 应带 .nav-list 类')
  if (!/^<nav\b/i.test(nav.navOpen)) problems.push('#group-chips 应是 <nav> 元素')

  const groupIds = siteGroups.map((group) => group.id)
  const expectedGroups = ['all', ...groupIds]
  if (nav.items.length !== expectedGroups.length) {
    problems.push(
      `nav-item 数量应为 ${expectedGroups.length}（全部 + ${groupIds.length} 类），实际 ${nav.items.length}`,
    )
  }

  const actualGroups = nav.items.map((item) => item.group)
  if (actualGroups.join(',') !== expectedGroups.join(',')) {
    problems.push(
      `nav-item 顺序/data-group 不正确：\n        期望：${expectedGroups.join(', ')}\n        实际：${actualGroups.join(', ')}`,
    )
  }

  const allowed = new Set(expectedGroups)
  for (const item of nav.items) {
    if (!allowed.has(item.group)) problems.push(`nav-item 的 data-group=${JSON.stringify(item.group)} 非法`)
    if (!item.label) problems.push(`nav-item data-group=${JSON.stringify(item.group)} 文案为空`)
    if (item.current !== 'true' && item.current !== 'false') {
      problems.push(
        `nav-item data-group=${JSON.stringify(item.group)} 的 aria-current 缺失或非法：${JSON.stringify(item.current)}`,
      )
    }
  }

  const current = nav.items.filter((item) => item.current === 'true')
  if (current.length !== 1) {
    problems.push(`初始应只有一个 nav-item aria-current="true"，实际 ${current.length} 个`)
  } else if (current[0].group !== 'all') {
    problems.push('初始选中的 nav-item 应是「全部」(data-group="all")')
  }

  return problems
})

// ---------------------------------------------------------------- 10. v2.3 图标 sprite / 按钮图标

check('v2.3 图标：sprite = 11 站点 symbol + 3 UI symbol；每个 data-site 按钮有 .button-icon；所有 use 目标命中', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  if (!sites) return [registry.problem || '无法读取 SS.sites']

  const problems = []
  const clean = stripHtmlComments(realPage.html)

  // sprite 本体
  const sprite = extractSprite(clean)
  if (!sprite) {
    problems.push(`${REAL_PAGE} 缺少 <svg class="icon-sprite">（图标必须内联）`)
    return problems
  }
  const hiddenOk =
    hasHiddenAttr(sprite.openTag) ||
    /aria-hidden\s*=\s*["']true["']/i.test(sprite.openTag) ||
    /display\s*:\s*none/i.test(sprite.openTag)
  if (!hiddenOk) problems.push('icon-sprite 必须是隐藏的（hidden / aria-hidden / display:none）')

  const symbols = extractSymbols(sprite.inner)
  const symbolIds = symbols.map((symbol) => symbol.id)
  const symbolSet = new Set(symbolIds)
  const siteIdSet = new Set(siteIds)

  if (symbols.length === 0) problems.push('icon-sprite 里没有任何 <symbol>')
  if (new Set(symbolIds).size !== symbolIds.length) {
    problems.push(`symbol id 重复：${JSON.stringify(symbolIds)}`)
  }
  for (const id of symbolIds) {
    if (!/^i-[a-z0-9-]+$/.test(String(id))) {
      problems.push(`symbol id 不合法：${JSON.stringify(id)}`)
    }
  }

  // 站点 symbol：11 个内置站点全覆盖
  const siteSymbols = symbolIds.filter((id) => id !== null && siteIdSet.has(String(id).slice(2)))
  for (const builtinId of BUILTIN_IDS) {
    if (!symbolIds.includes(`i-${builtinId}`)) problems.push(`sprite 缺少内置站点图标 #i-${builtinId}`)
  }
  if (siteSymbols.length !== BUILTIN_IDS.length) {
    problems.push(`站点 symbol 数量（${siteSymbols.length}）应等于内置站点数（${BUILTIN_IDS.length}）`)
  }

  // UI symbol：i-menu / i-settings / i-close
  for (const uiId of UI_SYMBOL_IDS) {
    if (!symbolIds.includes(uiId)) problems.push(`sprite 缺少 UI 图标 #${uiId}`)
  }
  if (symbolIds.length !== BUILTIN_IDS.length + UI_SYMBOL_IDS.length) {
    problems.push(
      `symbol 总数（${symbolIds.length}）应为 ${BUILTIN_IDS.length + UI_SYMBOL_IDS.length}（${BUILTIN_IDS.length} 站点 + ${UI_SYMBOL_IDS.length} UI）`,
    )
  }

  // 不允许孤儿 symbol
  for (const id of symbolIds) {
    if (UI_SYMBOL_IDS.includes(id)) continue
    if (!siteIdSet.has(String(id).slice(2))) {
      problems.push(`symbol ${id} 既不是站点图标也不是约定的 UI 图标`)
    }
  }

  for (const symbol of symbols) {
    if (!/<(path|rect|circle|line|polyline|polygon|ellipse)\b/i.test(symbol.body || '')) {
      problems.push(`symbol ${symbol.id} 里没有几何图形`)
    }
  }

  // 所有 <use> 目标必须能在 sprite 里命中
  const useTargets = extractUseTargets(clean)
  if (useTargets.length === 0) problems.push('页面里没有任何 <use> 图标引用')
  for (const target of useTargets) {
    if (!symbolSet.has(target)) problems.push(`use 目标 #${target} 不在 sprite 中`)
  }

  // 顶栏/面板的 3 个 UI 图标引用
  const uiExpectations = [
    ['nav-toggle', 'i-menu'],
    ['settings-toggle', 'i-settings'],
    ['settings-close', 'i-close'],
  ]
  for (const [elementId, symbolId] of uiExpectations) {
    const tag = findTagById(clean, elementId)
    if (!tag) {
      problems.push(`缺少 #${elementId}`)
      continue
    }
    const start = clean.indexOf(tag) + tag.length
    const tagName = (tag.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
    const end = clean.indexOf(`</${tagName}>`, start)
    const inner = clean.slice(start, end === -1 ? undefined : end)
    if (!new RegExp(`<use\\b[^>]*\\bhref\\s*=\\s*["']#${symbolId}["']`, 'i').test(inner)) {
      problems.push(`#${elementId} 应引用图标 #${symbolId}`)
    }
  }

  // 每个 data-site 按钮的 .button-icon / use 目标
  const buttons = extractSiteButtons(clean)
  const builtinSet = new Set(BUILTIN_IDS)
  let monograms = 0
  let useIcons = 0
  for (const button of buttons) {
    const icon = inspectButtonIcon(button.inner)
    if (!icon.hasIconClass) problems.push(`站点 ${button.id} 的按钮缺少 .button-icon`)
    if (builtinSet.has(button.id)) {
      if (icon.useTarget !== `i-${button.id}`) {
        problems.push(
          `内置站点 ${button.id} 应使用 <use href="#i-${button.id}">，实际 ${JSON.stringify(icon.useTarget)}`,
        )
      }
    } else if (!icon.useTarget && !icon.monogram) {
      problems.push(`自加站点 ${button.id} 既没有 svg 图标也没有 monogram 兜底`)
    }
    if (icon.useTarget) {
      useIcons += 1
      if (!symbolSet.has(icon.useTarget)) {
        problems.push(`站点 ${button.id} 的 use 目标 #${icon.useTarget} 不在 sprite 中`)
      }
    } else if (icon.monogram) {
      monograms += 1
    }
  }

  return {
    problems,
    notes: [
      `symbol ${symbolIds.length} 个（站点 ${siteSymbols.length} + UI ${UI_SYMBOL_IDS.length}）/ 按钮 use 图标 ${useIcons} 个 / monogram ${monograms} 个`,
    ],
  }
})

// ---------------------------------------------------------------- 11. sprite 体积

check('sprite 内联体积 ≤ 6KB（未压缩，契约 §14.2）', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const sprite = extractSprite(stripHtmlComments(realPage.html))
  if (!sprite) return ['缺少 icon-sprite，无法统计 sprite 体积']
  const bytes = Buffer.byteLength(sprite.outer, 'utf8')
  if (bytes > 6144) return [`icon-sprite 体积 ${bytes} 字节，超过 6KB 红线（未压缩）`]
  return { problems: [], notes: [`sprite ${(bytes / 1024).toFixed(2)} KB`] }
})

// ---------------------------------------------------------------- 12. 零额外图片请求

check('图标零图片请求：无 .png/.jpg/.webp/.gif/.ico 引用、无外链 favicon 服务', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []
  const imagePattern = /\.(png|jpe?g|webp|gif|ico)(?:["'?)#\s]|$)/i

  for (const match of findAll(clean, /<(link|script|img|source|iframe|embed|object)\b[^>]*>/gi)) {
    const tag = match[0]
    for (const attr of ['src', 'href', 'data', 'poster']) {
      const url = getAttr(tag, attr)
      if (!url) continue
      if (/^(https?:)?\/\//i.test(url)) problems.push(`出现外部资源引用：<${match[1]}> ${attr}=${url}`)
      if (imagePattern.test(url)) problems.push(`出现图片资源引用：<${match[1]}> ${attr}=${url}（v2.2 图标必须内联）`)
    }
  }
  if (/<img\b/i.test(clean)) problems.push(`${REAL_PAGE} 出现 <img>，v2.2 图标必须内联 SVG`)
  if (/icons\.duckduckgo\.com|favicon\.(io|cc|com)|google\.com\/s2\/favicons/i.test(clean)) {
    problems.push('出现外链 favicon 服务')
  }
  for (const match of findAll(clean, /<style\b[^>]*>[\s\S]*?<\/style>/gi)) {
    if (/url\(\s*['"]?(?!data:)[^)]*\.(svg|png|jpe?g|gif|webp|ico)\b/i.test(match[0])) {
      problems.push('内联 <style> 中出现图片 url()（应使用内联 SVG）')
    }
  }
  for (const match of findAll(clean, /<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = (getAttr(tag, 'rel') || '').toLowerCase()
    if (!/\bicon\b/.test(rel)) continue
    const href = getAttr(tag, 'href') || ''
    if (/^(https?:)?\/\//i.test(href)) problems.push(`favicon 不得外链：${href}`)
  }
  return problems
})

// ---------------------------------------------------------------- 13. 重定向壳

check('两个重定向壳：meta refresh(0s) + canonical + location.replace 指向 index.html?theme=X，且不含真实页内容', () => {
  const problems = []
  for (const shell of shells) {
    if (!shell.exists) {
      problems.push(`${shell.file} 不存在（先运行 npm run build）`)
      continue
    }
    const html = shell.html
    const expectedTarget = `index.html?theme=${shell.theme}`
    const size = Buffer.byteLength(html, 'utf8')

    // 体积：壳体积极小
    if (size >= SHELL_MAX_BYTES) {
      problems.push(`${shell.file} 体积 ${size} 字节，重定向壳应 < ${SHELL_MAX_BYTES} 字节`)
    }

    // meta refresh，0 秒
    const refreshMeta = findMetaByHttpEquiv(html, 'refresh')
    if (!refreshMeta) {
      problems.push(`${shell.file} 缺少 <meta http-equiv="refresh">（无 JS 也要能跳转）`)
    } else {
      const content = (getAttr(refreshMeta, 'content') || '').replace(/\s+/g, ' ').trim()
      const refreshRe = new RegExp(`^0\\s*;\\s*url\\s*=\\s*['"]?${expectedTarget.replace(/[?]/g, '\\?')}\\b`, 'i')
      if (!refreshRe.test(content)) {
        problems.push(`${shell.file} 的 meta refresh 应为 0 秒并指向 ${expectedTarget}，实际：${JSON.stringify(content)}`)
      }
    }

    // canonical
    const canonicals = findCanonicalHrefs(html)
    if (canonicals.length === 0) {
      problems.push(`${shell.file} 缺少 <link rel="canonical">`)
    } else if (!canonicals.some((href) => href.includes(expectedTarget))) {
      problems.push(`${shell.file} 的 canonical 应指向 ${expectedTarget}，实际：${canonicals.join(', ')}`)
    }

    // location.replace
    const replaceTargets = extractLocationReplaceTargets(html)
    if (replaceTargets.length === 0) {
      problems.push(`${shell.file} 缺少 location.replace(...) 跳转（有 JS 时立即跳转）`)
    } else if (!replaceTargets.every((target) => target.includes(expectedTarget))) {
      problems.push(`${shell.file} 的 location.replace 应指向 ${expectedTarget}，实际：${replaceTargets.join(', ')}`)
    }

    // 壳不得包含真实页内容
    const clean = stripHtmlComments(html)
    if (/id\s*=\s*["']buttons-container["']/i.test(clean)) {
      problems.push(`${shell.file} 不应包含 #buttons-container（壳里不能有真实页内容）`)
    }
    if (/\bdata-site\s*=/i.test(clean)) {
      problems.push(`${shell.file} 不应包含 site 按钮（data-site）`)
    }
    if (/<script\b[^>]*\bsrc\s*=\s*["'][^"']*assets\/js\//i.test(clean)) {
      problems.push(`${shell.file} 不应引用 assets/js 脚本 bundle`)
    }
    if (/type\s*=\s*["']module["']/i.test(clean)) {
      problems.push(`${shell.file} 出现 type="module"`)
    }
    if (/\son[a-z]+\s*=\s*["']/i.test(clean)) {
      problems.push(`${shell.file} 含内联事件属性`)
    }
    const placeholders = [...new Set(clean.match(/\{\{[A-Za-z0-9_]+\}\}/g) || [])]
    if (placeholders.length > 0) {
      problems.push(`${shell.file} 存在未替换的占位符：${placeholders.join(', ')}`)
    }
  }
  return problems
})

// ---------------------------------------------------------------- 14. 唯一性

check('唯一性：只有 index.html 是真实页（两个壳不得含真实页 DOM）', () => {
  const problems = []
  if (!realPage.exists) {
    problems.push(`${REAL_PAGE} 不存在`)
  } else {
    const clean = stripHtmlComments(realPage.html)
    for (const id of ['buttons-container', 'search-form', 'suggest-source-toggle']) {
      if (!new RegExp(`id\\s*=\\s*["']${id}["']`, 'i').test(clean)) {
        problems.push(`${REAL_PAGE} 缺少真实页必需挂载点 #${id}`)
      }
    }
  }

  for (const shell of shells) {
    if (!shell.exists) continue
    const clean = stripHtmlComments(shell.html)
    for (const id of ['buttons-container', 'search-form', 'search-input']) {
      if (new RegExp(`id\\s*=\\s*["']${id}["']`, 'i').test(clean)) {
        problems.push(`${shell.file} 含真实页挂载点 #${id}，不再是重定向壳`)
      }
    }
  }
  return problems
})

// ---------------------------------------------------------------- 15. CSS 禁 !important

check('CSS 不含 !important（契约 §6）', () => {
  const cssDir = path.join(ROOT, 'assets', 'css')
  if (!fs.existsSync(cssDir)) return ['缺少 assets/css 目录']
  const files = fs.readdirSync(cssDir).filter((file) => file.endsWith('.css')).sort()
  if (files.length === 0) return ['assets/css 下没有 CSS 文件']

  const problems = []
  for (const file of files) {
    const full = path.join(cssDir, file)
    const source = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    source.split('\n').forEach((line, index) => {
      if (/!important/i.test(line)) {
        problems.push(`assets/css/${file}:${index + 1} 使用了 !important：${line.trim()}`)
      }
    })
  }
  return problems
})

// ---------------------------------------------------------------- 16. 体积信息

check('体积信息（index.html 单页加载预算 < 100 KB，仅供参考不阻断）', () => {
  if (!realPage.exists) return { problems: [], notes: [`${REAL_PAGE} 不存在，跳过体积统计`] }

  const notes = []
  const assetBytes = new Map()
  const assetDirs = ['assets/css', 'assets/js', 'assets/img']
  let assetTotal = 0
  for (const dir of assetDirs) {
    const full = path.join(ROOT, dir)
    if (!fs.existsSync(full)) continue
    let bytes = 0
    for (const file of fs.readdirSync(full)) {
      const target = path.join(full, file)
      if (!fs.statSync(target).isFile()) continue
      const size = fs.statSync(target).size
      bytes += size
      assetBytes.set(`${dir}/${file}`, size)
    }
    assetTotal += bytes
    notes.push(`${dir}：${(bytes / 1024).toFixed(1)} KB`)
  }

  const htmlBytes = Buffer.byteLength(realPage.html, 'utf8')
  let loaded = htmlBytes
  for (const ref of extractResourceRefs(realPage.html)) {
    if (!ref.url || isExternalUrl(ref.url) || ref.url.startsWith('#')) continue
    const cleanUrl = ref.url.split('?')[0].split('#')[0].replace(/\\/g, '/')
    if (assetBytes.has(cleanUrl)) loaded += assetBytes.get(cleanUrl)
  }
  const verdict = loaded < BUDGET_KB * 1024 ? '达标' : '超出'
  notes.push(`${REAL_PAGE}：${(htmlBytes / 1024).toFixed(1)} KB`)
  notes.push(`${REAL_PAGE} 单页加载体积：${(loaded / 1024).toFixed(1)} KB（${verdict} < ${BUDGET_KB} KB 预算）`)
  notes.push(`全部资源合计：${(assetTotal / 1024).toFixed(1)} KB`)
  return { problems: [], notes }
})

// ---------------------------------------------------------------- 输出摘要

function printReport() {
  const failed = checks.filter((item) => item.problems.length > 0)
  const passed = checks.length - failed.length

  console.log('SimpleSearch v2.1 静态校验（validate）')
  console.log(`仓库：${ROOT}`)
  console.log(`产物：${REAL_PAGE}（真实页）+ ${SHELLS.map((shell) => shell.file).join(' + ')}（重定向壳）`)
  console.log('')

  for (const item of checks) {
    if (item.problems.length === 0) {
      console.log(`PASS  ${item.name}`)
      for (const note of item.notes) console.log(`      · ${note}`)
    } else {
      console.log(`FAIL  ${item.name}`)
      for (const problem of item.problems) console.log(`      - ${problem}`)
      for (const note of item.notes) console.log(`      · ${note}`)
    }
  }

  console.log('')
  console.log(`汇总：${passed} 项通过，${failed.length} 项失败（共 ${checks.length} 项）`)

  if (failed.length > 0) {
    console.log('结果：FAIL')
    for (const item of failed) console.log(`  - ${item.name}`)
    process.exitCode = 1
    return
  }
  console.log('结果：PASS')
}

printReport()
