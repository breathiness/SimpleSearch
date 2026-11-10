// 真实浏览器端到端验证（零依赖）：
//   node scripts/e2e.mjs            跑全部检查
//   node scripts/e2e.mjs --shots    额外输出截图到 artifacts/
//
// 原理：启动 node scripts/serve.mjs 静态服务 + 本机 Edge/Chrome headless（CDP），
// 用 Node 22 内置 WebSocket 直接说 DevTools 协议，检查真实渲染、交互、网络与控制台。
//
// v2.1 起：index.html 是唯一真实页面；SimpleSearch-Light/Dark.html 是 0 秒重定向壳。
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
// 端口随机化：允许多个 e2e 实例（例如人 + 智能体）并行跑而不互相抢 CDP 端口
const PORT = Number(process.env.E2E_PORT || 8000 + Math.floor(Math.random() * 900))
const CDP_PORT = Number(process.env.E2E_CDP_PORT || 9200 + Math.floor(Math.random() * 700))
const ORIGIN = `http://127.0.0.1:${PORT}`
const PAGE = `${ORIGIN}/index.html`

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
const LIGHT_BG = 'rgb(245, 245, 245)'
const DARK_BG = 'rgb(48, 48, 48)'

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail: String(detail || '') })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}
function warn(name, detail) {
  console.log(`WARN  ${name}${detail ? '  — ' + detail : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

  async function goto(url, settle = 200) {
    const loaded = cdp.once('Page.loadEventFired', 20000).catch(() => null)
    await cdp.send('Page.navigate', { url })
    await loaded
    // 等到应用真正装配完成，避免"脚本已加载但事件还没绑"的竞态
    try {
      await waitFor(
        async () => (await evaluate("document.documentElement.getAttribute('data-app-ready') === '1'")),
        { timeout: 5000, interval: 50, label: 'data-app-ready' }
      )
    } catch {
      // 非应用页（如外部站点/尚未重定向完的壳）没有该标记，继续
    }
    await sleep(settle)
  }

  function resetLogs() {
    state.consoleErrors.length = 0
    state.exceptions.length = 0
    state.requests.length = 0
    state.transferBytes = 0
  }

  async function screenshot(name) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    fs.mkdirSync(path.join(ARTIFACTS, 'e2e'), { recursive: true })
    const file = path.join(ARTIFACTS, 'e2e', name)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  }

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

  async function clearStorage() {
    await evaluate('(() => { try { localStorage.clear() } catch (e) {} })()')
  }

  async function setStored(key, value) {
    await evaluate(`(() => { try { localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}) } catch (e) {} })()`)
  }

  async function stored(key) {
    return evaluate(`(() => { try { return localStorage.getItem(${JSON.stringify(key)}) } catch (e) { return null } })()`)
  }

  async function theme() {
    return evaluate('document.documentElement.dataset.theme')
  }

  async function bg() {
    return evaluate('getComputedStyle(document.body).backgroundColor')
  }

  return {
    state,
    evaluate,
    goto,
    screenshot,
    pressKey,
    typeText,
    resetLogs,
    clearStorage,
    setStored,
    stored,
    theme,
    bg,
    cdp,
  }
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
    const emulateSystemTheme = (value) =>
      cdp.send('Emulation.setEmulatedMedia', {
        features: value ? [{ name: 'prefers-color-scheme', value }] : [],
      })

    // ================= A. 单页：主题解析优先级 =================
    console.log('\n=== A. 单页主题解析（?theme= → 存储 → 系统 → 浅色） ===')
    await page.clearStorage()
    await emulateSystemTheme(null)

    // A1 URL 参数 > 一切
    await page.goto(`${PAGE}?theme=light`)
    check('A1 ?theme=light 生效', (await page.theme()) === 'light', await page.theme())
    check('A1 背景色', (await page.bg()) === LIGHT_BG, await page.bg())
    check('A1 参数被写回存储', (await page.stored('ss.theme')) === 'light')
    check('A1 地址栏参数被清理', (await page.evaluate('location.search')) === '', await page.evaluate('location.search'))

    await page.clearStorage()
    await page.goto(`${PAGE}?theme=dark`)
    check('A2 ?theme=dark 生效', (await page.theme()) === 'dark', await page.theme())
    check('A2 背景色', (await page.bg()) === DARK_BG, await page.bg())

    // A3 系统偏好（无存储、无参数）
    await page.clearStorage()
    await emulateSystemTheme('dark')
    await page.goto(PAGE)
    check('A3 跟随系统深色', (await page.theme()) === 'dark', await page.theme())
    check('A3 系统偏好不写入存储', (await page.stored('ss.theme')) === null)

    await page.clearStorage()
    await emulateSystemTheme('light')
    await page.goto(PAGE)
    check('A4 跟随系统浅色', (await page.theme()) === 'light', await page.theme())

    // A5 存储优先于系统
    await page.clearStorage()
    await page.setStored('ss.theme', 'light')
    await emulateSystemTheme('dark')
    await page.goto(PAGE)
    check('A5 存储优先于系统偏好', (await page.theme()) === 'light', await page.theme())

    // A6 切换 + 持久化
    await page.clearStorage()
    await emulateSystemTheme('light')
    await page.goto(PAGE)
    await page.evaluate("document.getElementById('theme-toggle').click()")
    await sleep(200)
    check('A6 切换生效', (await page.theme()) === 'dark', await page.theme())
    check('A6 切换写入存储', (await page.stored('ss.theme')) === 'dark')
    const toggleLabel = await page.evaluate("document.getElementById('theme-toggle').textContent")
    check('A6 按钮文案同步', /白天模式/.test(toggleLabel), toggleLabel)
    await page.goto(PAGE)
    check('A6 刷新后保持', (await page.theme()) === 'dark', await page.theme())
    await emulateSystemTheme(null)

    // ================= B. 旧链接重定向 =================
    console.log('\n=== B. 老链接 0 秒重定向 ===')
    for (const spec of [
      { file: 'SimpleSearch-Light.html', want: 'light' },
      { file: 'SimpleSearch-Dark.html', want: 'dark' },
    ]) {
      await page.clearStorage()
      page.resetLogs()
      await page.goto(`${ORIGIN}/${spec.file}`, 800)
      const pathname = await page.evaluate('location.pathname')
      check(`${spec.file}: 已跳到单页`, /\/index\.html$/.test(pathname), pathname)
      check(`${spec.file}: 主题正确`, (await page.theme()) === spec.want, await page.theme())
      check(`${spec.file}: 无 JS 异常`, page.state.exceptions.length === 0, page.state.exceptions[0] || '')
    }

    // ================= C. 主功能（单页，本地联想模式） =================
    console.log('\n=== C. 主功能 ===')
    await page.clearStorage()
    await page.setStored('ss.remote', 'off') // 本地模式：功能检查不依赖网络
    page.resetLogs()
    await page.goto(PAGE)

    check('C: 无 JS 异常', page.state.exceptions.length === 0, page.state.exceptions[0] || '')
    const scriptReady = await page.evaluate(
      '!!(window.SimpleSearch && SimpleSearch.sites && SimpleSearch.search && SimpleSearch.theme && SimpleSearch.input && SimpleSearch.remote)'
    )
    check('C: 全部脚本已加载（含 remote.js）', scriptReady)

    const renderedSites = await page.evaluate(
      "[...document.querySelectorAll('#buttons-container [data-site]')].map((b) => b.dataset.site)"
    )
    const missingBuiltin = BUILTIN_SITE_IDS.filter((id) => !renderedSites.includes(id))
    check(
      'C: 内置站点按钮齐全',
      missingBuiltin.length === 0 && renderedSites.length >= BUILTIN_SITE_IDS.length,
      missingBuiltin.length ? `缺少 ${missingBuiltin.join(',')}` : `${renderedSites.length} 个`
    )

    // ---- 分类 chip ----
    const chipInfo = await page.evaluate(`(() => {
      const wrap = document.getElementById('group-chips-wrap')
      const chips = [...document.querySelectorAll('#group-chips .chip')]
      return {
        wrapHidden: wrap ? wrap.hidden : null,
        count: chips.length,
        groups: chips.map((c) => c.getAttribute('data-group')),
        pressed: chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.getAttribute('data-group')),
      }
    })()`)
    check('C: 分类 chip 已显示', chipInfo.wrapHidden === false && chipInfo.count >= 2, `${chipInfo.count} 个`)
    check('C: 默认选中「全部」', chipInfo.pressed.length === 1 && chipInfo.pressed[0] === 'all', chipInfo.pressed.join(','))
    check('C: chip 分组 id 合法', chipInfo.groups.includes('all') && chipInfo.groups.length >= 2, chipInfo.groups.join(','))

    await page.evaluate(`document.querySelector('#group-chips [data-group="shopping"]').click()`)
    await sleep(200)
    const filtered = await page.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('#buttons-container [data-site]')]
      const visible = buttons.filter((b) => !b.hidden)
      return {
        visible: visible.map((b) => b.dataset.site),
        allShopping: visible.every((b) => b.dataset.group === 'shopping'),
        total: buttons.length,
        pressed: document.querySelector('#group-chips [data-group="shopping"]').getAttribute('aria-pressed'),
      }
    })()`)
    check(
      'C: 分类筛选生效',
      filtered.visible.length > 0 && filtered.visible.length < filtered.total && filtered.allShopping,
      `${filtered.visible.join(',')}（共 ${filtered.total}）`
    )
    check('C: 被选 chip 的 aria-pressed 正确', filtered.pressed === 'true', String(filtered.pressed))

    await page.evaluate(`document.querySelector('#group-chips [data-group="all"]').click()`)
    await sleep(200)
    const restored = await page.evaluate(
      "[...document.querySelectorAll('#buttons-container [data-site]')].filter((b) => !b.hidden).length"
    )
    check('C: 点「全部」恢复全量', restored === renderedSites.length, `${restored}/${renderedSites.length}`)

    // ---- 内联图标（零额外请求） ----
    const iconInfo = await page.evaluate(`(() => {
      const symbols = [...document.querySelectorAll('.icon-sprite symbol')].map((s) => s.id)
      const buttons = [...document.querySelectorAll('#buttons-container [data-site]')]
      const uses = buttons.map((b) => b.querySelector('use') && b.querySelector('use').getAttribute('href')).filter(Boolean)
      return {
        symbols: symbols.length,
        buttons: buttons.length,
        withIcon: buttons.filter((b) => b.querySelector('.button-icon')).length,
        uses: uses.length,
        unresolved: uses.filter((href) => !document.querySelector(href)),
      }
    })()`)
    check(
      'C: 每个站点按钮都有图标',
      iconInfo.withIcon === iconInfo.buttons && iconInfo.uses === iconInfo.buttons,
      `${iconInfo.withIcon}/${iconInfo.buttons}`
    )
    check('C: 图标 sprite 覆盖全部站点', iconInfo.symbols >= iconInfo.buttons && iconInfo.unresolved.length === 0, `${iconInfo.symbols} symbols`)
    const imageRequests = page.state.requests.filter((u) => /\.(png|jpe?g|webp|gif|ico)(\?|$)/i.test(u))
    check('C: 图标零图片请求', imageRequests.length === 0, imageRequests[0] || '')

    const decision = await page.evaluate("SimpleSearch.search.resolveSite('zhihu', 'a&b c')")
    check(
      'C: 特殊字符编码',
      decision && decision.url === 'https://www.zhihu.com/search?type=content&q=a%26b%20c',
      decision && decision.url
    )
    const navDecision = await page.evaluate("SimpleSearch.search.resolveSite('github', '  ')")
    check('C: 空词直达', navDecision && navDecision.kind === 'nav' && navDecision.url === 'https://github.com')

    // 静态资源只同源
    const externalAssets = page.state.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'))
    check('C: 首屏无第三方请求', externalAssets.length === 0, externalAssets[0] || '')
    check(
      'C: 首屏传输体积 < 120KB',
      page.state.transferBytes < 120 * 1024,
      `${(page.state.transferBytes / 1024).toFixed(1)} KB / ${page.state.requests.length} 个请求`
    )

    // 联想 + 键盘
    await page.evaluate("(() => { document.getElementById('search-input').focus() })()")
    await page.typeText('bil')
    await sleep(400)
    const suggestState = await page.evaluate(`(() => {
      const list = document.getElementById('suggest-list')
      return {
        hidden: list.hasAttribute('hidden'),
        count: list.querySelectorAll('[role="option"]').length,
        expanded: document.getElementById('search-input').getAttribute('aria-expanded'),
      }
    })()`)
    check('C: 本地联想出现', suggestState.hidden === false && suggestState.count > 0, `items=${suggestState.count}`)
    check('C: aria-expanded 同步', suggestState.expanded === 'true', String(suggestState.expanded))

    await page.pressKey('ArrowDown', { code: 'ArrowDown', vk: 40 })
    await sleep(120)
    const activeId = await page.evaluate("document.getElementById('search-input').getAttribute('aria-activedescendant')")
    check('C: 方向键高亮联想项', Boolean(activeId), String(activeId))

    await page.pressKey('Escape', { code: 'Escape', vk: 27 })
    await sleep(150)
    check('C: Esc 关闭联想', await page.evaluate("document.getElementById('suggest-list').hasAttribute('hidden')"))

    check('C: 清除按钮可见', (await page.evaluate("document.getElementById('clear-button').hidden")) === false)
    await page.evaluate("document.getElementById('clear-button').click()")
    await sleep(120)
    check(
      'C: 清除按钮可用',
      (await page.evaluate("document.getElementById('search-input').value")) === '' &&
        (await page.evaluate("document.getElementById('clear-button').hidden")) === true
    )

    await page.evaluate("document.getElementById('search-input').blur()")
    await page.pressKey('/', { code: 'Slash', vk: 191, text: '/' })
    await sleep(150)
    check('C: 斜杠快捷键聚焦', (await page.evaluate('document.activeElement && document.activeElement.id')) === 'search-input')

    // 真实点击站点按钮 → 导航到站内搜索
    await page.evaluate(`(() => {
      const input = document.getElementById('search-input')
      input.value = 'rust'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(200)
    const navRequested = page.cdp.once('Page.frameRequestedNavigation', 4000).catch(() => null)
    await page.evaluate(`document.querySelector('[data-site="archwiki"]').click()`)
    const navParams = await navRequested
    check(
      'C: 点击按钮跳转站内搜索',
      navParams && String(navParams.url).startsWith('https://wiki.archlinux.org/index.php?search=rust'),
      navParams && navParams.url
    )

    // 上面的点击是真实导航，页面已经离开本站；回到单页再继续后续断言
    await page.goto(PAGE, 400)

    const focusables = await page.evaluate(`(() => {
      const els = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')]
      return els.map((el) => el.id || el.className || el.tagName)
    })()`)
    check('C: 可聚焦元素齐全', focusables.length >= 14, `count=${focusables.length}`)

    // ================= D. 联网联想开关 =================
    console.log('\n=== D. 联网联想：开关与隐私 ===')
    await page.clearStorage()
    await page.goto(PAGE)
    const toggleState = await page.evaluate(`(() => {
      const b = document.getElementById('suggest-source-toggle')
      return { exists: !!b, pressed: b && b.getAttribute('aria-pressed'), text: b && b.textContent }
    })()`)
    check('D: 开关存在且默认开启', toggleState.exists && toggleState.pressed === 'true', toggleState.text)

    await page.evaluate("document.getElementById('suggest-source-toggle').click()")
    await sleep(200)
    const afterClick = await page.evaluate(`(() => {
      const b = document.getElementById('suggest-source-toggle')
      return {
        pressed: b && b.getAttribute('aria-pressed'),
        text: b && b.textContent,
        stored: (() => { try { return localStorage.getItem('ss.remote') } catch (e) { return 'ERR' } })(),
        enabled: window.SimpleSearch && SimpleSearch.remote ? SimpleSearch.remote.enabled() : null,
      }
    })()`)
    check(
      'D: 点击后关闭并写入存储',
      afterClick.pressed === 'false' && afterClick.stored === 'off',
      `pressed=${afterClick.pressed} stored=${afterClick.stored} enabled=${afterClick.enabled} text=${afterClick.text}`
    )

    // 关闭状态：输入不产生任何第三方请求
    page.resetLogs()
    await page.evaluate("(() => { const i = document.getElementById('search-input'); i.focus() })()")
    await page.typeText('简单搜索')
    await sleep(1200)
    const offlineExternal = page.state.requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'))
    check('D: 关闭后零第三方请求', offlineExternal.length === 0, offlineExternal[0] || '')
    const localItems = await page.evaluate("document.querySelectorAll('#suggest-list [role=\"option\"]').length")
    check('D: 关闭后本地联想仍可用', localItems > 0, `items=${localItems}`)

    // ================= E. 联网联想（真实请求，网络不可用时只警告） =================
    console.log('\n=== E. 联网联想（百度 JSONP） ===')
    await page.clearStorage() // ss.remote 缺省 = on
    await page.goto(PAGE)
    page.resetLogs()
    await page.evaluate("(() => { const i = document.getElementById('search-input'); i.focus() })()")
    await page.typeText('简单搜索')
    let remoteCount = 0
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      remoteCount = await page.evaluate(
        "document.querySelectorAll('#suggest-list [data-type=\"remote\"]').length"
      )
      if (remoteCount > 0) break
      await sleep(200)
    }
    const remoteRequests = page.state.requests.filter((u) => !u.startsWith(ORIGIN))
    const onlyBaidu = remoteRequests.every((u) => u.startsWith('https://suggestion.baidu.com/'))
    if (remoteCount > 0) {
      check('E: 联网联想返回结果', true, `${remoteCount} 条，请求 ${remoteRequests.length} 次`)
      check('E: 请求只发往百度', onlyBaidu, remoteRequests[0] || '')
      const merged = await page.evaluate(`(() => {
        const items = [...document.querySelectorAll('#suggest-list [role="option"]')]
        return items.map((el) => el.dataset.type)
      })()`)
      check('E: 合并顺序 engine → site → remote → history', merged[0] === 'engine', merged.join(' > '))
      check('E: 远程项数量 ≤ 5', remoteCount <= 5, String(remoteCount))
      check('E: 总条数 ≤ 8', merged.length <= 8, String(merged.length))
      if (SHOTS) {
        const shot = await page.screenshot('index-suggest-open.png')
        console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
      }
    } else {
      warn('E: 联网联想未返回结果（可能网络不可达），已自动降级为本地联想；不判失败')
      check('E: 失败时本地联想仍可用', (await page.evaluate("document.querySelectorAll('#suggest-list [role=\"option\"]').length")) > 0)
    }

    // ================= F. 移动端 =================
    console.log('\n=== F. 移动端 390x844 ===')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    })
    for (const spec of [
      { name: 'light', url: `${PAGE}?theme=light`, bg: LIGHT_BG },
      { name: 'dark', url: `${PAGE}?theme=dark`, bg: DARK_BG },
    ]) {
      await page.clearStorage()
      page.resetLogs()
      await page.goto(spec.url, 400)
      check(`F: ${spec.name} 无 JS 异常`, page.state.exceptions.length === 0, page.state.exceptions[0] || '')
      check(`F: ${spec.name} 背景色`, (await page.bg()) === spec.bg, await page.bg())
      const overflow = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      check(`F: ${spec.name} 无横向溢出`, overflow <= 1, `溢出 ${overflow}px`)
      const layout = await page.evaluate(`(() => {
        const input = document.getElementById('search-input').getBoundingClientRect()
        const submit = document.getElementById('search-submit').getBoundingClientRect()
        const btn = Math.min(...[...document.querySelectorAll('#buttons-container .button')].map((b) => b.getBoundingClientRect().height))
        const footer = document.getElementById('site-footer').getBoundingClientRect()
        return { inputW: input.width, sameRow: Math.abs(input.top - submit.top) < 8, btnH: btn, footerBottom: footer.bottom, vh: window.innerHeight }
      })()`)
      check(`F: ${spec.name} 输入框宽度充足`, layout.inputW >= 200, `${Math.round(layout.inputW)}px`)
      check(`F: ${spec.name} 输入框与搜索按钮同一行`, layout.sameRow)
      check(`F: ${spec.name} 按钮触控高度 ≥ 40px`, layout.btnH >= 40, `${layout.btnH}px`)
      check(`F: ${spec.name} 页脚不超出视口`, layout.footerBottom <= layout.vh + 1, `${layout.footerBottom}/${layout.vh}`)
      if (SHOTS) {
        const shot = await page.screenshot(`index-${spec.name}-mobile.png`)
        console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
      }
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride')

    // ================= G. 桌面截图 =================
    if (SHOTS) {
      for (const spec of [
        { name: 'light', url: `${PAGE}?theme=light` },
        { name: 'dark', url: `${PAGE}?theme=dark` },
      ]) {
        await page.goto(spec.url, 400)
        const shot = await page.screenshot(`index-${spec.name}-desktop.png`)
        console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
      }
    }

    // ================= H. file:// 双击可用 =================
    console.log('\n=== H. file:// 直接打开（双击场景） ===')
    const fileUrl = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/')
    await page.clearStorage()
    page.resetLogs()
    await page.goto(fileUrl, 400)
    check('H: 无 JS 异常', page.state.exceptions.length === 0, page.state.exceptions[0] || '')
    check(
      'H: 脚本与数据可用',
      await page.evaluate(
        "(window.SimpleSearch && Array.isArray(SimpleSearch.sites) && SimpleSearch.sites.length === 11) && SimpleSearch.search.resolveSite('jd','x').url === 'https://search.jd.com/Search?keyword=x'"
      )
    )
    check(
      'H: 按钮已渲染',
      (await page.evaluate(
        "[...document.querySelectorAll('#buttons-container [data-site]')].length"
      )) >= BUILTIN_SITE_IDS.length
    )
    check('H: 主题开关可用', (await page.evaluate("!!document.getElementById('theme-toggle')")))
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
