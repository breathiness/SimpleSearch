// 真实浏览器端到端验证（零依赖）：
//   node scripts/e2e.mjs            跑全部检查
//   node scripts/e2e.mjs --shots    额外输出截图到 artifacts/
//
// 原理：启动 node scripts/serve.mjs 静态服务 + 本机 Edge/Chrome headless（CDP），
// 用 Node 22 内置 WebSocket 直接说 DevTools 协议，检查真实渲染、交互、网络与控制台。
//
// 依赖：本机装了 Edge 或 Chrome。没装则跳过（退出码 0），CI 里不跑。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SHOTS = process.argv.includes('--shots')
const ARTIFACTS = path.join(ROOT, 'artifacts')
const PORT = Number(process.env.E2E_PORT || 8123)
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9333)
const ORIGIN = `http://127.0.0.1:${PORT}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
const BUILTIN_SITE_IDS = [
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
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail || '') })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
function warn(name, detail) {
  console.log(`WARN  ${name}${detail ? '  — ' + detail : ''}`)
}

function findBrowser() {
  const candidates = [
    process.env.SS_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) || null
}

async function fetchOk(url, method = 'GET') {
  const res = await fetch(url, { method })
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`)
  return res
}

async function waitFor(fn, { timeout = 15000, interval = 150, label = '条件' } = {}) {
  const start = Date.now()
  let lastErr
  while (Date.now() - start < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch (err) {
      lastErr = err
    }
    await sleep(interval)
  }
  throw new Error(`等待超时：${label}${lastErr ? ' / ' + lastErr.message : ''}`)
}

// ---------- 极简 CDP 客户端 ----------
class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.id = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.closed = false
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', (e) => reject(new Error('WebSocket 连接失败: ' + (e.message || e.type))), {
        once: true,
      })
    })
    this.ws.addEventListener('message', (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result)
        return
      }
      if (msg.method) {
        const fns = this.listeners.get(msg.method) || []
        for (const fn of fns) fn(msg.params)
      }
    })
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const { reject } of this.pending.values()) reject(new Error('CDP 连接已关闭'))
      this.pending.clear()
    })
    return this
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('CDP 连接已关闭'))
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时：${method}`))
        }
      }, 20000)
    })
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
    return this
  }

  once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待事件超时：${method}`)), timeout)
      const fn = (params) => {
        clearTimeout(timer)
        const arr = this.listeners.get(method) || []
        this.listeners.set(method, arr.filter((f) => f !== fn))
        resolve(params)
      }
      this.on(method, fn)
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

// ---------- 页面操作封装 ----------
function createPage(cdp) {
  const state = { consoleErrors: [], exceptions: [], requests: [], transferBytes: 0 }
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'assert') {
      state.consoleErrors.push(p.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
    }
  })
  cdp.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails
    state.exceptions.push(d.exception?.description || d.text || 'unknown')
  })
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') state.consoleErrors.push(`[log] ${p.entry.text}`)
  })
  cdp.on('Network.requestWillBeSent', (p) => state.requests.push(p.request.url))
  cdp.on('Network.loadingFinished', (p) => {
    if (typeof p.encodedDataLength === 'number') state.transferBytes += p.encodedDataLength
  })

  async function evaluate(expression) {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (res.exceptionDetails) {
      const d = res.exceptionDetails
      throw new Error('页面执行异常：' + (d.exception?.description || d.text))
    }
    return res.result.value
  }

  async function goto(url) {
    const loaded = cdp.once('Page.loadEventFired', 20000)
    await cdp.send('Page.navigate', { url })
    await loaded
    await sleep(150)
  }

  async function screenshot(name) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(path.join(ARTIFACTS, 'e2e'), { recursive: true })
    const file = path.join(ARTIFACTS, 'e2e', name)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }

  // 用真实输入事件（而非合成事件）按一个键
  async function pressKey(key, { code, vk, text } = {}) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key,
      code: code || '',
      windowsVirtualKeyCode: vk,
      text,
      unmodifiedText: text,
    })
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: code || '',
      windowsVirtualKeyCode: vk,
    })
    await sleep(60)
  }

  async function typeText(text) {
    await cdp.send('Input.insertText', { text })
    await sleep(80)
  }

  return { state, evaluate, goto, screenshot, pressKey, typeText, cdp }
}

async function run() {
  const browserPath = findBrowser()
  if (!browserPath) {
    warn('未找到 Edge/Chrome，跳过 E2E（CI/无浏览器环境正常）')
    process.exit(0)
  }
  console.log(`[e2e] 浏览器：${browserPath}`)

  fs.mkdirSync(ARTIFACTS, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-e2e-'))

  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })
  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--hide-scrollbars',
      '--mute-audio',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--window-size=1200,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )

  let cdp
  const cleanup = () => {
    try { cdp?.close() } catch {}
    try { browser.kill() } catch {}
    try { server.kill() } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch {}
  }

  try {
    await waitFor(() => fetchOk(`${ORIGIN}/index.html`), { label: '静态服务器就绪' })
    const version = await waitFor(async () => (await fetchOk(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), {
      label: 'CDP 就绪',
    })
    console.log(`[e2e] ${version.Browser}`)

    // 新建一个空目标并连上去
    let target
    try {
      target = await fetchOk(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, 'PUT').then((r) => r.json())
    } catch {
      const list = await fetchOk(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
      target = list.find((t) => t.type === 'page')
    }
    if (!target || !target.webSocketDebuggerUrl) throw new Error('无法创建调试目标')

    cdp = await new CDP(target.webSocketDebuggerUrl).connect()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Log.enable')
    await cdp.send('Network.enable')

    const page = createPage(cdp)
    const expected = [
      { file: 'SimpleSearch-Light.html', theme: 'light', bg: 'rgb(245, 245, 245)' },
      { file: 'SimpleSearch-Dark.html', theme: 'dark', bg: 'rgb(48, 48, 48)' },
    ]

    for (const spec of expected) {
      console.log(`\n=== ${spec.file} ===`)
      // 每个主题清空局部状态（localStorage 在 Theme 小节单独验证）
      await page.evaluate('try { localStorage.clear() } catch (e) {}')
      page.state.consoleErrors.length = 0
      page.state.exceptions.length = 0
      page.state.requests.length = 0
      page.state.transferBytes = 0

      await page.goto(`${ORIGIN}/${spec.file}`)
      await sleep(250)

      check(`${spec.file}: 无 JS 异常`, page.state.exceptions.length === 0, page.state.exceptions[0] || '')
      check(`${spec.file}: 无控制台错误`, page.state.consoleErrors.length === 0, page.state.consoleErrors[0] || '')
      check(`${spec.file}: 主题属性`, (await page.evaluate('document.documentElement.dataset.theme')) === spec.theme)
      check(
        `${spec.file}: 背景色`,
        (await page.evaluate('getComputedStyle(document.body).backgroundColor')) === spec.bg,
        await page.evaluate('getComputedStyle(document.body).backgroundColor')
      )
      const renderedSites = await page.evaluate(
        "[...document.querySelectorAll('#buttons-container [data-site]')].map((b) => b.dataset.site)"
      )
      const missingBuiltin = BUILTIN_SITE_IDS.filter((id) => !renderedSites.includes(id))
      check(
        `${spec.file}: 内置站点按钮齐全`,
        missingBuiltin.length === 0 && renderedSites.length >= BUILTIN_SITE_IDS.length,
        missingBuiltin.length ? `缺少 ${missingBuiltin.join(',')}` : `${renderedSites.length} 个`
      )
      check(`${spec.file}: 全部脚本已加载`, await page.evaluate('!!(window.SimpleSearch && SimpleSearch.sites && SimpleSearch.search && SimpleSearch.theme && SimpleSearch.input)'))

      // 搜索决策（编码正确性，真实浏览器环境）
      const decision = await page.evaluate("SimpleSearch.search.resolveSite('zhihu', 'a&b c')")
      check(
        `${spec.file}: 特殊字符编码`,
        decision && decision.url === 'https://www.zhihu.com/search?type=content&q=a%26b%20c',
        decision && decision.url
      )
      const navDecision = await page.evaluate("SimpleSearch.search.resolveSite('github', '  ')")
      check(`${spec.file}: 空词直达`, navDecision && navDecision.kind === 'nav' && navDecision.url === 'https://github.com')

      // 网络与体积：必须在交互/跳转之前采样，否则会把站点跳转的流量算进来
      const earlyRequests = [...page.state.requests]
      const earlyBytes = page.state.transferBytes
      const external = earlyRequests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'))
      check(`${spec.file}: 无第三方网络请求`, external.length === 0, external[0] || '')
      check(
        `${spec.file}: 首屏传输体积 < 80KB`,
        earlyBytes < 80 * 1024,
        `${(earlyBytes / 1024).toFixed(1)} KB / ${earlyRequests.length} 个请求`
      )

      // 输入 + 联想
      await page.evaluate("(() => { document.getElementById('search-input').focus() })()")
      await page.typeText('bil')
      await sleep(400)
      const suggestState = await page.evaluate(`(() => {
        const list = document.getElementById('suggest-list')
        return {
          hidden: list.hasAttribute('hidden'),
          count: list.querySelectorAll('[role="option"]').length,
          expanded: document.getElementById('search-input').getAttribute('aria-expanded'),
          firstText: list.querySelector('[role="option"]')?.textContent?.trim() || '',
        }
      })()`)
      check(`${spec.file}: 联想列表出现`, suggestState.hidden === false && suggestState.count > 0, `items=${suggestState.count}`)
      check(`${spec.file}: aria-expanded 同步`, suggestState.expanded === 'true', String(suggestState.expanded))

      await page.pressKey('ArrowDown', { code: 'ArrowDown', vk: 40 })
      await sleep(120)
      const activeId = await page.evaluate("document.getElementById('search-input').getAttribute('aria-activedescendant')")
      check(`${spec.file}: 方向键高亮联想项`, Boolean(activeId), String(activeId))

      await page.pressKey('Escape', { code: 'Escape', vk: 27 })
      await sleep(150)
      check(`${spec.file}: Esc 关闭联想`, await page.evaluate("document.getElementById('suggest-list').hasAttribute('hidden')"))

      // 清除按钮
      check(
        `${spec.file}: 清除按钮可见`,
        (await page.evaluate("document.getElementById('clear-button').hidden")) === false
      )
      await page.evaluate("document.getElementById('clear-button').click()")
      await sleep(120)
      check(
        `${spec.file}: 清除按钮可用`,
        (await page.evaluate("document.getElementById('search-input').value")) === '' &&
          (await page.evaluate("document.getElementById('clear-button').hidden")) === true
      )

      // '/' 快捷键聚焦
      await page.evaluate("document.getElementById('search-input').blur()")
      await page.pressKey('/', { code: 'Slash', vk: 191, text: '/' })
      await sleep(150)
      const focused = await page.evaluate('document.activeElement && document.activeElement.id')
      check(`${spec.file}: 斜杠快捷键聚焦`, focused === 'search-input', String(focused))

      // 真实点击站点按钮 → 观察导航请求（有词时站内搜索）
      await page.evaluate(`(() => {
        const input = document.getElementById('search-input')
        input.value = 'rust'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await sleep(200)
      const navRequested = page.cdp.once('Page.frameRequestedNavigation', 4000).catch(() => null)
      await page.evaluate("document.querySelector('[data-site=\"archwiki\"]').click()")
      const navParams = await navRequested
      check(
        `${spec.file}: 点击按钮跳转站内搜索`,
        navParams && String(navParams.url).startsWith('https://wiki.archlinux.org/index.php?search=rust'),
        navParams && navParams.url
      )

      // 主题切换 + 持久化
      await page.goto(`${ORIGIN}/${spec.file}`)
      await sleep(200)
      await page.evaluate("document.getElementById('theme-toggle').click()")
      await sleep(200)
      const flipped = await page.evaluate('document.documentElement.dataset.theme')
      const storedTheme = await page.evaluate("localStorage.getItem('ss.theme')")
      check(`${spec.file}: 切换主题生效`, flipped !== spec.theme && flipped === storedTheme, `${spec.theme} -> ${flipped}`)
      await page.goto(`${ORIGIN}/${spec.file}`)
      await sleep(250)
      check(
        `${spec.file}: 刷新后主题保持`,
        (await page.evaluate('document.documentElement.dataset.theme')) === flipped
      )
      await page.evaluate("try { localStorage.clear() } catch(e) {}")

      // 键盘可达性：Tab 顺序里第一个可聚焦元素
      const tabOrder = await page.evaluate(`(() => {
        const focusables = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')]
        return focusables.map(el => el.id || el.className || el.tagName)
      })()`)
      check(`${spec.file}: 可聚焦元素齐全`, tabOrder.length >= 13, `count=${tabOrder.length}`)

      if (SHOTS) {
        // 截图前必须回到页面默认主题（上面的切换测试会留下 ss.theme）
        await page.evaluate("try { localStorage.clear() } catch (e) {}")
        await page.goto(`${ORIGIN}/${spec.file}`)
        await sleep(300)
        const shot = await page.screenshot(`${spec.file.replace('.html', '')}-desktop.png`)
        console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
      }
    }

    // ---------- 移动端视口 ----------
    console.log('\n=== 移动端 390x844 ===')
    await page.evaluate("try { localStorage.clear() } catch (e) {}")
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    })
    for (const file of ['SimpleSearch-Light.html', 'SimpleSearch-Dark.html']) {
      page.state.consoleErrors.length = 0
      page.state.exceptions.length = 0
      await page.goto(`${ORIGIN}/${file}`)
      await sleep(300)
      check(`${file} @390: 无 JS 异常`, page.state.exceptions.length === 0, page.state.exceptions[0] || '')
      const overflow = await page.evaluate(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth'
      )
      check(`${file} @390: 无横向溢出`, overflow <= 1, `溢出 ${overflow}px`)
      const inputWidth = await page.evaluate("document.getElementById('search-input').getBoundingClientRect().width")
      check(`${file} @390: 输入框宽度充足`, inputWidth >= 200, `${Math.round(inputWidth)}px`)
      const btnH = await page.evaluate(
        "Math.min(...[...document.querySelectorAll('#buttons-container .button')].map(b => b.getBoundingClientRect().height))"
      )
      check(`${file} @390: 按钮触控高度 ≥ 32px`, btnH >= 32, `${btnH}px`)
      if (SHOTS) {
        const shot = await page.screenshot(`${file.replace('.html', '')}-mobile.png`)
        console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
      }
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride')

    // ---------- file:// 双击可用性 ----------
    console.log('\n=== file:// 直接打开（双击场景） ===')
    for (const file of ['SimpleSearch-Light.html', 'SimpleSearch-Dark.html']) {
      page.state.consoleErrors.length = 0
      page.state.exceptions.length = 0
      const fileUrl = 'file:///' + path.join(ROOT, file).replace(/\\/g, '/')
      await page.goto(fileUrl)
      await sleep(300)
      check(`${file} file://: 无 JS 异常`, page.state.exceptions.length === 0, page.state.exceptions[0] || '')
      check(
        `${file} file://: 脚本与数据可用`,
        await page.evaluate(
          "(window.SimpleSearch && Array.isArray(SimpleSearch.sites) && SimpleSearch.sites.length === 11) && SimpleSearch.search.resolveSite('jd','x').url === 'https://search.jd.com/Search?keyword=x'"
        )
      )
      check(
        `${file} file://: 按钮已渲染`,
        (await page.evaluate(
          "[...document.querySelectorAll('#buttons-container [data-site]')].map((b) => b.dataset.site).length"
        )) >= BUILTIN_SITE_IDS.length
      )
    }
  } finally {
    cleanup()
  }

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n[e2e] ${checks.length - failed.length}/${checks.length} 通过`)
  if (failed.length) {
    console.error('[e2e] 失败项：')
    for (const f of failed) console.error(`  - ${f.name}${f.detail ? ' — ' + f.detail : ''}`)
    process.exit(1)
  }
  console.log('[e2e] 全部通过')
}

run().catch((err) => {
  console.error('[e2e] 运行失败：', err && err.stack ? err.stack : err)
  process.exit(1)
})
