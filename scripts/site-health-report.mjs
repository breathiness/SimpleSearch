// 站点巡检 Markdown 报告：读 `check-sites.mjs --json` 的结果，生成 site-health-report.md，
// 并把 fail / warn 计数追加到 GITHUB_OUTPUT（供 workflow 判断是否需要开 / 评论追踪 issue）。
//
//   node scripts/site-health-report.mjs sites.json
//
// 纯 Node 内置能力，零依赖；退出码始终为 0（读取失败也会写一份说明报告并把 fail 记为 1，
// 这样 workflow 仍能开出 issue），参数/写入等真错误只写 stderr。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const REPORT_FILE = path.join(ROOT, 'site-health-report.md')

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim()
}

function address(row, kind) {
  const base = row[kind]
  const finalUrl = row[`${kind}FinalUrl`]
  if (!base) return '—'
  if (finalUrl && finalUrl !== base) return `${base} → ${finalUrl}`
  return base
}

function renderTable(rows, verdict) {
  const list = rows.filter((row) => row.verdict === verdict)
  if (list.length === 0) return `（无 ${verdict}）\n`
  const lines = ['| 站点 | 分类 | 地址 | 原因 |', '|---|---|---|---|']
  for (const row of list) {
    lines.push(
      `| ${escapeCell(row.label)}（\`${escapeCell(row.id)}\`） | ${escapeCell(row.group) || '—'} | ` +
        `${escapeCell(address(row, 'home'))}<br>${escapeCell(address(row, 'search'))} | ${escapeCell(row.reason)} |`
    )
  }
  return `${lines.join('\n')}\n`
}

function formatTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso || '未知'
  return `${date.toISOString()}（UTC）`
}

function buildMarkdown(data) {
  const rows = Array.isArray(data.rows) ? data.rows : []
  const fail = Number.isFinite(data.fail) ? data.fail : rows.filter((row) => row.verdict === 'FAIL').length
  const warn = Number.isFinite(data.warn) ? data.warn : rows.filter((row) => row.verdict === 'WARN').length
  const ok = Number.isFinite(data.ok) ? data.ok : rows.filter((row) => row.verdict === 'OK').length
  const total = Number.isFinite(data.total) ? data.total : rows.length
  const conclusion =
    fail > 0
      ? `**${fail} 个 FAIL、${warn} 个 WARN，需要处理 / 人工确认。**`
      : warn > 0
        ? `**${warn} 个 WARN，需要人工确认。**`
        : '**全部站点正常。**'

  return [
    '# 站点巡检报告',
    '',
    `- 生成时间：${formatTime(data.generatedAt)}`,
    `- 站点总数：${total}`,
    `- 结论：${conclusion}`,
    '',
    '## 汇总',
    '',
    '| 指标 | 数量 |',
    '|---|---|',
    `| 总计 | ${total} |`,
    `| OK | ${ok} |`,
    `| WARN | ${warn} |`,
    `| FAIL | ${fail} |`,
    '',
    '## FAIL（坏链，建议尽快修复）',
    '',
    renderTable(rows, 'FAIL'),
    '## WARN（需人工确认）',
    '',
    renderTable(rows, 'WARN'),
    '## 说明',
    '',
    '- 401 / 403 / 429 / 跨域跳转 / 超时等 WARN 多为反爬、地区限制或站方改版，**不一定是坏链**，请在浏览器里点一下确认。',
    '- 本报告由 `.github/workflows/site-health.yml` 每周一 01:00 UTC（北京时间 09:00）自动生成；有需要确认的站点时会在这里的追踪 issue 下评论或新建 issue。',
    '- 本地手动检查：`npm run check:sites`（报告） / `npm run check:sites -- --strict`（FAIL 退出 1） / `npm run check:sites -- --json`（纯 JSON）。',
    '',
  ].join('\n')
}

function appendGithubOutput(values) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  try {
    const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
    fs.appendFileSync(file, `${lines.join('\n')}\n`, 'utf8')
  } catch (error) {
    console.error(`[site-health-report] 写入 GITHUB_OUTPUT 失败：${error && error.message ? error.message : error}`)
  }
}

function writeReport(markdown) {
  fs.writeFileSync(REPORT_FILE, markdown, 'utf8')
  process.stdout.write(markdown)
}

function main() {
  const input = process.argv[2] || 'sites.json'
  const inputPath = path.resolve(process.cwd(), input)
  let data = null
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  } catch (error) {
    const message = error && error.message ? error.message : String(error)
    console.error(`[site-health-report] 读取 ${inputPath} 失败：${message}`)
    const markdown = [
      '# 站点巡检报告',
      '',
      `> ⚠️ 巡检结果读取失败：\`${escapeCell(inputPath)}\``,
      '',
      `- 错误：${escapeCell(message)}`,
      '- 请检查 workflow 里 `node scripts/check-sites.mjs --json > sites.json` 是否成功执行（网络 / 超时）。',
      '',
    ].join('\n')
    writeReport(markdown)
    appendGithubOutput({ fail: 1, warn: 0 })
    return
  }

  const rows = Array.isArray(data.rows) ? data.rows : []
  const fail = Number.isFinite(data.fail) ? data.fail : rows.filter((row) => row.verdict === 'FAIL').length
  const warn = Number.isFinite(data.warn) ? data.warn : rows.filter((row) => row.verdict === 'WARN').length
  writeReport(buildMarkdown(data))
  appendGithubOutput({ fail, warn })
}

try {
  main()
} catch (error) {
  console.error('[site-health-report] 失败：', error && error.message ? error.message : error)
  process.exit(1)
}
