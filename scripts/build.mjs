// 由 templates/page.html + templates/redirect.html + assets/js/sites.js 生成静态产物。
// v2.1：明暗合并为单页 index.html；两个旧入口只做 0 秒重定向，保留老链接。
//
// 用法：
//   node scripts/build.mjs          写入产物
//   node scripts/build.mjs --check  只比对，不写入；有差异退出码 1（CI 用）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const CHECK_ONLY = process.argv.includes('--check')

const DESCRIPTION =
  '一款超简单的聚合搜索网站：输入关键词，点击网站即可在该站内搜索；不输入则直接打开网站。自动跟随系统深浅色，也可一键切换。'

// 唯一真实页面
const PAGE = {
  template: 'templates/page.html',
  output: 'index.html',
  values: {
    '{{THEME_DEFAULT}}': 'auto',
    '{{TITLE}}': '简单搜索',
    '{{DESCRIPTION}}': DESCRIPTION,
    '{{THEME_COLOR}}': '#f5f5f5',
  },
}

// 兼容 v1/v2.0 的老链接：0 秒重定向到单页并应用对应主题
const REDIRECTS = [
  { output: 'SimpleSearch-Light.html', target: 'index.html?theme=light', title: '简单搜索 · 浅色' },
  { output: 'SimpleSearch-Dark.html', target: 'index.html?theme=dark', title: '简单搜索 · 夜间' },
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

function renderTemplate(template, values, outputName) {
  let html = template
  for (const [token, value] of Object.entries(values)) {
    html = html.split(token).join(value)
  }
  const leftover = html.match(/\{\{[A-Z_]+\}\}/g)
  if (leftover) fail(`${outputName} 存在未替换的占位符：${[...new Set(leftover)].join(', ')}`)
  return html
}

function readTemplate(relative) {
  const file = path.join(ROOT, relative)
  if (!fs.existsSync(file)) fail(`缺少模板 ${relative}`)
  return fs.readFileSync(file, 'utf8')
}

async function main() {
  const pageTemplate = readTemplate(PAGE.template)
  const redirectTemplate = readTemplate('templates/redirect.html')

  const SS = await loadRegistry()
  validateSites(SS.sites)
  if (!SS.engines || !SS.engines[SS.defaultEngine || 'bing']) {
    console.warn('[build] 警告：SS.engines 缺少默认引擎，页面仍可生成（无 JS 时表单回退 Bing）')
  }

  const outputs = []
  outputs.push({
    file: PAGE.output,
    html: renderTemplate(
      pageTemplate,
      { ...PAGE.values, '{{SITE_BUTTONS}}': renderSiteButtons(SS.sites) },
      PAGE.output
    ),
  })

  for (const redirect of REDIRECTS) {
    outputs.push({
      file: redirect.output,
      html: renderTemplate(
        redirectTemplate,
        {
          '{{TITLE}}': escapeHtml(redirect.title),
          '{{TARGET}}': redirect.target,
        },
        redirect.output
      ),
    })
  }

  let drift = 0
  for (const { file, html } of outputs) {
    const target = path.join(ROOT, file)
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null

    if (CHECK_ONLY) {
      if (current !== html) {
        console.error(`[build] ${file} 与模板/注册表不一致，请运行 npm run build`)
        drift += 1
      }
      continue
    }

    fs.writeFileSync(target, html, 'utf8')
    console.log(`[build] 写入 ${file}（${Buffer.byteLength(html, 'utf8')} 字节）`)
  }

  if (CHECK_ONLY) {
    if (drift > 0) process.exit(1)
    console.log('[build] 生成产物已是最新')
  } else {
    console.log(`[build] 完成：1 个页面 + ${REDIRECTS.length} 个重定向壳，${SS.sites.length} 个站点`)
  }
}

main().catch((err) => {
  console.error('[build] 失败：', err && err.message ? err.message : err)
  process.exit(1)
})
