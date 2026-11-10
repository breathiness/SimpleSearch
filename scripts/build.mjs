// 由 templates/page.html + assets/js/sites.js 生成两个静态入口页。
// 用法：
//   node scripts/build.mjs          写入产物
//   node scripts/build.mjs --check  只比对，不写入；有差异退出码 1（CI 用）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CHECK_ONLY = process.argv.includes('--check')

const PAGES = [
  {
    file: 'SimpleSearch-Light.html',
    theme: 'light',
    title: '简单搜索 · 浅色',
    themeColor: '#f5f5f5',
    toggleLabel: '夜间模式',
    description: '一款超简单的聚合搜索网站：输入关键词，点击网站即可在该站内搜索；不输入则直接打开网站。',
  },
  {
    file: 'SimpleSearch-Dark.html',
    theme: 'dark',
    title: '简单搜索 · 夜间',
    themeColor: '#303030',
    toggleLabel: '白天模式',
    description: '一款超简单的聚合搜索网站（夜间模式）：输入关键词，点击网站即可在该站内搜索；不输入则直接打开网站。',
  },
]

function fail(msg) {
  console.error(`[build] ${msg}`)
  process.exit(1)
}

async function loadRegistry() {
  const sitesPath = path.join(ROOT, 'assets', 'js', 'sites.js')
  if (!fs.existsSync(sitesPath)) fail('缺少 assets/js/sites.js（站点注册表由 core-engine 提供）')
  await import(pathToFileURL(sitesPath).href)
  const SS = globalThis.SimpleSearch
  if (!SS || !Array.isArray(SS.sites) || SS.sites.length === 0) {
    fail('assets/js/sites.js 未在 globalThis.SimpleSearch.sites 上注册站点数组')
  }
  return SS
}

function validateSites(sites) {
  const seen = new Set()
  for (const site of sites) {
    if (!site || typeof site !== 'object') fail('站点项必须是对象')
    const { id, label, home, search } = site
    if (!/^[a-z0-9-]+$/.test(String(id || ''))) fail(`站点 id 不合法：${JSON.stringify(id)}`)
    if (seen.has(id)) fail(`站点 id 重复：${id}`)
    seen.add(id)
    if (!label || typeof label !== 'string') fail(`站点 ${id} 缺少 label`)
    if (!/^https:\/\//.test(home || '')) fail(`站点 ${id} 的 home 必须是 https URL`)
    if (!/^https:\/\//.test(search || '') || !String(search).includes('{q}')) {
      fail(`站点 ${id} 的 search 必须是含 {q} 的 https URL`)
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderSiteButtons(sites) {
  return sites
    .map((site) => {
      const extra = Array.isArray(site.keywords) && site.keywords.length
        ? ` data-keywords="${escapeHtml(site.keywords.join(' '))}"`
        : ''
      return `      <button class="button" type="button" data-site="${escapeHtml(site.id)}"${extra}>${escapeHtml(site.label)}</button>`
    })
    .join('\n')
}

function renderPage(template, page, sites) {
  const values = {
    '{{THEME}}': page.theme,
    '{{THEME_DEFAULT}}': page.theme,
    '{{TITLE}}': escapeHtml(page.title),
    '{{DESCRIPTION}}': escapeHtml(page.description),
    '{{THEME_COLOR}}': page.themeColor,
    '{{THEME_TOGGLE_LABEL}}': escapeHtml(page.toggleLabel),
    '{{SITE_BUTTONS}}': renderSiteButtons(sites),
  }
  let html = template
  for (const [token, value] of Object.entries(values)) {
    html = html.split(token).join(value)
  }
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g)
  if (leftover) fail(`模板存在未替换的占位符：${[...new Set(leftover)].join(', ')}`)
  return html
}

async function main() {
  const templatePath = path.join(ROOT, 'templates', 'page.html')
  if (!fs.existsSync(templatePath)) fail('缺少 templates/page.html')
  const template = fs.readFileSync(templatePath, 'utf8')

  const SS = await loadRegistry()
  validateSites(SS.sites)
  if (!SS.engines || !SS.engines[SS.defaultEngine || 'bing']) {
    console.warn('[build] 警告：SS.engines 缺少默认引擎，页面仍可生成（无 JS 时表单回退 Bing）')
  }

  let drift = 0
  for (const page of PAGES) {
    const output = renderPage(template, page, SS.sites)
    const target = path.join(ROOT, page.file)
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null

    if (CHECK_ONLY) {
      if (current !== output) {
        console.error(`[build] ${page.file} 与模板/注册表不一致，请运行 npm run build`)
        drift += 1
      }
      continue
    }

    fs.writeFileSync(target, output, 'utf8')
    console.log(`[build] 写入 ${page.file}（${Buffer.byteLength(output, 'utf8')} 字节，${SS.sites.length} 个站点）`)
  }

  if (CHECK_ONLY) {
    if (drift > 0) process.exit(1)
    console.log('[build] 生成产物已是最新')
  } else {
    console.log('[build] 完成')
  }
}

main().catch((err) => {
  console.error('[build] 失败：', err && err.message ? err.message : err)
  process.exit(1)
})
