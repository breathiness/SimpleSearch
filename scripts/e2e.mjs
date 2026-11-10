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

    // A6 切换 + 持久化（设置面板里的开关）
    await page.clearStorage()
    await emulateSystemTheme('light')
    await page.goto(PAGE)
    await page.evaluate("SimpleSearch.app && SimpleSearch.app.openSettings()")
    await sleep(250)
    await page.evaluate("document.getElementById('theme-toggle').click()")
    await sleep(250)
    check('A6 切换生效', (await page.theme()) === 'dark', await page.theme())
    check('A6 切换写入存储', (await page.stored('ss.theme')) === 'dark')
    const switchState = await page.evaluate(`(() => {
      const b = document.getElementById('theme-toggle')
      return { pressed: b.getAttribute('aria-pressed'), text: (b.textContent || '').trim() }
    })()`)
    check('A6 开关状态与文案', switchState.pressed === 'true' && switchState.text === '夜间模式', JSON.stringify(switchState))
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

    // 网络与体积：首屏加载后立刻采样（后面有交互和导航，别把它们的流量算进来）
    const earlyRequests = [...page.state.requests]
    const earlyBytes = page.state.transferBytes
    const externalAssets = earlyRequests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:'))
    check('C: 首屏无第三方请求', externalAssets.length === 0, externalAssets[0] || '')
    check(
      'C: 首屏传输体积 < 120KB',
      earlyBytes < 120 * 1024,
      `${(earlyBytes / 1024).toFixed(1)} KB / ${earlyRequests.length} 个请求`
    )

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

    // ---- 文档站式骨架：顶栏 + 左侧分类导航 ----
    const shell = await page.evaluate(`(() => {
      const appbar = document.querySelector('.appbar')
      const title = document.querySelector('.appbar-title')
      const nav = document.getElementById('site-nav')
      const items = [...document.querySelectorAll('#group-chips .nav-item')]
      const navToggle = document.getElementById('nav-toggle')
      return {
        appbar: !!appbar,
        title: title && title.textContent.trim(),
        hasNav: !!nav,
        itemCount: items.length,
        groups: items.map((i) => i.getAttribute('data-group')),
        current: items.filter((i) => i.getAttribute('aria-current') === 'true').map((i) => i.getAttribute('data-group')),
        navToggleDisplayed: navToggle ? getComputedStyle(navToggle).display !== 'none' : null,
        hasFooter: !!document.getElementById('site-footer'),
        hasSettingsToggle: !!document.getElementById('settings-toggle'),
        panelHidden: document.getElementById('settings-panel').hidden,
        scrimHidden: document.getElementById('scrim').hidden,
        logo: (() => {
          const logo = document.querySelector('.appbar-logo use')
          return logo ? logo.getAttribute('href') : null
        })(),
        navIcons: [...document.querySelectorAll('#group-chips .nav-icon use')].map((u) => u.getAttribute('href')),
        navLabels: [...document.querySelectorAll('#group-chips .nav-label')].map((s) => s.textContent.trim()),
      }
    })()`)
    check('C: 顶栏存在且标题正确', shell.appbar && shell.title === '简单搜索', shell.title)
    check('C: 左侧分类导航存在', shell.hasNav && shell.itemCount >= 2, `${shell.itemCount} 项`)
    check('C: 默认只有「全部」被选中', shell.current.length === 1 && shell.current[0] === 'all', shell.current.join(','))
    check('C: 桌面端不显示汉堡', shell.navToggleDisplayed === false, String(shell.navToggleDisplayed))
    check('C: 页脚已移除', shell.hasFooter === false)
    check('C: 设置面板默认隐藏且遮罩隐藏', shell.hasSettingsToggle && shell.panelHidden && shell.scrimHidden)
    check('C: 顶栏 logo 存在', shell.logo === '#i-logo', String(shell.logo))
    check(
      'C: 分类导航有图标与文字',
      shell.navIcons.length === shell.itemCount && shell.navLabels.length === shell.itemCount && shell.navLabels[0] === '全部',
      `${shell.navIcons.length} 图标 / ${shell.navLabels.join('·')}`
    )

    await page.evaluate(`document.querySelector('#group-chips [data-group="shopping"]').click()`)
    await sleep(200)
    const filtered = await page.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('#buttons-container [data-site]')]
      const visible = buttons.filter((b) => !b.hidden)
      const items = [...document.querySelectorAll('#group-chips .nav-item')]
      return {
        visible: visible.map((b) => b.dataset.site),
        allShopping: visible.every((b) => b.dataset.group === 'shopping'),
        total: buttons.length,
        current: items.filter((i) => i.getAttribute('aria-current') === 'true').map((i) => i.getAttribute('data-group')),
      }
    })()`)
    check(
      'C: 分类筛选生效',
      filtered.visible.length > 0 && filtered.visible.length < filtered.total && filtered.allShopping,
      `${filtered.visible.join(',')}（共 ${filtered.total}）`
    )
    check('C: aria-current 同步', filtered.current.length === 1 && filtered.current[0] === 'shopping', filtered.current.join(','))

    await page.evaluate(`document.querySelector('#group-chips [data-group="all"]').click()`)
    await sleep(200)
    const restored = await page.evaluate(
      "[...document.querySelectorAll('#buttons-container [data-site]')].filter((b) => !b.hidden).length"
    )
    check('C: 点「全部」恢复全量', restored === renderedSites.length, `${restored}/${renderedSites.length}`)

    // ---- 设置抽屉 ----
    await page.evaluate("document.getElementById('settings-toggle').click()")
    await sleep(350)
    const panelState = await page.evaluate(`(() => {
      const panel = document.getElementById('settings-panel')
      const scrim = document.getElementById('scrim')
      const switches = [...panel.querySelectorAll('.switch-row')]
      const active = document.activeElement
      return {
        panelHidden: panel.hidden,
        scrimHidden: scrim.hidden,
        rows: switches.map((s) => s.id),
        expanded: document.getElementById('settings-toggle').getAttribute('aria-expanded'),
        focusInside: panel.contains(active),
      }
    })()`)
    check('C: 点设置打开面板', panelState.panelHidden === false && panelState.expanded === 'true')
    check('C: 遮罩显示', panelState.scrimHidden === false)
    check(
      'C: 面板内有两个开关行',
      panelState.rows.includes('theme-toggle') && panelState.rows.includes('suggest-source-toggle'),
      panelState.rows.join(',')
    )
    check('C: 打开后焦点进入面板', panelState.focusInside)

    // ---- 主题色（MDUI 19 色）----
    const colorInfo = await page.evaluate(`(() => {
      const html = document.documentElement
      const swatches = [...document.querySelectorAll('#color-swatches .swatch')]
      return {
        color: html.getAttribute('data-color'),
        count: swatches.length,
        pressed: swatches.filter((s) => s.getAttribute('aria-pressed') === 'true').map((s) => s.getAttribute('data-color')),
        primaryVar: getComputedStyle(html).getPropertyValue('--primary-bg').trim().toLowerCase(),
      }
    })()`)
    check(
      'C: 默认主题色 indigo',
      colorInfo.color === 'indigo' && colorInfo.pressed.length === 1 && colorInfo.pressed[0] === 'indigo',
      JSON.stringify(colorInfo)
    )
    check('C: 19 个主题色块', colorInfo.count === 19, String(colorInfo.count))
    check('C: 默认主色变量', colorInfo.primaryVar === '#3f51b5', colorInfo.primaryVar)

    await page.evaluate(`document.querySelector('#color-swatches .swatch[data-color="orange"]').click()`)
    await sleep(300)
    const afterColor = await page.evaluate(`(() => {
      const html = document.documentElement
      const swatches = [...document.querySelectorAll('#color-swatches .swatch')]
      return {
        color: html.getAttribute('data-color'),
        appbar: getComputedStyle(document.querySelector('.appbar')).backgroundColor,
        pressed: swatches.filter((s) => s.getAttribute('aria-pressed') === 'true').map((s) => s.getAttribute('data-color')),
        stored: (() => { try { return localStorage.getItem('ss.color') } catch (e) { return null } })(),
      }
    })()`)
    check(
      'C: 换主题色生效（顶栏变色）',
      afterColor.color === 'orange' && afterColor.appbar === 'rgb(255, 152, 0)',
      `${afterColor.color} / ${afterColor.appbar}`
    )
    check('C: 主题色写入存储', afterColor.stored === 'orange', String(afterColor.stored))
    check('C: 色块选中态唯一', afterColor.pressed.length === 1 && afterColor.pressed[0] === 'orange', afterColor.pressed.join(','))

    if (SHOTS) {
      const shot = await page.screenshot('index-settings-color.png')
      console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
    }
    if (SHOTS) {
      const shot = await page.screenshot('index-settings-open.png')
      console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
    }

    await page.pressKey('Escape', { code: 'Escape', vk: 27 })
    await sleep(250)
    const afterEsc = await page.evaluate(`(() => ({
      panelHidden: document.getElementById('settings-panel').hidden,
      scrimHidden: document.getElementById('scrim').hidden,
      focusId: document.activeElement && document.activeElement.id,
    }))()`)
    check('C: Esc 关闭面板并归还焦点', afterEsc.panelHidden === true && afterEsc.scrimHidden === true && afterEsc.focusId === 'settings-toggle')

    // 主题色刷新保持 + 复位
    await page.goto(PAGE)
    const persistedColor = await page.evaluate(`(() => ({
      color: document.documentElement.getAttribute('data-color'),
      appbar: getComputedStyle(document.querySelector('.appbar')).backgroundColor,
    }))()`)
    check(
      'C: 主题色刷新保持',
      persistedColor.color === 'orange' && persistedColor.appbar === 'rgb(255, 152, 0)',
      JSON.stringify(persistedColor)
    )
    await page.clearStorage()
    await page.goto(PAGE)
    check(
      'C: 清空存储后回默认色',
      (await page.evaluate("document.documentElement.getAttribute('data-color')")) === 'indigo'
    )

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
    await page.evaluate("SimpleSearch.app.openSettings()")
    await sleep(300)
    const toggleState = await page.evaluate(`(() => {
      const b = document.getElementById('suggest-source-toggle')
      return { exists: !!b, pressed: b && b.getAttribute('aria-pressed'), text: b && b.textContent.trim() }
    })()`)
    check('D: 开关存在且默认开启', toggleState.exists && toggleState.pressed === 'true', toggleState.text)

    await page.evaluate("document.getElementById('suggest-source-toggle').click()")
    await sleep(250)
    const afterClick = await page.evaluate(`(() => {
      const b = document.getElementById('suggest-source-toggle')
      return {
        pressed: b && b.getAttribute('aria-pressed'),
        text: b && b.textContent.trim(),
        stored: (() => { try { return localStorage.getItem('ss.remote') } catch (e) { return 'ERR' } })(),
        enabled: window.SimpleSearch && SimpleSearch.remote ? SimpleSearch.remote.enabled() : null,
      }
    })()`)
    check(
      'D: 点击后关闭并写入存储',
      afterClick.pressed === 'false' && afterClick.stored === 'off' && afterClick.text === '联网联想',
      `pressed=${afterClick.pressed} stored=${afterClick.stored} enabled=${afterClick.enabled} text=${afterClick.text}`
    )
    await page.evaluate("SimpleSearch.app.closeSettings()")
    await sleep(200)

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
        const buttons = [...document.querySelectorAll('#buttons-container .button')]
        const btn = Math.min(...buttons.map((b) => b.getBoundingClientRect().height))
        const appbar = document.querySelector('.appbar').getBoundingClientRect()
        const navToggle = document.getElementById('nav-toggle')
        const navToggleBox = navToggle.getBoundingClientRect()
        const card = document.querySelector('.card-search').getBoundingClientRect()
        return {
          inputW: input.width,
          sameRow: Math.abs(input.top - submit.top) < 8,
          btnH: btn,
          appbarH: appbar.height,
          appbarTop: appbar.top,
          navToggleVisible: getComputedStyle(navToggle).display !== 'none' && navToggleBox.width > 0,
          cardLeft: card.left,
          vh: window.innerHeight,
        }
      })()`)
      check(`F: ${spec.name} 输入框宽度充足`, layout.inputW >= 200, `${Math.round(layout.inputW)}px`)
      check(`F: ${spec.name} 输入框与搜索按钮同一行`, layout.sameRow)
      check(`F: ${spec.name} 按钮触控高度 ≥ 40px`, layout.btnH >= 40, `${layout.btnH}px`)
      check(`F: ${spec.name} 顶栏在顶部`, layout.appbarTop === 0 && layout.appbarH >= 48 && layout.appbarH <= 64, `${layout.appbarH}px`)
      check(`F: ${spec.name} 窄屏显示汉堡`, layout.navToggleVisible)
      check(`F: ${spec.name} 内容区左右对称（侧栏已收起）`, layout.cardLeft > 0 && layout.cardLeft < 40, `${Math.round(layout.cardLeft)}px`)

      // 抽屉：汉堡打开 → 遮罩 + 导航可见 → 点分类后自动收起
      await page.evaluate("document.getElementById('nav-toggle').click()")
      await sleep(400)
      const drawer = await page.evaluate(`(() => {
        const nav = document.getElementById('site-nav').getBoundingClientRect()
        const scrim = document.getElementById('scrim')
        return {
          navLeft: nav.left,
          navVisible: nav.left >= 0 && nav.width > 100,
          scrimHidden: scrim.hidden,
          expanded: document.getElementById('nav-toggle').getAttribute('aria-expanded'),
        }
      })()`)
      check(`F: ${spec.name} 汉堡打开分类抽屉`, drawer.navVisible && !drawer.scrimHidden && drawer.expanded === 'true', JSON.stringify(drawer))
      await page.evaluate(`document.querySelector('#group-chips [data-group="tech"]').click()`)
      await sleep(400)
      const afterPick = await page.evaluate(`(() => ({
        navOpen: document.body.classList.contains('nav-open'),
        scrimHidden: document.getElementById('scrim').hidden,
        visible: [...document.querySelectorAll('#buttons-container [data-site]')].filter((b) => !b.hidden).length,
      }))()`)
      check(
        `F: ${spec.name} 选分类后抽屉收起且只剩该组`,
        afterPick.navOpen === false && afterPick.scrimHidden === true && afterPick.visible > 0 && afterPick.visible < 11,
        JSON.stringify(afterPick)
      )
      if (SHOTS) {
        const shot = await page.screenshot(`index-${spec.name}-mobile.png`)
        console.log(`[e2e] 截图 ${path.relative(ROOT, shot)}`)
      }
    }
    // 320×568（iPhone SE 级别）：只查不溢出 + 抽屉与搜索区可用
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 568,
      deviceScaleFactor: 2,
      mobile: true,
    })
    await page.goto(`${PAGE}?theme=light`, 400)
    const small = await page.evaluate(`(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
      const input = document.getElementById('search-input').getBoundingClientRect()
      const buttons = [...document.querySelectorAll('#buttons-container .button')]
      const btnH = Math.min(...buttons.map((b) => b.getBoundingClientRect().height))
      const navToggle = document.getElementById('nav-toggle')
      return {
        overflow,
        inputW: input.width,
        btnH,
        navToggleVisible: getComputedStyle(navToggle).display !== 'none',
      }
    })()`)
    check('F: 320 无横向溢出', small.overflow <= 1, `溢出 ${small.overflow}px`)
    check('F: 320 输入框可用', small.inputW >= 150, `${Math.round(small.inputW)}px`)
    check('F: 320 按钮触控高度 ≥ 40px', small.btnH >= 40, `${small.btnH}px`)
    check('F: 320 显示汉堡', small.navToggleVisible)

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
