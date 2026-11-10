// SimpleSearch v2 静态校验与产物一致性门禁。
// 用法：node scripts/validate.mjs（npm run validate）
//
// 检查内容：
//   1. 生成产物与模板/注册表一致（spawnSync 调 `node scripts/build.mjs --check`，退出码透传为失败）
//   2. 两只入口 HTML 的 head 元信息：charset / lang / viewport / theme-color / favicon / data-theme
//   3. 两只入口 HTML 的硬约束：无 type="module"、无内联 on* 事件、无未替换 {{...}}、无重复 id
//   4. HTML 引用的所有本地 resources 真实存在
//   5. 所有 data-site 都能在 SS.sites 找到；注册表每个站点都渲染进两个页面、顺序与 label 一致
//   6. 两个入口页的站点列表完全一致（不允许 Light/Dark 漂移）
//   7. 七个经典脚本按契约顺序引用；CSS 不含 !important
// 任一失败 → 退出码 1，并打印失败详情。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

const ENTRIES = [
  { file: 'SimpleSearch-Light.html', theme: 'light' },
  { file: 'SimpleSearch-Dark.html', theme: 'dark' },
]

// 契约 §6：入口页的脚本引用顺序
const EXPECTED_SCRIPTS = [
  'assets/js/sites.js',
  'assets/js/search.js',
  'assets/js/suggest.js',
  'assets/js/history.js',
  'assets/js/theme.js',
  'assets/js/input.js',
  'assets/js/app.js',
]

const BUILD_MARKER = /<!--\s*由 scripts\/build\.mjs/

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

/** 解析 HTML 里会触发子资源加载的本地路径（外部 URL / data: / # 锚点跳过）。 */
function extractResourceRefs(html) {
  const refs = []
  const tagRe = /<(link|script|img|source|iframe|video|audio|embed|object)\b[^>]*>/gi
  for (const tagMatch of findAll(stripHtmlComments(html), tagRe)) {
    const tagName = tagMatch[1].toLowerCase()
    const tag = tagMatch[0]
    for (const attrName of ['src', 'href', 'poster', 'data']) {
      const url = getAttr(tag, attrName)
      if (!url) continue
      if (attrName === 'data' && tagName !== 'object') continue
      refs.push({ tagName, attrName, url: url.trim() })
    }
  }
  return refs
}

/** 判断一个 URL 是否是外部地址。 */
function isExternalUrl(url) {
  return /^(https?:)?\/\//i.test(url) || /^(data|blob|mailto|tel):/i.test(url)
}

/** 把站点按钮解析为 [{ id, label }]，保持文档顺序。 */
function extractSiteButtons(html) {
  const buttons = []
  const buttonRe = /<button\b[^>]*>[\s\S]*?<\/button>/gi
  for (const match of findAll(stripHtmlComments(html), buttonRe)) {
    const buttonHtml = match[0]
    const id = getAttr(buttonHtml, 'data-site')
    if (id === null) continue
    const openTag = buttonHtml.slice(0, buttonHtml.indexOf('>') + 1)
    const inner = buttonHtml.slice(buttonHtml.indexOf('>') + 1, buttonHtml.lastIndexOf('</button>'))
    const label = decodeHtmlEntities(stripTags(inner)).trim()
    buttons.push({ id: decodeHtmlEntities(id), label, openTag })
  }
  return buttons
}

function extractScriptSrcs(html) {
  const srcs = []
  for (const match of findAll(stripHtmlComments(html), /<script\b[^>]*\bsrc\s*=\s*([^>]*)>/gi)) {
    const tag = match[0]
    const src = getAttr(tag, 'src')
    if (src) srcs.push(src.trim())
  }
  return srcs
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

function indent(text, prefix) {
  return String(text)
    .trim()
    .split('\n')
    .map((line) => prefix + line)
    .join('\n')
}

// ---------------------------------------------------------------- 加载注册表

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
    return { sites: SS.sites, problem: null }
  } catch (error) {
    return { sites: null, problem: `加载 sites.js 失败：${error && error.message ? error.message : error}` }
  }
}

const registry = await loadRegistry()
const sites = registry.sites
const siteIds = sites ? sites.map((site) => site.id) : []

// 页面读取：入口缺失时统一在具体检查里报错。
const pages = ENTRIES.map((entry) => {
  const file = path.join(ROOT, entry.file)
  const html = readText(file)
  return { ...entry, file, html, exists: html !== null }
})

function requirePages() {
  const problems = []
  for (const page of pages) {
    if (!page.exists) problems.push(`${page.file} 不存在（先运行 npm run build）`)
    else if (page.html.trim() === '') problems.push(`${page.file} 是空文件`)
  }
  return problems
}

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

// ---------------------------------------------------------------- 2. 入口文件存在与构建标记

check('入口 HTML 存在且由 templates/page.html 生成（带构建标记）', () => {
  const problems = requirePages()
  for (const page of pages) {
    if (!page.exists) continue
    if (!BUILD_MARKER.test(page.html)) {
      problems.push(`${page.file} 缺少「由 scripts/build.mjs 生成」注释，疑似手改或旧版本`)
    }
  }
  return problems
})

// ---------------------------------------------------------------- 3. head 元信息

check('入口 HTML head：charset / lang / viewport / theme-color / favicon / data-theme', () => {
  const problems = []
  if (!pages.some((page) => page.exists)) return ['两只入口 HTML 都不存在，无法检查']

  for (const page of pages) {
    if (!page.exists) {
      problems.push(`${page.file} 不存在`)
      continue
    }
    const html = page.html
    const clean = stripHtmlComments(html)

    // charset=utf-8
    let charsetOk = false
    for (const match of findAll(clean, /<meta\b[^>]*>/gi)) {
      const value = getAttr(match[0], 'charset')
      if (value && value.toLowerCase() === 'utf-8') charsetOk = true
    }
    if (!charsetOk) problems.push(`${page.file} 缺少 <meta charset="utf-8">`)

    // <html lang="zh-CN" data-theme="light|dark" data-theme-default="...">
    const htmlTagMatch = clean.match(/<html\b[^>]*>/i)
    if (!htmlTagMatch) {
      problems.push(`${page.file} 找不到 <html> 标签`)
    } else {
      const htmlTag = htmlTagMatch[0]
      const lang = getAttr(htmlTag, 'lang')
      if (lang !== 'zh-CN') problems.push(`${page.file} 的 lang 应为 zh-CN，实际为 ${JSON.stringify(lang)}`)

      const dataTheme = getAttr(htmlTag, 'data-theme')
      if (dataTheme !== 'light' && dataTheme !== 'dark') {
        problems.push(`${page.file} 的 data-theme 应为 light|dark，实际为 ${JSON.stringify(dataTheme)}`)
      } else if (dataTheme !== page.theme) {
        problems.push(`${page.file} 的 data-theme 应为 ${page.theme}，实际为 ${dataTheme}`)
      }

      const dataThemeDefault = getAttr(htmlTag, 'data-theme-default')
      if (dataThemeDefault !== page.theme) {
        problems.push(
          `${page.file} 的 data-theme-default 应为 ${page.theme}，实际为 ${JSON.stringify(dataThemeDefault)}`,
        )
      }
    }

    // viewport
    const viewportMeta = findMetaByName(html, 'viewport')
    if (!viewportMeta) {
      problems.push(`${page.file} 缺少 <meta name="viewport">`)
    } else if (!/width\s*=\s*device-width/i.test(getAttr(viewportMeta, 'content') || '')) {
      problems.push(`${page.file} 的 viewport 缺少 width=device-width`)
    }

    // theme-color
    const themeColorMeta = findMetaByName(html, 'theme-color')
    if (!themeColorMeta) problems.push(`${page.file} 缺少 <meta name="theme-color">`)
    else if (!getAttr(themeColorMeta, 'content')) problems.push(`${page.file} 的 theme-color 内容为空`)

    // favicon
    const faviconHrefs = findFaviconHrefs(html)
    if (faviconHrefs.length === 0) problems.push(`${page.file} 缺少 <link rel="icon">`)
  }
  return problems
})

// ---------------------------------------------------------------- 4. 硬约束

check('入口 HTML 硬约束：无 type="module" / 无内联事件 / 无 {{占位符}} / 无重复 id', () => {
  const problems = []
  for (const page of pages) {
    if (!page.exists) {
      problems.push(`${page.file} 不存在`)
      continue
    }
    const clean = stripHtmlComments(page.html)

    if (/type\s*=\s*["']module["']/i.test(clean)) {
      problems.push(`${page.file} 出现 type="module"（破坏 file:// 双击可用性）`)
    }

    const inlineEvents = clean.match(/\son[a-z]+\s*=\s*["']/gi) || []
    if (inlineEvents.length > 0) {
      problems.push(`${page.file} 含内联事件属性：${[...new Set(inlineEvents.map((item) => item.trim()))].join(', ')}`)
    }

    const placeholders = [...new Set(clean.match(/\{\{[A-Za-z0-9_]+\}\}/g) || [])]
    if (placeholders.length > 0) {
      problems.push(`${page.file} 存在未替换的模板占位符：${placeholders.join(', ')}`)
    }

    // 重复 id
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
    if (duplicates.size > 0) {
      problems.push(`${page.file} 存在重复 id：${[...duplicates].join(', ')}`)
    }
  }
  return problems
})

// ---------------------------------------------------------------- 5. 本地资源存在性

check('入口 HTML 引用的本地资源全部存在', () => {
  const problems = []
  for (const page of pages) {
    if (!page.exists) {
      problems.push(`${page.file} 不存在`)
      continue
    }
    for (const ref of extractResourceRefs(page.html)) {
      if (!ref.url || ref.url.startsWith('#')) continue
      if (/^javascript:/i.test(ref.url)) {
        problems.push(`${page.file} 出现 javascript: 伪协议：${ref.url}`)
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
        problems.push(`${page.file} 的资源路径越出仓库：${ref.url}`)
        continue
      }
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        problems.push(`${page.file} 引用不存在的本地资源：${ref.url}（<${ref.tagName}>）`)
      }
    }
  }
  return problems
})

// ---------------------------------------------------------------- 6. 站点渲染

check('站点渲染：data-site 合法、无重复、顺序与注册表一致、label 正确', () => {
  if (!sites) return [registry.problem || '无法读取 SS.sites']

  const problems = []
  for (const page of pages) {
    if (!page.exists) {
      problems.push(`${page.file} 不存在`)
      continue
    }
    const buttons = extractSiteButtons(page.html)
    const ids = buttons.map((button) => button.id)

    if (ids.length === 0) {
      problems.push(`${page.file} 没有渲染任何 data-site 按钮`)
      continue
    }

    // data-site 都必须能在 SS.sites 找到
    for (const id of ids) {
      if (!siteIds.includes(id)) problems.push(`${page.file} 的 data-site="${id}" 在 SS.sites 中不存在`)
    }

    // 不允许重复
    const seen = new Set()
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${page.file} 的 data-site="${id}" 重复渲染`)
      seen.add(id)
    }

    // 顺序必须与注册表一致
    const expectedOrder = siteIds.filter((id) => seen.has(id))
    const actualOrder = ids.filter((id) => siteIds.includes(id))
    if (actualOrder.join(',') !== expectedOrder.join(',')) {
      problems.push(
        `${page.file} 站点按钮顺序与注册表不一致：\n` +
          `        期望：${expectedOrder.join(', ')}\n` +
          `        实际：${actualOrder.join(', ')}`,
      )
    }

    // 注册表每一项都必须渲染
    for (const id of siteIds) {
      if (!seen.has(id)) problems.push(`${page.file} 缺少站点按钮 data-site="${id}"`)
    }

    // label 必须与注册表一致（按钮文字）
    for (const button of buttons) {
      const site = sites.find((item) => item.id === button.id)
      if (!site) continue
      if (button.label !== site.label) {
        problems.push(
          `${page.file} 站点 ${button.id} 的按钮文字应为 ${JSON.stringify(site.label)}，实际为 ${JSON.stringify(button.label)}`,
        )
      }
    }
  }
  return problems
})

// ---------------------------------------------------------------- 7. 两页一致（无主题漂移）

check('两只入口页站点列表完全一致（无 Light/Dark 漂移）', () => {
  const rendered = pages.map((page) => {
    if (!page.exists) return { file: page.file, buttons: null }
    return { file: page.file, buttons: extractSiteButtons(page.html).map(({ id, label }) => ({ id, label })) }
  })
  if (rendered.some((page) => page.buttons === null)) return ['存在缺失的入口 HTML，无法比对']

  const [light, dark] = rendered
  const serialize = (page) => JSON.stringify(page.buttons)
  if (serialize(light) !== serialize(dark)) {
    return [`${light.file} 与 ${dark.file} 的站点按钮（id + label + 顺序）不一致，存在主题漂移`]
  }
  return { problems: [], notes: [`${light.buttons.length} 个站点在两页完全一致`] }
})

// ---------------------------------------------------------------- 8. 脚本引用

check('入口 HTML 按契约顺序引用 7 个经典脚本', () => {
  const problems = []
  for (const page of pages) {
    if (!page.exists) {
      problems.push(`${page.file} 不存在`)
      continue
    }
    const scripts = extractScriptSrcs(page.html)
    const localScripts = scripts.filter((src) => !isExternalUrl(src))

    if (localScripts.join(',') !== EXPECTED_SCRIPTS.join(',')) {
      problems.push(
        `${page.file} 的脚本引用与契约 §6 不一致：\n` +
          `        期望：${EXPECTED_SCRIPTS.join(', ')}\n` +
          `        实际：${localScripts.join(', ') || '（无）'}`,
      )
    }
  }
  return problems
})

// ---------------------------------------------------------------- 9. CSS 禁 !important

check('CSS 不含 !important（契约 §6）', () => {
  const cssDir = path.join(ROOT, 'assets', 'css')
  if (!fs.existsSync(cssDir)) return ['缺少 assets/css 目录']
  const files = fs.readdirSync(cssDir).filter((file) => file.endsWith('.css')).sort()
  if (files.length === 0) return ['assets/css 下没有 CSS 文件']

  const problems = []
  for (const file of files) {
    const full = path.join(cssDir, file)
    const source = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const lines = source.split('\n')
    lines.forEach((line, index) => {
      if (/!important/i.test(line)) {
        problems.push(`assets/css/${file}:${index + 1} 使用了 !important：${line.trim()}`)
      }
    })
  }
  return problems
})

// ---------------------------------------------------------------- 10. 体积信息（仅供参考）

// 预算口径（lead 2026-11-10 调整）：单入口页加载体积 < 80 KB（gzip 前）。
const BUDGET_KB = 80

check('体积信息（单页加载预算 < 80 KB，仅供参考不阻断）', () => {
  const notes = []
  const assetBytes = new Map()
  let assetTotal = 0
  const assetDirs = ['assets/css', 'assets/js', 'assets/img']
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

  // 单个入口页的实际加载体积 = 页面本身 + 它引用的全部本地资源（两页共用资源，不应重复累加）。
  for (const page of pages) {
    if (!page.exists) continue
    const htmlBytes = Buffer.byteLength(page.html, 'utf8')
    let loaded = htmlBytes
    for (const ref of extractResourceRefs(page.html)) {
      if (!ref.url || isExternalUrl(ref.url) || ref.url.startsWith('#')) continue
      const cleanUrl = ref.url.split('?')[0].split('#')[0]
      const key = cleanUrl.replace(/\\/g, '/')
      if (assetBytes.has(key)) loaded += assetBytes.get(key)
    }
    const verdict = loaded < BUDGET_KB * 1024 ? '达标' : '超出'
    notes.push(`${page.file} 单页加载体积：${(loaded / 1024).toFixed(1)} KB（${verdict} < ${BUDGET_KB} KB 预算）`)
  }
  notes.push(`全部资源合计：${(assetTotal / 1024).toFixed(1)} KB`)
  return { problems: [], notes }
})

// ---------------------------------------------------------------- 输出摘要

function printReport() {
  const failed = checks.filter((item) => item.problems.length > 0)
  const passed = checks.length - failed.length

  console.log('SimpleSearch v2 静态校验（validate）')
  console.log(`仓库：${ROOT}`)
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
