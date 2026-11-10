// 站点健康自检（可选、需要网络，**不进 CI**）：检查 sites.js 里每个站点的
// home 与 search 地址是否还能用，站方改版导致坏链时能尽快发现。
//
//   npm run check:sites          只报告（退出码 0）
//   npm run check:sites -- --strict   有 FAIL 时退出码 1
//
// 不引入依赖：用 Node 内置 fetch + AbortSignal.timeout。
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT || 8000)
const STRICT = process.argv.includes('--strict')
const UA = 'SimpleSearch-site-check (+https://github.com/breathiness/SimpleSearch)'

async function loadSites() {
  const sitesPath = path.join(ROOT, 'assets', 'js', 'sites.js')
  await import(pathToFileURL(sitesPath).href)
  const SS = globalThis.SimpleSearch
  if (!SS || !Array.isArray(SS.sites)) throw new Error('无法读取 assets/js/sites.js 的 SS.sites')
  return SS.sites
}

function withQuery(template, value) {
  return template.split('{q}').join(encodeURIComponent(value))
}

async function probe(url) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    })
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      finalUrl: res.url || url,
      ms: Date.now() - started,
    }
  } catch (error) {
    return { ok: false, status: 0, finalUrl: url, ms: Date.now() - started, error: error.name || 'Error' }
  }
}

// 判定分级：
//   FAIL = 真坏链（404/410/5xx）
//   WARN = 需人工确认（反爬 401/403/429、超时/网络失败、跨域跳转、被重定向到首页）
//   OK   = 正常
function judge(site, result, kind) {
  if (result.error) return { verdict: 'WARN', reason: `网络失败（${result.error}，可能是网络/地区限制）` }
  if (result.status === 404 || result.status === 410) return { verdict: 'FAIL', reason: `HTTP ${result.status}（页面不存在）` }
  if (result.status >= 500) return { verdict: 'FAIL', reason: `HTTP ${result.status}（服务端错误）` }
  if (result.status === 401 || result.status === 403 || result.status === 429 || result.status === 999) {
    return { verdict: 'WARN', reason: `HTTP ${result.status}（疑似反爬，浏览器访问通常正常）` }
  }
  if (!result.ok) return { verdict: 'WARN', reason: `HTTP ${result.status}` }

  let finalUrl
  try {
    finalUrl = new URL(result.finalUrl)
  } catch {
    return { verdict: 'WARN', reason: '最终 URL 无法解析' }
  }

  if (kind === 'search') {
    const expected = new URL(site.search.replace('{q}', 'test'))
    if (finalUrl.hostname !== expected.hostname) {
      return { verdict: 'WARN', reason: `跨域跳转到 ${finalUrl.hostname}` }
    }
    // 搜索结果被重定向回首页（常见于站方改了搜索参数）
    const looksHome = finalUrl.pathname === '/' || finalUrl.pathname === ''
    const hasQuery = finalUrl.search.length > 1
    if (looksHome && !hasQuery) return { verdict: 'WARN', reason: '被重定向到首页' }
  }

  return { verdict: 'OK', reason: '' }
}

function pad(value, width) {
  const text = String(value)
  return text + ' '.repeat(Math.max(0, width - [...text].length * 1 + (text.length - [...text].length) * 0))
}

async function main() {
  const sites = await loadSites()
  console.log(`[check-sites] ${sites.length} 个站点，超时 ${TIMEOUT_MS}ms，模式=${STRICT ? 'strict' : 'report'}\n`)
  console.log('站点          home   search  耗时    结论')
  console.log('─'.repeat(64))

  const rows = []
  for (const site of sites) {
    const home = await probe(site.home)
    const search = await probe(withQuery(site.search, 'test'))
    const homeJudge = judge(site, home, 'home')
    const searchJudge = judge(site, search, 'search')
    const verdict = [homeJudge, searchJudge].some((j) => j.verdict === 'FAIL')
      ? 'FAIL'
      : [homeJudge, searchJudge].some((j) => j.verdict === 'WARN')
        ? 'WARN'
        : 'OK'
    const reason = [homeJudge.reason, searchJudge.reason].filter(Boolean).join('；') || '正常'

    rows.push({ site, home, search, verdict, reason })
    console.log(
      `${pad(site.id, 13)} ${pad(home.status || '--', 5)} ${pad(search.status || '--', 7)} ${pad(
        `${search.ms}ms`,
        7
      )} ${verdict}${verdict !== 'OK' ? ` — ${reason}` : ''}`
    )
  }

  const count = (v) => rows.filter((row) => row.verdict === v).length
  console.log('─'.repeat(64))
  console.log(`[check-sites] OK ${count('OK')} / WARN ${count('WARN')} / FAIL ${count('FAIL')}`)

  const warned = rows.filter((row) => row.verdict !== 'OK')
  if (warned.length > 0) {
    console.log('\n需要人工确认的站点：')
    for (const row of warned) {
      console.log(`  - ${row.site.id}（${row.site.label}）：${row.reason}`)
      console.log(`    home:   ${row.site.home}  → ${row.home.finalUrl}`)
      console.log(`    search: ${withQuery(row.site.search, 'test')}  → ${row.search.finalUrl}`)
    }
    console.log('\n提示：部分站点有反爬/需要登录，403/重定向不一定是真坏链，请浏览器里点一下确认。')
  }

  if (STRICT && count('FAIL') > 0) process.exit(1)
}

main().catch((error) => {
  console.error('[check-sites] 失败：', error && error.message ? error.message : error)
  process.exit(1)
})
