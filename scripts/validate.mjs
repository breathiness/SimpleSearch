// SimpleSearch v2.9 静态校验与产物一致性门禁。
// 用法：node scripts/validate.mjs（npm run validate）
//
// 产物模型（docs/contract.md §7、§12-§17）：npm run build 生成 5 个产物
//   index.html                唯一真实页面（多文件版：文档站骨架 + 主题三态/19 色 + 历史行 + 引擎切换 + 快捷键 + PWA + 内联 sprite）
//   SimpleSearch.html         单文件便携版（CSS/JS/图标全部内联、零外部请求；无 manifest/apple-touch-icon）
//   SimpleSearch-Light.html   0 秒重定向壳 → index.html?theme=light
//   SimpleSearch-Dark.html    0 秒重定向壳 → index.html?theme=dark
//   manifest.webmanifest      静态 PWA manifest；sw.js 由 build 从 templates/sw.js 生成（sw/manifest/PWA 图标不计入首屏）
//
// 检查内容：
//   1. 生成产物与模板/注册表一致（spawnSync 调 `node scripts/build.mjs --check`，退出码透传为失败）
//   2. 主产物（index.html + 两个重定向壳）齐全、均由 build.mjs 生成（带构建标记）；
//      sw.js / manifest / SimpleSearch.html 由各自的专项检查覆盖
//   3. index.html head：charset / lang / viewport / theme-color / favicon / data-theme / data-theme-default=auto
//   4. index.html 硬约束：无 type="module"、无内联 on* 事件、无未替换 {{...}}、无重复 id、DOM 契约 id 齐全
//   5. index.html 引用的所有本地 resources 真实存在
//   6. index.html 按契约顺序引用 10 个经典脚本（remote.js 在 input.js 之前；sites-store/sites-admin 在 app.js 之前）
//   7. index.html 的 data-site 与 SS.sites 一一对应（顺序/label/数量/data-group）
//   8. 文档站骨架：.appbar（含 .appbar-logo→#i-logo）/.shell/#main-content/.card、
//      设置面板（dialog/hidden/#theme-mode 三段式/唯一 .switch-row/.settings-row+空 #color-swatches）、
//      无页脚、无 #theme-toggle、#scrim[hidden]
//   9. 左侧分类导航：#site-nav + nav#group-chips.nav-list 内 .nav-item（数量/顺序/data-group/aria-current），
//      每个 nav-item 有 .nav-icon（#i-cat-<group>）+ .nav-label
//  10. 主题色：<html data-color="indigo">；tokens.css 19 组 :root[data-color]（每组 4 个 --c-*）+ 语义变量
//  11. 搜索历史行：.settings-row-inline +「搜索历史」+ #history-count「0 条」+ #history-clear[disabled]
//  12. 版本号：.panel-version 文案为「简单搜索 v<semver>」（build 从 package.json 注入）
//  13. PWA：<link rel="manifest"> + manifest.webmanifest（name/start_url/scope/display/icons 192+512 文件存在）
//  14. sw.js：build 生成物含版本号 + precache 覆盖首页/CSS/JS/图标/manifest，经典脚本无 import/export
//  15. 搜索引擎：#engine-mode 4 个 .segmented-item（bing/google/ddg/baidu），初始只有 bing 选中
//  16. 快捷键对话框：#shortcuts-dialog[role=dialog][hidden] + ≥8 个 <kbd> + 设置面板 #shortcuts-open
//  17. 图标：sprite 含内置 11 站 symbol + 约定 UI 图标（v2.7 起总数动态 ≥21）；每个 data-site 按钮有
//      .button-icon（use 或 monogram），所有 <use> 目标命中；站点 icon 字段可复用 cat-* symbol
//  18. sprite 内联体积 ≤ 12KB（未压缩，契约 §18）
//  19. 图标零图片请求：无 <img>、无外链 favicon 服务；UI 图标必须内联（仅本地 PWA apple-touch-icon/manifest 图标允许 png）
//  20. 两个重定向壳：meta refresh 0 秒 + canonical + location.replace 均指向 index.html?theme=X；
//      壳不得包含真实页内容（#buttons-container / data-site / assets/js bundle），体积 < 1KB
//  21. 唯一性：只有 index.html 是真实页
//  22. CSS 不含 !important（契约 §6）
//  23. 体积信息：index.html 单页加载资源合计 < 200KB（仅提示，契约 §9.9，gzip 为真实成本口径；
//      sw.js / manifest / PWA 图标不计入首屏）
//  24. 单文件便携版 SimpleSearch.html：build 生成 + CSS/JS 全内联 + 零 assets/manifest/apple-touch-icon 引用
//  25. 单文件体积 ≤ 260KB（提示项）
//  26. v2.7 站点库规模：总站点数 ≥30、每分组 ≥3、DOM 含全部 data-site 按钮（可见性由 JS 控制）
//  27. v2.8 featured 视图：11 个 featured 可见、22 个非 featured 带 hidden、.card-title「常用网站」、导航首项「常用」
//  28. v2.9 设置入口与对话框：#custom-sites-open/#order-open、#sites-dialog/#order-dialog（hidden/dialog/aria-modal/
//      标题）+ 表单/列表/按钮 id 齐全
//  29. v2.9 data-icon：内置按钮带 data-icon（非空时 #i-xxx 且命中 sprite）；sites-store/sites-admin 在 app.js 之前；
//      新脚本无 eval / new Function
// 任一失败 → 退出码 1，并打印失败详情。
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const REAL_PAGE = 'index.html'
const SHELLS = [
  { file: 'SimpleSearch-Light.html', theme: 'light' },
  { file: 'SimpleSearch-Dark.html', theme: 'dark' },
]

// 契约 §6 / §20：入口页脚本顺序（v2.9 起 sites-store / sites-admin 在 app.js 之前）
const EXPECTED_SCRIPTS = [
  'assets/js/sites.js',
  'assets/js/search.js',
  'assets/js/suggest.js',
  'assets/js/history.js',
  'assets/js/theme.js',
  'assets/js/remote.js',
  'assets/js/input.js',
  'assets/js/sites-store.js',
  'assets/js/sites-admin.js',
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
  'theme-mode',
  'suggest-source-toggle',
  'site-nav',
  'group-chips',
  'main-content',
  'nav-toggle',
  'settings-toggle',
  'settings-panel',
  'settings-title',
  'settings-close',
  'color-swatches',
  'history-count',
  'history-clear',
  'engine-mode',
  'shortcuts-open',
  'shortcuts-dialog',
  'shortcuts-title',
  'shortcuts-close',
  // v2.9 自定义站点 / 排序 / 导入导出
  'custom-sites-open',
  'order-open',
  'sites-dialog',
  'sites-title',
  'sites-close',
  'sites-list',
  'sites-status',
  'site-form',
  'site-label',
  'site-home',
  'site-search',
  'site-group',
  'site-keywords',
  'site-featured',
  'site-save',
  'site-cancel',
  'config-export',
  'config-import-file',
  'order-dialog',
  'order-title',
  'order-close',
  'order-list',
  'scrim',
]

// 契约 §14.2 + §15.2/§15.3：sprite 里的非站点图标
//   3 个 UI（menu/settings/close）+ 1 个 logo + 6 个分类（cat-all/tech/community/media/shopping/content）
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

// 契约 §15.1：19 组 MDUI 主色（顺序同表）与语义变量
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
const SEMANTIC_VARS = ['--primary-bg', '--primary-bg-hover', '--primary', '--focus-ring', '--on-primary']

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
// v2.6 PWA 唯一允许被引用的图片（apple-touch-icon / manifest icons / sw precache）
const PWA_ICON_PATHS = ['assets/img/icon-192.png', 'assets/img/icon-512.png']
// 体积预算口径（lead 2026-11-13 v2.9）：单页加载 < 200 KB（gzip 前；契约 §9.9 以 gzip 为真实成本口径；
// sw.js / manifest / PWA 图标不计入首屏）
const BUDGET_KB = 200
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
      openTag: buttonHtml.slice(0, buttonHtml.indexOf('>') + 1),
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
      hasIconClass: /class\s*=\s*["'][^"']*\bnav-icon\b/i.test(itemInner),
      iconTarget: iconUse ? iconUse[1] : null,
      label: labelSpan ? decodeHtmlEntities(stripTags(labelSpan[1])).trim() : textOfInner(itemInner),
    })
  }
  return { navOpen, items }
}

/** v2.5 设置面板里的 .switch-row 按钮。 */
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

/** v2.5 §16.2：主题三态分段控件 #theme-mode > .segmented-item[data-mode]。 */
function extractSegmented(html) {
  const clean = stripHtmlComments(html)
  const container = findTagById(clean, 'theme-mode')
  if (!container) return null
  const tagName = (container.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(clean, container, tagName) || ''
  const items = []
  for (const match of findAll(inner, /<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'segmented-item')) continue
    items.push({
      mode: getAttr(openTag, 'data-mode'),
      pressed: getAttr(openTag, 'aria-pressed'),
      text: textOfInner(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))),
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

/** 查找内部 HTML 含 token 的 .settings-row（v2.5 有多行，且 <div class="settings-row"> 重复出现，
 *  必须按 match.index 计算各自的内部区域）。 */
function findSettingsRowContaining(html, token) {
  const clean = stripHtmlComments(html)
  const tagRe = /<([a-zA-Z][\w:-]*)\b[^>]*>/g
  for (const match of clean.matchAll(tagRe)) {
    const tag = match[0]
    if (!hasClass(tag, 'settings-row')) continue
    const tagName = match[1]
    const start = match.index + tag.length
    const end = clean.indexOf(`</${tagName}>`, start)
    if (end === -1) continue
    const inner = clean.slice(start, end)
    if (inner.includes(token)) return { openTag: tag, inner }
  }
  return null
}

function hasDisabledAttr(openTag) {
  return /\sdisabled(?:\s|=|>|\/)/i.test(openTag)
}

/** v2.6 §17.3：通用分段控件解析（#engine-mode 等），items 用指定 data-* 属性作 key。 */
function extractSegmentedBy(html, containerId, keyAttr) {
  const clean = stripHtmlComments(html)
  const container = findTagById(clean, containerId)
  if (!container) return null
  const tagName = (container.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const inner = innerOfTag(clean, container, tagName) || ''
  const items = []
  for (const match of findAll(inner, /<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
    const tag = match[0]
    const openTag = tag.slice(0, tag.indexOf('>') + 1)
    if (!hasClass(openTag, 'segmented-item')) continue
    items.push({
      key: getAttr(openTag, keyAttr),
      pressed: getAttr(openTag, 'aria-pressed'),
      text: textOfInner(tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>'))),
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

/** 页面里所有 <use href="#..."> 的目标 symbol id。 */
function extractUseTargets(html) {
  const targets = []
  for (const match of findAll(html, /<use\b[^>]*\b(?:xlink:)?href\s*=\s*["']#([^"']+)["']/gi)) {
    targets.push(match[1])
  }
  return targets
}

/** 取起始标签对应的内部 HTML（按同名闭合标签截取）。 */
function innerOfTag(source, tag, tagName) {
  const start = source.indexOf(tag) + tag.length
  const end = source.indexOf(`</${tagName}>`, start)
  return end === -1 ? null : source.slice(start, end)
}

function textOfInner(inner) {
  if (inner === null) return null
  return decodeHtmlEntities(stripTags(inner)).trim()
}

// ---------------------------------------------------------------- tokens.css 解析（v2.4 §15.1）

/** 解析 :root[data-color='X'] { … } 分组，返回 Map<颜色 id, 声明块>。 */
function parseColorGroups(css) {
  const groups = new Map()
  for (const match of findAll(
    css,
    /:root\s*\[\s*data-color\s*=\s*["']?([a-z-]+)["']?\s*\]\s*\{([^}]*)\}/g,
  )) {
    groups.set(match[1], match[2])
  }
  return groups
}

function cssVar(block, name) {
  const match = block.match(new RegExp(`${name.replace(/-/g, '\\-')}\\s*:\\s*([^;]+?)\\s*(?:;|$)`))
  return match ? match[1].trim() : null
}

function rootBlock(css) {
  const match = css.match(/(?:^|\n)\s*:root\s*\{([^}]*)\}/)
  return match ? match[1] : null
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

check('主产物（index.html + 两个重定向壳）齐全且均由 templates + build.mjs 生成（带构建标记）', () => {
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

check('index.html 按契约顺序引用 10 个经典脚本（sites-store/sites-admin 在 app.js 之前）', () => {
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

check('v2.5 骨架：.appbar/.shell/#main-content/.card、#scrim[hidden]、#settings-panel 对话框（#theme-mode 三段式 + 唯一 .switch-row），无页脚/无 #theme-toggle', () => {
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

  // v2.4 顶栏圆形 logo（§15.2）
  const logo = findTagWithClass(clean, 'appbar-logo')
  if (!logo) {
    problems.push(`${REAL_PAGE} 缺少 .appbar-logo（顶栏 logo）`)
  } else {
    const logoTagName = (logo.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
    const logoInner = innerOfTag(clean, logo, logoTagName)
    if (!/<use\b[^>]*\bhref\s*=\s*["']#i-logo["']/i.test(logoInner || '')) {
      problems.push('.appbar-logo 内应有 <use href="#i-logo">')
    }
  }

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

    // v2.5：唯一保留的 .switch-row 是联网联想；#theme-toggle 已移除
    const rows = extractSwitchRows(clean)
    if (rows.length !== 1) {
      problems.push(`v2.5 起 #settings-panel 内应只剩 1 个 .switch-row（联网联想），实际 ${rows.length}`)
    }
    const remoteRow = rows.find((row) => row.id === 'suggest-source-toggle')
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
    if (/id\s*=\s*["']theme-toggle["']/i.test(clean)) {
      problems.push('v2.5 已移除 #theme-toggle（改为 #theme-mode 分段控件），产物里不应再出现')
    }

    // v2.5 §16.2 主题三态分段控件：#theme-mode > 3 个 .segmented-item[data-mode]，初始只有 auto 选中
    const segmented = extractSegmented(clean)
    if (!segmented) {
      problems.push(`${REAL_PAGE} 缺少 #theme-mode 分段控件`)
    } else {
      if (!segmented.hasSegmentedClass) problems.push('#theme-mode 应带 .segmented 类')
      if ((segmented.role || '').toLowerCase() !== 'group') {
        problems.push(`#theme-mode 的 role 应为 group，实际 ${JSON.stringify(segmented.role)}`)
      }
      const expectedModes = ['auto', 'light', 'dark']
      const actualModes = segmented.items.map((item) => item.mode)
      if (segmented.items.length !== 3) {
        problems.push(`#theme-mode 内应有 3 个 .segmented-item，实际 ${segmented.items.length}`)
      }
      if (actualModes.join(',') !== expectedModes.join(',')) {
        problems.push(
          `#theme-mode 的 data-mode 顺序应为 auto, light, dark，实际 ${actualModes.join(', ') || '（无）'}`,
        )
      }
      for (const item of segmented.items) {
        if (item.pressed !== 'true' && item.pressed !== 'false') {
          problems.push(`分段项 ${JSON.stringify(item.mode)} 的 aria-pressed 缺失或非法：${JSON.stringify(item.pressed)}`)
        }
      }
      const current = segmented.items.filter((item) => item.pressed === 'true')
      if (current.length !== 1) {
        problems.push(`初始应只有一个分段项 aria-pressed="true"，实际 ${current.length} 个`)
      } else if (current[0].mode !== 'auto') {
        problems.push(`初始选中的分段项应为「跟随系统」(data-mode="auto")，实际 ${JSON.stringify(current[0].mode)}`)
      }
    }

    // 主题色行（§15.1）：含 #color-swatches 的 .settings-row 内 .settings-label「主题色」+ 空容器
    const colorRow = findSettingsRowContaining(realPage.html, 'color-swatches')
    if (!colorRow) {
      problems.push(`${REAL_PAGE} 设置面板缺少含 #color-swatches 的 .settings-row（主题色行）`)
    } else {
      const colorLabelMatch = colorRow.inner.match(
        /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bsettings-label\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
      )
      if (!colorLabelMatch) {
        problems.push('主题色行缺少 .settings-label')
      } else {
        const labelText = textOfInner(colorLabelMatch[1])
        if (labelText !== '主题色') {
          problems.push(`主题色行 .settings-label 文案应为「主题色」，实际 ${JSON.stringify(labelText)}`)
        }
      }
    }
    const swatches = findTagById(clean, 'color-swatches')
    if (!swatches) {
      problems.push(`${REAL_PAGE} 缺少 #color-swatches`)
    } else {
      if (!hasClass(swatches, 'swatches')) problems.push('#color-swatches 应带 .swatches 类')
      const swatchTagName = (swatches.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
      const swatchInner = innerOfTag(clean, swatches, swatchTagName)
      if (swatchInner === null || swatchInner.trim() !== '') {
        problems.push(
          `#color-swatches 在产物里必须是空容器（色块由 theme.js 运行时生成），实际内容：${JSON.stringify((swatchInner || '').trim())}`,
        )
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
  const expectedLabels = new Map([['all', '常用']])
  for (const group of siteGroups) expectedLabels.set(group.id, group.label)

  const sprite = extractSprite(clean)
  const symbolSet = sprite ? new Set(extractSymbols(sprite.inner).map((symbol) => symbol.id)) : new Set()

  for (const item of nav.items) {
    if (!allowed.has(item.group)) problems.push(`nav-item 的 data-group=${JSON.stringify(item.group)} 非法`)
    if (!item.label) problems.push(`nav-item data-group=${JSON.stringify(item.group)} 文案为空`)
    if (item.current !== 'true' && item.current !== 'false') {
      problems.push(
        `nav-item data-group=${JSON.stringify(item.group)} 的 aria-current 缺失或非法：${JSON.stringify(item.current)}`,
      )
    }
    // v2.4 §15.3：每个 nav-item 有 .nav-icon（use #i-cat-<group>）+ .nav-label
    if (!item.hasIconClass) problems.push(`nav-item data-group=${JSON.stringify(item.group)} 缺少 .nav-icon`)
    if (item.iconTarget !== `i-cat-${item.group}`) {
      problems.push(
        `nav-item data-group=${JSON.stringify(item.group)} 的图标应为 #i-cat-${item.group}，实际 ${JSON.stringify(item.iconTarget)}`,
      )
    } else if (!symbolSet.has(item.iconTarget)) {
      problems.push(`nav-item 图标 #${item.iconTarget} 不在 sprite 中`)
    }
    if (expectedLabels.has(item.group) && item.label !== expectedLabels.get(item.group)) {
      problems.push(
        `nav-item data-group=${item.group} 的 .nav-label 应为 ${JSON.stringify(expectedLabels.get(item.group))}，实际 ${JSON.stringify(item.label)}`,
      )
    }
  }

  const current = nav.items.filter((item) => item.current === 'true')
  if (current.length !== 1) {
    problems.push(`初始应只有一个 nav-item aria-current="true"，实际 ${current.length} 个`)
  } else if (current[0].group !== 'all') {
    problems.push('初始选中的 nav-item 应是「常用」(data-group="all")')
  } else if (current[0].label !== '常用') {
    problems.push(`v2.8 §19.2：导航首项文案应为「常用」，实际 ${JSON.stringify(current[0].label)}`)
  }

  return problems
})

// ---------------------------------------------------------------- 10. v2.4 主题色（§15.1）

check('v2.4 主题色：<html data-color="indigo"> + tokens.css 19 组 data-color（每组 4 个 --c-*）+ 语义变量', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const problems = []
  const clean = stripHtmlComments(realPage.html)

  // <html data-color="indigo">
  const htmlTag = clean.match(/<html\b[^>]*>/i)
  if (!htmlTag) {
    problems.push(`${REAL_PAGE} 找不到 <html> 标签`)
  } else {
    const dataColor = getAttr(htmlTag[0], 'data-color')
    if (dataColor !== 'indigo') {
      problems.push(`<html> 的 data-color 缺省应为 "indigo"，实际 ${JSON.stringify(dataColor)}`)
    }
  }

  // tokens.css：19 组色值 + 语义变量
  const tokensPath = path.join(ROOT, 'assets', 'css', 'tokens.css')
  if (!fs.existsSync(tokensPath)) return [...problems, '缺少 assets/css/tokens.css']
  const css = fs.readFileSync(tokensPath, 'utf8')
  const groups = parseColorGroups(css)

  if (groups.size !== COLOR_IDS.length) {
    problems.push(
      `tokens.css 的 :root[data-color] 分组应为 ${COLOR_IDS.length} 组，实际 ${groups.size} 组：${[...groups.keys()].join(', ')}`,
    )
  }
  for (const colorId of COLOR_IDS) {
    if (!groups.has(colorId)) {
      problems.push(`tokens.css 缺少 :root[data-color='${colorId}'] 分组`)
      continue
    }
    const block = groups.get(colorId)
    for (const varName of ['--c-500', '--c-700', '--c-200', '--c-on']) {
      if (!cssVar(block, varName)) problems.push(`主题色 ${colorId} 缺少 ${varName} 或值为空`)
    }
  }

  const root = rootBlock(css)
  let foundSemantic = 0
  if (!root) {
    problems.push('tokens.css 缺少基础 :root 块')
  } else {
    for (const varName of SEMANTIC_VARS) {
      if (cssVar(root, varName)) foundSemantic += 1
      else problems.push(`tokens.css 的 :root 缺少语义变量 ${varName}`)
    }
  }

  return {
    problems,
    notes: [`tokens.css 分组 ${groups.size} 组 / 语义变量 ${foundSemantic}/${SEMANTIC_VARS.length} 个`],
  }
})

// ---------------------------------------------------------------- 11. v2.5 搜索历史行（§16.3）

check('v2.5 历史行：.settings-row-inline +「搜索历史」+ #history-count「0 条」+ #history-clear[disabled]', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []

  const row = findSettingsRowContaining(realPage.html, 'history-count')
  if (!row) {
    problems.push(`${REAL_PAGE} 缺少含 #history-count 的 .settings-row（历史行）`)
  } else {
    if (!hasClass(row.openTag, 'settings-row-inline')) problems.push('历史行应带 .settings-row-inline 类')
    const labelMatch = row.inner.match(
      /<span\b[^>]*\bclass\s*=\s*["'][^"']*\bsettings-label\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    )
    if (!labelMatch) {
      problems.push('历史行缺少 .settings-label')
    } else if (!/搜索历史/.test(textOfInner(labelMatch[1]) || '')) {
      problems.push('历史行 .settings-label 应含「搜索历史」')
    }
  }

  const count = findTagById(clean, 'history-count')
  if (!count) {
    problems.push(`${REAL_PAGE} 缺少 #history-count`)
  } else {
    if (!hasClass(count, 'settings-value')) problems.push('#history-count 应带 .settings-value')
    const countTagName = (count.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
    const text = textOfInner(innerOfTag(clean, count, countTagName))
    if (text !== '0 条') problems.push(`#history-count 初始应为「0 条」，实际 ${JSON.stringify(text)}`)
  }

  const clearButton = findTagById(clean, 'history-clear')
  if (!clearButton) {
    problems.push(`${REAL_PAGE} 缺少 #history-clear`)
  } else {
    if (!hasClass(clearButton, 'text-button')) problems.push('#history-clear 应带 .text-button 类')
    if (!hasDisabledAttr(clearButton)) problems.push('#history-clear 在 0 条时初始应带 disabled')
  }

  return problems
})

// ---------------------------------------------------------------- 12. v2.5 版本号（§16.4）

check('v2.5 版本号：.panel-version 文案为「简单搜索 v<semver>」', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const version = findTagWithClass(clean, 'panel-version')
  if (!version) return [`${REAL_PAGE} 缺少 .panel-version（设置面板版本号）`]
  const tagName = (version.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
  const text = textOfInner(innerOfTag(clean, version, tagName))
  if (!/^简单搜索 v\d+\.\d+\.\d+$/.test(text || '')) {
    return [`版本号文案应为「简单搜索 vX.Y.Z」，实际 ${JSON.stringify(text)}`]
  }
  return { problems: [], notes: [text] }
})

// ---------------------------------------------------------------- 13. v2.6 PWA manifest（§17.1）

check('v2.6 PWA：<link rel="manifest"> + manifest.webmanifest（name/start_url/scope/display/icons 192+512 文件存在）', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []

  const manifestHrefs = []
  for (const match of findAll(clean, /<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = (getAttr(tag, 'rel') || '').toLowerCase()
    if (!rel.split(/\s+/).includes('manifest')) continue
    manifestHrefs.push(getAttr(tag, 'href') || '')
  }
  if (manifestHrefs.length === 0) {
    problems.push(`${REAL_PAGE} 缺少 <link rel="manifest">`)
  } else if (!manifestHrefs.some((href) => /manifest\.webmanifest/.test(href))) {
    problems.push(`manifest 链接目标不对：${JSON.stringify(manifestHrefs)}`)
  }

  const manifestPath = path.join(ROOT, 'manifest.webmanifest')
  if (!fs.existsSync(manifestPath)) return [...problems, '缺少 manifest.webmanifest']

  let manifest = null
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    problems.push(`manifest.webmanifest 不是合法 JSON：${error.message}`)
  }

  if (manifest) {
    if (manifest.name !== '简单搜索') problems.push(`manifest.name 应为「简单搜索」，实际 ${JSON.stringify(manifest.name)}`)
    if (manifest.short_name !== '简单搜索') {
      problems.push(`manifest.short_name 应为「简单搜索」，实际 ${JSON.stringify(manifest.short_name)}`)
    }
    if (manifest.start_url !== './index.html') {
      problems.push(`manifest.start_url 应为 "./index.html"，实际 ${JSON.stringify(manifest.start_url)}`)
    }
    if (manifest.scope !== './') problems.push(`manifest.scope 应为 "./"，实际 ${JSON.stringify(manifest.scope)}`)
    if (manifest.display !== 'standalone') {
      problems.push(`manifest.display 应为 "standalone"，实际 ${JSON.stringify(manifest.display)}`)
    }
    if (!Array.isArray(manifest.icons)) {
      problems.push('manifest.icons 必须是数组')
    } else {
      const sizes = manifest.icons.map((icon) => String(icon.sizes || ''))
      if (!sizes.includes('192x192')) problems.push(`manifest.icons 缺少 192x192：${sizes.join(', ')}`)
      if (!sizes.includes('512x512')) problems.push(`manifest.icons 缺少 512x512：${sizes.join(', ')}`)
      for (const icon of manifest.icons) {
        const src = String(icon.src || '')
        if (!/\.png$/i.test(src)) problems.push(`manifest icon 应为 png：${src}`)
        const normalized = src.replace(/^\.\//, '').replace(/^\//, '')
        if (!PWA_ICON_PATHS.includes(normalized)) {
          problems.push(`manifest icon 只允许 ${PWA_ICON_PATHS.join(' / ')}，实际 ${src}`)
        }
        const iconPath = path.join(ROOT, normalized)
        if (!fs.existsSync(iconPath)) problems.push(`manifest icon 文件不存在：${src}`)
      }
    }
  }

  return problems
})

// ---------------------------------------------------------------- 14. v2.6 service worker（§17.1）

check('v2.6 sw.js：build 生成物含版本号 + precache 覆盖首页/CSS/JS/图标/manifest，经典脚本无 import/export', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const swPath = path.join(ROOT, 'sw.js')
  if (!fs.existsSync(swPath)) return ['缺少 sw.js（应由 build 从 templates/sw.js 生成）']

  const sw = fs.readFileSync(swPath, 'utf8')
  const problems = []

  let pkgVersion = null
  try {
    pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
  } catch {
    // 下面统一报错
  }
  if (!pkgVersion) problems.push('无法读取 package.json 的 version')
  else if (!sw.includes(pkgVersion)) problems.push(`sw.js 未包含 package.json 版本号 ${pkgVersion}`)

  for (const token of ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) {
    if (!sw.includes(token)) problems.push(`sw.js 的 precache 应包含 ${token}`)
  }

  for (const ref of extractResourceRefs(realPage.html)) {
    if (!ref.url || isExternalUrl(ref.url) || ref.url.startsWith('#')) continue
    const pathOnly = ref.url.split('?')[0].split('#')[0]
    if (!/\.(css|js|png|svg)$/i.test(pathOnly)) continue
    if (!sw.includes(pathOnly)) problems.push(`sw.js 的 precache 缺少 index.html 引用的资源：${pathOnly}`)
  }

  try {
    new vm.Script(sw, { filename: 'sw.js' })
  } catch (error) {
    problems.push(`sw.js 不是合法经典脚本（含 import/export 等 ESM 语法）：${error.message}`)
  }

  if (/<script\b[^>]*\bsrc\s*=\s*["'][^"']*sw\.js/i.test(stripHtmlComments(realPage.html))) {
    problems.push(`${REAL_PAGE} 不应直接 <script src="sw.js">（只由 app.js 注册）`)
  }

  return problems
})

// ---------------------------------------------------------------- 15. v2.6 搜索引擎切换（§17.3）

check('v2.6 搜索引擎：#engine-mode 4 个 .segmented-item（bing/google/ddg/baidu），初始只有 bing 选中', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const segmented = extractSegmentedBy(realPage.html, 'engine-mode', 'data-engine')
  if (!segmented) return [`${REAL_PAGE} 缺少 #engine-mode 分段控件（搜索引擎切换）`]

  const problems = []
  if (!segmented.hasSegmentedClass) problems.push('#engine-mode 应带 .segmented 类')
  if ((segmented.role || '').toLowerCase() !== 'group') {
    problems.push(`#engine-mode 的 role 应为 group，实际 ${JSON.stringify(segmented.role)}`)
  }
  if (segmented.label !== '搜索引擎') {
    problems.push(`#engine-mode 的 aria-label 应为「搜索引擎」，实际 ${JSON.stringify(segmented.label)}`)
  }

  const expectedKeys = ['bing', 'google', 'ddg', 'baidu']
  if (segmented.items.length !== 4) {
    problems.push(`#engine-mode 内应有 4 个 .segmented-item，实际 ${segmented.items.length}`)
  }
  const actualKeys = segmented.items.map((item) => item.key)
  if (actualKeys.join(',') !== expectedKeys.join(',')) {
    problems.push(`引擎 data-engine 顺序应为 ${expectedKeys.join(', ')}，实际 ${actualKeys.join(', ') || '（无）'}`)
  }
  const expectedLabels = ['Bing', 'Google', 'DDG', '百度']
  const actualLabels = segmented.items.map((item) => item.text)
  if (actualLabels.join(',') !== expectedLabels.join(',')) {
    problems.push(`引擎文案应为 ${expectedLabels.join(' / ')}，实际 ${actualLabels.join(' / ')}`)
  }

  for (const item of segmented.items) {
    if (item.pressed !== 'true' && item.pressed !== 'false') {
      problems.push(`引擎 ${JSON.stringify(item.key)} 的 aria-pressed 缺失或非法：${JSON.stringify(item.pressed)}`)
    }
  }
  const pressed = segmented.items.filter((item) => item.pressed === 'true')
  if (pressed.length !== 1) problems.push(`初始应只有一个引擎 aria-pressed="true"，实际 ${pressed.length} 个`)
  else if (pressed[0].key !== 'bing') problems.push(`初始选中的引擎应为 bing，实际 ${JSON.stringify(pressed[0].key)}`)

  return problems
})

// ---------------------------------------------------------------- 16. v2.6 快捷键对话框（§17.4）

check('v2.6 快捷键对话框：#shortcuts-dialog[role=dialog][hidden] + ≥8 个 <kbd> + 设置面板 #shortcuts-open', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []

  const dialog = findTagById(clean, 'shortcuts-dialog')
  if (!dialog) {
    problems.push(`${REAL_PAGE} 缺少 #shortcuts-dialog`)
  } else {
    if (!hasClass(dialog, 'dialog')) problems.push('#shortcuts-dialog 应带 .dialog 类')
    if ((getAttr(dialog, 'role') || '').toLowerCase() !== 'dialog') {
      problems.push(`#shortcuts-dialog 的 role 应为 dialog，实际 ${JSON.stringify(getAttr(dialog, 'role'))}`)
    }
    if (getAttr(dialog, 'aria-modal') !== 'true') problems.push('#shortcuts-dialog 的 aria-modal 应为 true')
    if (!hasHiddenAttr(dialog)) problems.push('#shortcuts-dialog 初始应带 hidden（关闭状态）')

    if (!findTagById(clean, 'shortcuts-title')) problems.push(`${REAL_PAGE} 缺少 #shortcuts-title`)
    if (!findTagById(clean, 'shortcuts-close')) problems.push(`${REAL_PAGE} 缺少 #shortcuts-close`)
    if (!findTagWithClass(clean, 'shortcut-list')) problems.push(`${REAL_PAGE} 缺少 .shortcut-list`)

    const kbdCount = (clean.match(/<kbd\b/gi) || []).length
    if (kbdCount < 8) problems.push(`快捷键列表至少应有 8 行，实际 <kbd> 数量 ${kbdCount}`)
  }

  if (!findTagById(clean, 'shortcuts-open')) {
    problems.push(`${REAL_PAGE} 设置面板缺少 #shortcuts-open（快捷键按钮）`)
  }

  return problems
})

// ---------------------------------------------------------------- 17. v2.3 图标 sprite / 按钮图标

check('v2.7 图标：sprite 含内置 11 站 + 约定 UI 图标（总数动态，≥21），每个 data-site 按钮有 .button-icon，所有 use 目标命中', () => {
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
  const useTargets = extractUseTargets(clean)
  const useTargetSet = new Set(useTargets)

  if (symbols.length === 0) problems.push('icon-sprite 里没有任何 <symbol>')
  if (new Set(symbolIds).size !== symbolIds.length) {
    problems.push(`symbol id 重复：${JSON.stringify(symbolIds)}`)
  }
  for (const id of symbolIds) {
    if (!/^i-[a-z0-9-]+$/.test(String(id))) {
      problems.push(`symbol id 不合法：${JSON.stringify(id)}`)
    }
  }

  // 站点 symbol：内置 11 站必须全覆盖；v2.7 新增站点专属图标会继续增加
  const siteSymbols = symbolIds.filter((id) => id !== null && siteIdSet.has(String(id).slice(2)))
  for (const builtinId of BUILTIN_IDS) {
    if (!symbolIds.includes(`i-${builtinId}`)) problems.push(`sprite 缺少内置站点图标 #i-${builtinId}`)
  }
  if (siteSymbols.length < BUILTIN_IDS.length) {
    problems.push(`站点 symbol 数量（${siteSymbols.length}）应 ≥ 内置站点数（${BUILTIN_IDS.length}）`)
  }

  // UI symbol：i-menu / i-settings / i-close / i-logo / i-cat-* 必须在
  for (const uiId of UI_SYMBOL_IDS) {
    if (!symbolIds.includes(uiId)) problems.push(`sprite 缺少 UI 图标 #${uiId}`)
  }

  // v2.7 §18：symbol 总数随站点/专属图标增加，只断言下界（≥ 内置站点 + UI 图标）
  const minSymbolTotal = BUILTIN_IDS.length + UI_SYMBOL_IDS.length
  if (symbolIds.length < minSymbolTotal) {
    problems.push(
      `symbol 总数（${symbolIds.length}）应 ≥ ${minSymbolTotal}（${BUILTIN_IDS.length} 站点 + ${UI_SYMBOL_IDS.length} UI）`,
    )
  }

  // 不允许孤儿 symbol：允许 UI 图标 / 站点图标 / 页面实际引用到的共享图标（如 cat-*）
  for (const id of symbolIds) {
    if (UI_SYMBOL_IDS.includes(id)) continue
    if (siteIdSet.has(String(id).slice(2))) continue
    if (!useTargetSet.has(id)) problems.push(`symbol ${id} 既不是站点/UI 图标，也没有被页面 <use> 引用`)
  }

  for (const symbol of symbols) {
    if (!/<(path|rect|circle|line|polyline|polygon|ellipse)\b/i.test(symbol.body || '')) {
      problems.push(`symbol ${symbol.id} 里没有几何图形`)
    }
  }

  // 所有 <use> 目标必须能在 sprite 里命中
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
    const site = sites.find((item) => item.id === button.id)
    if (builtinSet.has(button.id)) {
      if (icon.useTarget !== `i-${button.id}`) {
        problems.push(
          `内置站点 ${button.id} 应使用 <use href="#i-${button.id}">，实际 ${JSON.stringify(icon.useTarget)}`,
        )
      }
    } else if (site && typeof site.icon === 'string' && site.icon !== '') {
      // v2.7 §18：sites.js 的 icon 字段指定复用 symbol；SITE_ICONS 专属图标可能覆盖为 i-<id>
      if (icon.useTarget !== `i-${site.icon}` && icon.useTarget !== `i-${button.id}`) {
        problems.push(
          `站点 ${button.id} 声明 icon="${site.icon}"，use 目标应为 #i-${site.icon} 或 #i-${button.id}，实际 ${JSON.stringify(icon.useTarget)}`,
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

// ---------------------------------------------------------------- 18. sprite 体积

check('sprite 内联体积 ≤ 12KB（未压缩，契约 §18）', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const sprite = extractSprite(stripHtmlComments(realPage.html))
  if (!sprite) return ['缺少 icon-sprite，无法统计 sprite 体积']
  const bytes = Buffer.byteLength(sprite.outer, 'utf8')
  if (bytes > 12288) return [`icon-sprite 体积 ${bytes} 字节，超过 12KB 红线（未压缩）`]
  return { problems: [], notes: [`sprite ${(bytes / 1024).toFixed(2)} KB`] }
})

// ---------------------------------------------------------------- 19. 零额外图片请求

check('图标零图片请求：无 .png/.jpg/.webp/.gif/.ico 引用、无外链 favicon 服务', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []
  const imagePattern = /\.(png|jpe?g|webp|gif|ico)(?:["'?)#\s]|$)/i
  const ALLOWED_PWA_ICONS = new Set(PWA_ICON_PATHS)

  for (const match of findAll(clean, /<(link|script|img|source|iframe|embed|object)\b[^>]*>/gi)) {
    const tag = match[0]
    const tagName = match[1].toLowerCase()
    const rel = (getAttr(tag, 'rel') || '').toLowerCase()
    const isIconLink = tagName === 'link' && /\b(apple-touch-icon|icon|mask-icon)\b/.test(rel)
    for (const attr of ['src', 'href', 'data', 'poster']) {
      const url = getAttr(tag, attr)
      if (!url) continue
      if (/^(https?:)?\/\//i.test(url)) problems.push(`出现外部资源引用：<${match[1]}> ${attr}=${url}`)
      if (!imagePattern.test(url)) continue
      const normalized = url.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\//, '')
      const isAllowedPwaIcon = isIconLink && ALLOWED_PWA_ICONS.has(normalized)
      if (!isAllowedPwaIcon) {
        problems.push(
          `出现图片资源引用：<${match[1]}> ${attr}=${url}（UI 图标必须内联；仅 ${[...ALLOWED_PWA_ICONS].join(' / ')} 允许被引用）`,
        )
      }
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

// ---------------------------------------------------------------- 20. 重定向壳

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

// ---------------------------------------------------------------- 21. 唯一性

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

// ---------------------------------------------------------------- 22. CSS 禁 !important

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

// ---------------------------------------------------------------- 23. 体积信息

check('体积信息（index.html 单页加载预算 < 200 KB，仅供参考不阻断）', () => {
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
  let excluded = 0
  for (const ref of extractResourceRefs(realPage.html)) {
    if (!ref.url || isExternalUrl(ref.url) || ref.url.startsWith('#')) continue
    const cleanUrl = ref.url.split('?')[0].split('#')[0].replace(/\\/g, '/')
    // v2.6 §17.6：sw.js / manifest / 两个 PWA 图标不计入首屏预算
    if (PWA_ICON_PATHS.includes(cleanUrl)) {
      if (assetBytes.has(cleanUrl)) excluded += assetBytes.get(cleanUrl)
      continue
    }
    if (assetBytes.has(cleanUrl)) loaded += assetBytes.get(cleanUrl)
  }
  const verdict = loaded < BUDGET_KB * 1024 ? '达标' : '超出'
  notes.push(`${REAL_PAGE}：${(htmlBytes / 1024).toFixed(1)} KB`)
  notes.push(
    `${REAL_PAGE} 单页加载体积：${(loaded / 1024).toFixed(1)} KB（${verdict} < ${BUDGET_KB} KB 预算；` +
      `sw.js/manifest/PWA 图标不计入${excluded > 0 ? `，已排除 PWA 图标 ${(excluded / 1024).toFixed(1)} KB` : ''}）`,
  )
  notes.push(`全部资源合计：${(assetTotal / 1024).toFixed(1)} KB`)
  return { problems: [], notes }
})

// ---------------------------------------------------------------- 24. v2.6 单文件便携版

const SINGLE_FILE = 'SimpleSearch.html'
const SINGLE_FILE_MAX_KB = 260

check('v2.6 单文件便携版 SimpleSearch.html：build 生成 + CSS/JS 全内联 + 零 assets/manifest/apple-touch-icon 引用', () => {
  const singlePath = path.join(ROOT, SINGLE_FILE)
  if (!fs.existsSync(singlePath)) return [`缺少 ${SINGLE_FILE}（应随 npm run build 生成）`]
  const single = fs.readFileSync(singlePath, 'utf8')
  const clean = stripHtmlComments(single)
  const problems = []

  if (!BUILD_MARKER.test(single)) problems.push(`${SINGLE_FILE} 缺少「由 scripts/build.mjs 生成」注释`)
  if (!/单文件|便携/.test(single)) problems.push(`${SINGLE_FILE} 文件头缺少单文件/便携版说明注释`)
  if (!single.includes('__SS_SINGLE_FILE')) {
    problems.push(`${SINGLE_FILE} 缺少 __SS_SINGLE_FILE 标记（app.js 用它跳过 Service Worker 注册）`)
  }

  // CSS/JS 全部内联：不得有 <script src>，不得引用 assets/ 文件
  if (/<script\b[^>]*\bsrc\s*=/i.test(clean)) {
    problems.push(`${SINGLE_FILE} 不应出现 <script src>（脚本必须内联）`)
  }

  const styleCount = (clean.match(/<style\b/gi) || []).length
  if (styleCount < 3) problems.push(`${SINGLE_FILE} 应内联 ≥3 个 <style>，实际 ${styleCount}`)

  const scriptTags = [...clean.matchAll(/<script\b([^>]*)>/gi)]
  const inlineScripts = scriptTags.filter((match) => !/\bsrc\s*=/i.test(match[1])).length
  if (inlineScripts < 9) {
    problems.push(`${SINGLE_FILE} 应内联 ≥9 个 <script>（8 个模块 + anti-FOUC 等），实际 ${inlineScripts}`)
  }

  // 单文件版没有独立图标文件：不应有 manifest / apple-touch-icon，favicon 必须是 data URI
  if (/<link\b[^>]*\brel\s*=\s*["'][^"']*\bmanifest\b/i.test(clean)) {
    problems.push(`${SINGLE_FILE} 不应包含 <link rel="manifest">（单文件版无 PWA 清单）`)
  }
  if (/apple-touch-icon/i.test(clean)) problems.push(`${SINGLE_FILE} 不应包含 apple-touch-icon`)

  const iconLink = [...clean.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\brel\s*=\s*["'][^"']*\bicon\b/i.test(tag))
  if (!iconLink) {
    problems.push(`${SINGLE_FILE} 缺少 favicon <link rel="icon">`)
  } else if (!/\bhref\s*=\s*["']data:/i.test(iconLink)) {
    problems.push(`${SINGLE_FILE} 的 favicon 必须是 data: URI（不能指向独立文件）`)
  }

  // 任何资源标签都不得引用本地/外部文件（data: 允许）
  for (const ref of extractResourceRefs(clean)) {
    if (!ref.url || ref.url.startsWith('#') || ref.url.startsWith('data:')) continue
    problems.push(`${SINGLE_FILE} 的 <${ref.tagName}> 引用了未内联资源：${ref.url}`)
  }
  for (const match of findAll(clean, /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const url = match[1].trim()
    if (/^assets\//i.test(url)) problems.push(`${SINGLE_FILE} 仍引用 assets/ 文件：${url}`)
  }

  return problems
})

// ---------------------------------------------------------------- 25. v2.6 单文件体积

check('v2.6 单文件体积（≤ 260KB，提示项不阻断）', () => {
  const singlePath = path.join(ROOT, SINGLE_FILE)
  if (!fs.existsSync(singlePath)) return [`缺少 ${SINGLE_FILE}`]
  const bytes = fs.statSync(singlePath).size
  const kb = bytes / 1024
  const verdict = kb <= SINGLE_FILE_MAX_KB ? '达标' : '超出'
  return {
    problems: [],
    notes: [`${SINGLE_FILE}：${kb.toFixed(1)} KB（${verdict} ≤ ${SINGLE_FILE_MAX_KB}KB 提示线；不含任何外部请求）`],
  }
})

// ---------------------------------------------------------------- 26. v2.7 站点库规模（§18）

check('v2.7 站点库：总站点数 ≥30、每个分组 ≥3 个站点，常用视图 DOM 仍含全部 data-site 按钮（可见性由 JS 控制）', () => {
  if (!sites) return [registry.problem || '无法读取 SS.sites']
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]

  const problems = []
  if (sites.length < 30) problems.push(`站点总数应 ≥30（v2.7 目标 33），实际 ${sites.length}`)

  if (!Array.isArray(siteGroups)) {
    problems.push('缺少 SS.siteGroups，无法校验每分组站点数')
  } else {
    const counts = new Map(siteGroups.map((group) => [group.id, 0]))
    for (const site of sites) {
      if (counts.has(site.group)) counts.set(site.group, counts.get(site.group) + 1)
    }
    for (const [groupId, count] of counts) {
      if (count < 3) problems.push(`分组 ${groupId} 的站点数应 ≥3，实际 ${count}`)
    }
  }

  const clean = stripHtmlComments(realPage.html)
  const buttons = extractSiteButtons(clean)
  const buttonIds = new Set(buttons.map((button) => button.id))
  if (buttons.length !== sites.length) {
    problems.push(`「全部」视图 data-site 按钮数 ${buttons.length} 应等于站点数 ${sites.length}`)
  }
  const missing = sites.map((site) => site.id).filter((id) => !buttonIds.has(id))
  if (missing.length > 0) problems.push(`「全部」视图缺少站点按钮：${missing.join(', ')}`)

  return {
    problems,
    notes: [`站点 ${sites.length} 个 / 分组 ${siteGroups ? siteGroups.length : '?'} 个 / DOM 按钮 ${buttons.length} 个（可见性由 JS 控制）`],
  }
})

// ---------------------------------------------------------------- 27. v2.8 featured 视图（§19）

check('v2.8 默认常用视图（静态）：11 个 featured（data-featured="true"）可见、22 个非 featured 带 hidden、.card-title「常用网站」', () => {
  if (!sites) return [registry.problem || '无法读取 SS.sites']
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []

  const buttons = extractSiteButtons(clean)
  if (buttons.length !== sites.length) {
    problems.push(`DOM 按钮数 ${buttons.length} 应等于站点数 ${sites.length}`)
  }

  const featured = buttons.filter((button) => getAttr(button.openTag, 'data-featured') === 'true')
  const nonFeatured = buttons.filter((button) => getAttr(button.openTag, 'data-featured') === null)
  const expectedFeatured = sites.filter((site) => site.featured === true).map((site) => site.id).sort()
  const expectedNonFeatured = sites.filter((site) => site.featured !== true).map((site) => site.id)

  if (featured.map((button) => button.id).sort().join(',') !== expectedFeatured.join(',')) {
    problems.push(`data-featured="true" 的按钮应与注册表 featured 站点一致：期望 ${expectedFeatured.join(', ')}`)
  }
  if (nonFeatured.length !== expectedNonFeatured.length) {
    problems.push(`非 featured 按钮应为 ${expectedNonFeatured.length} 个，实际 ${nonFeatured.length}`)
  }
  for (const button of featured) {
    if (hasHiddenAttr(button.openTag)) problems.push(`featured 按钮 ${button.id} 不应带 hidden（初始可见）`)
  }
  for (const button of nonFeatured) {
    if (!hasHiddenAttr(button.openTag)) {
      problems.push(`v2.8 §19.1：非 featured 按钮 ${button.id} 必须带 hidden（无 JS 兜底）`)
    }
  }

  // 卡片标题：默认（常用）视图为「常用网站」
  const title = findTagWithClass(clean, 'card-title')
  if (!title) {
    problems.push(`${REAL_PAGE} 缺少 .card-title`)
  } else {
    const titleTagName = (title.match(/^<([a-zA-Z][\w:-]*)/) || [])[1]
    const text = textOfInner(innerOfTag(clean, title, titleTagName))
    if (text !== '常用网站') {
      problems.push(`.card-title 初始（默认常用视图）应为「常用网站」，实际 ${JSON.stringify(text)}`)
    }
  }

  // 导航首项文案「常用」（data-group="all" 不变）
  const nav = extractGroupNav(clean)
  const first = nav && nav.items.find((item) => item.group === 'all')
  if (!first) {
    problems.push('缺少 data-group="all" 的导航首项')
  } else if (first.label !== '常用') {
    problems.push(`导航首项文案应为「常用」，实际 ${JSON.stringify(first.label)}`)
  }

  return {
    problems,
    notes: [`featured ${featured.length} 个（无 hidden）/ 非 featured ${nonFeatured.length} 个（带 hidden）/ .card-title「常用网站」`],
  }
})

// ---------------------------------------------------------------- 28. v2.9 设置入口 + 自定义站点/排序对话框（§20.2）

check('v2.9 设置入口与对话框：#custom-sites-open/#order-open + #sites-dialog/#order-dialog（hidden/dialog/aria-modal/标题）+ 表单/列表/按钮 id 齐全', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  const clean = stripHtmlComments(realPage.html)
  const problems = []

  // 设置面板入口
  for (const id of ['custom-sites-open', 'order-open']) {
    if (!findTagById(clean, id)) problems.push(`${REAL_PAGE} 设置面板缺少 #${id}`)
  }

  // 两个对话框的语义属性
  const dialogExpectations = [
    { id: 'sites-dialog', titleId: 'sites-title', closeId: 'sites-close' },
    { id: 'order-dialog', titleId: 'order-title', closeId: 'order-close' },
  ]
  for (const expected of dialogExpectations) {
    const tag = findTagById(clean, expected.id)
    if (!tag) {
      problems.push(`${REAL_PAGE} 缺少 #${expected.id}`)
      continue
    }
    if (!hasClass(tag, 'dialog')) problems.push(`#${expected.id} 应带 .dialog 类`)
    if ((getAttr(tag, 'role') || '').toLowerCase() !== 'dialog') {
      problems.push(`#${expected.id} 的 role 应为 dialog，实际 ${JSON.stringify(getAttr(tag, 'role'))}`)
    }
    if (getAttr(tag, 'aria-modal') !== 'true') problems.push(`#${expected.id} 的 aria-modal 应为 true`)
    if (!hasHiddenAttr(tag)) problems.push(`#${expected.id} 初始应带 hidden（关闭状态）`)
    if (getAttr(tag, 'aria-labelledby') !== expected.titleId) {
      problems.push(`#${expected.id} 的 aria-labelledby 应为 ${expected.titleId}，实际 ${JSON.stringify(getAttr(tag, 'aria-labelledby'))}`)
    }
    if (!findTagById(clean, expected.titleId)) problems.push(`${REAL_PAGE} 缺少 #${expected.titleId}`)
    if (!findTagById(clean, expected.closeId)) problems.push(`${REAL_PAGE} 缺少 #${expected.closeId}`)
  }

  // 表单 / 列表 / 操作按钮 id（REQUIRED_IDS 已覆盖存在性，这里再确认一遍关键分组，便于失败定位）
  for (const id of [
    'site-form',
    'site-label',
    'site-home',
    'site-search',
    'site-group',
    'site-keywords',
    'site-featured',
    'site-save',
    'site-cancel',
    'sites-list',
    'order-list',
    'sites-status',
    'config-export',
    'config-import-file',
  ]) {
    if (!findTagById(clean, id)) problems.push(`${REAL_PAGE} 缺少 #${id}`)
  }

  return problems
})

// ---------------------------------------------------------------- 29. v2.9 data-icon / 新脚本（§20.3）

check('v2.9 data-icon 与脚本：内置按钮带 data-icon（非空时形如 #i-xxx 且命中 sprite），sites-store/sites-admin 在 app.js 之前，且无 eval/new Function', () => {
  if (!realPage.exists) return [`${REAL_PAGE} 不存在`]
  if (!sites) return [registry.problem || '无法读取 SS.sites']

  const clean = stripHtmlComments(realPage.html)
  const problems = []

  // 每个内置站点按钮必须有 data-icon 属性；非空值形如 #i-xxx 且 sprite 中存在
  const sprite = extractSprite(clean)
  const symbolSet = sprite ? new Set(extractSymbols(sprite.inner).map((symbol) => symbol.id)) : new Set()
  const buttons = extractSiteButtons(clean)
  const builtinSet = new Set(BUILTIN_IDS)
  for (const button of buttons) {
    if (!builtinSet.has(button.id)) continue
    if (!/\bdata-icon\s*=/i.test(button.openTag)) {
      problems.push(`内置站点 ${button.id} 的按钮缺少 data-icon 属性（运行时重建按钮要用）`)
      continue
    }
    const iconValue = getAttr(button.openTag, 'data-icon') || ''
    if (iconValue !== '') {
      if (!/^#i-[a-z0-9-]+$/.test(iconValue)) {
        problems.push(`内置站点 ${button.id} 的 data-icon 格式不对：${JSON.stringify(iconValue)}`)
      } else if (!symbolSet.has(iconValue.slice(1))) {
        problems.push(`内置站点 ${button.id} 的 data-icon ${iconValue} 不在 sprite 中`)
      }
    }
  }

  // 新脚本顺序：sites-store.js / sites-admin.js 必须在 app.js 之前
  const localScripts = extractScriptSrcs(clean).filter((src) => !isExternalUrl(src))
  const indexOf = (name) => localScripts.indexOf(name)
  for (const name of ['assets/js/sites-store.js', 'assets/js/sites-admin.js']) {
    if (indexOf(name) === -1) {
      problems.push(`${REAL_PAGE} 脚本列表缺少 ${name}`)
      continue
    }
    if (indexOf(name) > indexOf('assets/js/app.js')) problems.push(`${name} 应排在 app.js 之前`)
  }

  // 新脚本不得使用 eval / new Function
  for (const file of ['assets/js/sites-store.js', 'assets/js/sites-admin.js']) {
    const full = path.join(ROOT, file)
    if (!fs.existsSync(full)) {
      problems.push(`缺少 ${file}（v2.9 新增模块）`)
      continue
    }
    const source = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (/\beval\s*\(/.test(source)) problems.push(`${file} 使用了 eval(（禁止）`)
    if (/\bnew\s+Function\s*\(/.test(source)) problems.push(`${file} 使用了 new Function(（禁止）`)
  }

  return {
    problems,
    notes: [`内置按钮 data-icon 检查 ${buttons.filter((button) => builtinSet.has(button.id)).length} 个`],
  }
})

// ---------------------------------------------------------------- 输出摘要

function printReport() {
  const failed = checks.filter((item) => item.problems.length > 0)
  const passed = checks.length - failed.length

  console.log('SimpleSearch v2.9 静态校验（validate）')
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
