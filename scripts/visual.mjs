// 零依赖视觉回归（本地按需，不进 CI）。
//
// 用法：
//   npm run visual          # 与 tests/visual/*.png 基线逐像素对比（有差异退出码 1）
//   npm run visual:update   # 重新生成基线（改 UI 后手动跑）
//
// 原理：启动 scripts/serve.mjs（随机端口）+ 本机 headless Edge/Chrome（CDP，Node 22 内置 WebSocket），
// 固定 4 个状态截图；PNG 解码/编码只用 node:zlib 自写实现，逐像素比较。
// 判定：单通道容差 8，差异像素比例 > 0.3% 为失败。
// 基线放 tests/visual/（提交入库）；新截图与 diff 图写 artifacts/visual/（gitignore）。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const UPDATE = process.argv.includes('--update')
const BASELINE_DIR = path.join(ROOT, 'tests', 'visual')
const OUT_DIR = path.join(ROOT, 'artifacts', 'visual')

// 随机端口：允许多个 visual/e2e 实例并行，不互相抢端口
const PORT = Number(process.env.VISUAL_PORT || 8100 + Math.floor(Math.random() * 800))
const CDP_PORT = Number(process.env.VISUAL_CDP_PORT || 9300 + Math.floor(Math.random() * 600))
const ORIGIN = `http://127.0.0.1:${PORT}`
const PAGE = `${ORIGIN}/index.html`

const TOLERANCE = 8 // 单通道容差
const MAX_DIFF_RATIO = 0.003 // 差异像素比例上限 0.3%
const VIEWPORT_DESKTOP = { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false }
const VIEWPORT_MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }

const STATES = [
  {
    name: 'common-light-1200',
    url: `${PAGE}?theme=light`,
    viewport: VIEWPORT_DESKTOP,
    openSettings: false,
  },
  {
    name: 'common-dark-1200',
    url: `${PAGE}?theme=dark`,
    viewport: VIEWPORT_DESKTOP,
    openSettings: false,
  },
  {
    name: 'mobile-light-390',
    url: `${PAGE}?theme=light`,
    viewport: VIEWPORT_MOBILE,
    openSettings: false,
  },
  {
    name: 'settings-open-1200',
    url: `${PAGE}?theme=light`,
    viewport: VIEWPORT_DESKTOP,
    openSettings: true,
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

async function fetchOk(url, method = 'GET') {
  const res = await fetch(url, { method })
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`)
  return res
}

async function waitFor(fn, { timeout = 15000, interval = 150, label = '条件' } = {}) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeout) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(interval)
  }
  throw new Error(`等待超时：${label}${lastError ? ` / ${lastError.message}` : ''}`)
}

// ---------------------------------------------------------------- 极简 CDP 客户端（Node 22 内置 WebSocket）

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
      this.ws.addEventListener(
        'error',
        (event) => reject(new Error(`WebSocket 连接失败: ${event.message || event.type}`)),
        { once: true },
      )
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
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params)
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
        this.listeners.set(method, arr.filter((item) => item !== fn))
        resolve(params)
      }
      this.on(method, fn)
    })
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* 忽略 */
    }
  }
}

// ---------------------------------------------------------------- 页面操作

function createPage(cdp) {
  async function evaluate(expression) {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (res.exceptionDetails) {
      const detail = res.exceptionDetails
      throw new Error(`页面执行异常：${detail.exception?.description || detail.text}`)
    }
    return res.result.value
  }

  // 固定渲染：关闭动画/过渡、隐藏瞬时 ripple、等字体就绪、回到顶部
  async function stabilize() {
    await evaluate(`(() => {
      const id = 'ss-visual-stabilize'
      if (!document.getElementById(id)) {
        const style = document.createElement('style')
        style.id = id
        style.textContent = [
          '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
          'html{scroll-behavior:auto!important}',
          '.ripple{display:none!important}',
          // 版本号随每次发版变化，不属于视觉回归要盯的内容：截图时隐藏，基线跨版本稳定
          '.panel-version{visibility:hidden!important}',
        ].join('\\n')
        document.head.appendChild(style)
      }
      window.scrollTo(0, 0)
      return true
    })()`)
    await evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true')
  }

  async function goto(url, settle = 250) {
    const loaded = cdp.once('Page.loadEventFired', 20000).catch(() => null)
    await cdp.send('Page.navigate', { url })
    await loaded
    try {
      await waitFor(
        async () => (await evaluate("document.documentElement.getAttribute('data-app-ready') === '1'")),
        { timeout: 8000, interval: 50, label: 'data-app-ready' },
      )
    } catch {
      // 非应用页（正常不会发生）继续
    }
    await stabilize()
    await sleep(settle)
  }

  async function setViewport({ width, height, deviceScaleFactor, mobile }) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile })
  }

  async function screenshot() {
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    })
    return Buffer.from(data, 'base64')
  }

  async function openSettings() {
    await evaluate("document.getElementById('settings-toggle').click()")
    await waitFor(
      async () => (await evaluate("document.getElementById('settings-panel').hidden === false")),
      { timeout: 5000, interval: 50, label: '设置面板打开' },
    )
    await evaluate(`(() => {
      const panel = document.getElementById('settings-panel')
      if (panel) panel.scrollTop = 0
      return true
    })()`)
    await sleep(250)
  }

  async function clearStorage() {
    await evaluate('(() => { try { localStorage.clear() } catch (e) {} return true })()')
  }

  return { evaluate, goto, setViewport, screenshot, openSettings, clearStorage }
}

// ---------------------------------------------------------------- PNG 解码（8-bit RGB/RGBA、filter 0-4、非交错）

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('不是合法 PNG 文件')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idatChunks = []

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart)
      height = buffer.readUInt32BE(dataStart + 4)
      bitDepth = buffer[dataStart + 8]
      colorType = buffer[dataStart + 9]
      interlace = buffer[dataStart + 12]
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd))
    } else if (type === 'IEND') {
      break
    }
    offset = dataEnd + 4 // 跳过 CRC
  }

  if (bitDepth !== 8) throw new Error(`仅支持 8-bit PNG，实际 bitDepth=${bitDepth}`)
  if (interlace !== 0) throw new Error('仅支持非交错 PNG')
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (!channels) throw new Error(`不支持的 PNG colorType=${colorType}`)

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks))
  const stride = width * channels
  const rgba = Buffer.alloc(width * height * 4)
  let previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1)
    const filter = inflated[rowStart]
    const line = inflated.subarray(rowStart + 1, rowStart + 1 + stride)
    const out = Buffer.alloc(stride)

    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? out[x - channels] : 0
      const b = previous[x]
      const c = x >= channels ? previous[x - channels] : 0
      const raw = line[x]
      let value
      switch (filter) {
        case 0:
          value = raw
          break
        case 1:
          value = (raw + a) & 0xff
          break
        case 2:
          value = (raw + b) & 0xff
          break
        case 3:
          value = (raw + ((a + b) >> 1)) & 0xff
          break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          value = (raw + predictor) & 0xff
          break
        }
        default:
          throw new Error(`不支持的 PNG filter=${filter}`)
      }
      out[x] = value
    }

    for (let x = 0; x < width; x += 1) {
      const si = x * channels
      const di = (y * width + x) * 4
      if (channels === 1) {
        rgba[di] = out[si]
        rgba[di + 1] = out[si]
        rgba[di + 2] = out[si]
        rgba[di + 3] = 255
      } else {
        rgba[di] = out[si]
        rgba[di + 1] = out[si + 1]
        rgba[di + 2] = out[si + 2]
        rgba[di + 3] = channels === 4 ? out[si + 3] : 255
      }
    }
    previous = out
  }

  return { width, height, rgba }
}

// ---------------------------------------------------------------- PNG 编码（RGBA + filter 0）

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng({ width, height, rgba }) {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba).copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------- 对比

function compareImages(baseline, current) {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      ok: false,
      reason: `尺寸不同：基线 ${baseline.width}x${baseline.height}，当前 ${current.width}x${current.height}`,
      diffPixels: null,
      totalPixels: null,
      ratio: null,
      diffImage: null,
    }
  }

  const { width, height } = baseline
  const totalPixels = width * height
  const diffRgba = Buffer.from(current.rgba)
  let diffPixels = 0

  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4
    const dr = Math.abs(baseline.rgba[offset] - current.rgba[offset])
    const dg = Math.abs(baseline.rgba[offset + 1] - current.rgba[offset + 1])
    const db = Math.abs(baseline.rgba[offset + 2] - current.rgba[offset + 2])
    if (dr > TOLERANCE || dg > TOLERANCE || db > TOLERANCE) {
      diffPixels += 1
      diffRgba[offset] = 255
      diffRgba[offset + 1] = 0
      diffRgba[offset + 2] = 0
      diffRgba[offset + 3] = 255
    }
  }

  const ratio = diffPixels / totalPixels
  return {
    ok: ratio <= MAX_DIFF_RATIO,
    reason: null,
    diffPixels,
    totalPixels,
    ratio,
    diffImage: { width, height, rgba: diffRgba },
  }
}

// ---------------------------------------------------------------- 截取全部状态

async function captureAll(page) {
  const shots = new Map()
  for (const state of STATES) {
    await page.setViewport(state.viewport)
    await page.clearStorage()
    await page.goto(state.url)
    if (state.openSettings) await page.openSettings()
    await sleep(150)
    shots.set(state.name, await page.screenshot())
  }
  return shots
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

// ---------------------------------------------------------------- 主流程

async function run() {
  const browserPath = findBrowser()
  if (!browserPath) {
    console.log('[visual] 未找到 Edge/Chrome，跳过视觉回归（退出码 0；CI 正常）')
    process.exit(0)
  }
  console.log(`[visual] 浏览器：${browserPath}`)
  console.log(`[visual] 模式：${UPDATE ? '更新基线 (--update)' : '对比基线'}`)

  if (!UPDATE && !fs.existsSync(BASELINE_DIR)) {
    console.log('[visual] 未找到视觉基线目录 tests/visual/，请先运行：npm run visual:update')
    process.exit(0)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-visual-'))
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
    { stdio: 'ignore' },
  )

  let cdp
  const cleanup = () => {
    try {
      cdp?.close()
    } catch {
      /* 忽略 */
    }
    try {
      browser.kill()
    } catch {
      /* 忽略 */
    }
    try {
      server.kill()
    } catch {
      /* 忽略 */
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* 忽略 */
    }
  }

  try {
    await waitFor(() => fetchOk(`${ORIGIN}/index.html`), { label: '静态服务器就绪' })
    const version = await waitFor(
      async () => (await fetchOk(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(),
      { label: 'CDP 就绪' },
    )
    console.log(`[visual] ${version.Browser}`)

    let target
    try {
      target = await fetchOk(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, 'PUT').then((res) => res.json())
    } catch {
      const list = await fetchOk(`http://127.0.0.1:${CDP_PORT}/json/list`).then((res) => res.json())
      target = list.find((item) => item.type === 'page')
    }
    if (!target || !target.webSocketDebuggerUrl) throw new Error('无法创建调试目标')

    cdp = await new CDP(target.webSocketDebuggerUrl).connect()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    // 固定系统偏好，避免宿主机深色模式影响（各状态仍用 ?theme= 显式指定）
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }],
    })

    const page = createPage(cdp)
    const shots = await captureAll(page)

    if (UPDATE) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true })
      for (const state of STATES) {
        const png = shots.get(state.name)
        const file = path.join(BASELINE_DIR, `${state.name}.png`)
        fs.writeFileSync(file, png)
        const meta = decodePng(png)
        console.log(`[visual] 写入基线 ${path.relative(ROOT, file)}（${formatBytes(png.length)}，${meta.width}x${meta.height}）`)
      }
      console.log(`[visual] 完成：${STATES.length} 张基线写入 tests/visual/`)
      return 0
    }

    // 对比模式：先看基线是否齐全
    const missing = STATES.filter((state) => !fs.existsSync(path.join(BASELINE_DIR, `${state.name}.png`)))
    if (missing.length > 0) {
      console.log(`[visual] 缺少基线：${missing.map((state) => state.name).join(', ')}`)
      console.log('[visual] 请先运行：npm run visual:update')
      return 0
    }

    let failed = 0
    for (const state of STATES) {
      const currentPng = shots.get(state.name)
      const baselineFile = path.join(BASELINE_DIR, `${state.name}.png`)
      const currentFile = path.join(OUT_DIR, `${state.name}.png`)
      fs.writeFileSync(currentFile, currentPng)

      const baseline = decodePng(fs.readFileSync(baselineFile))
      const current = decodePng(currentPng)
      const result = compareImages(baseline, current)

      if (result.ok) {
        console.log(
          `PASS  ${state.name}  尺寸 ${current.width}x${current.height}，差异 ${result.diffPixels ?? 0} px（${((result.ratio ?? 0) * 100).toFixed(3)}%）`,
        )
        continue
      }

      failed += 1
      const reason =
        result.reason ||
        `差异像素 ${result.diffPixels}/${result.totalPixels}（${(result.ratio * 100).toFixed(3)}% > ${(MAX_DIFF_RATIO * 100).toFixed(1)}%）`
      console.log(`FAIL  ${state.name}  ${reason}`)
      if (result.diffImage) {
        const diffFile = path.join(OUT_DIR, `${state.name}.diff.png`)
        fs.writeFileSync(diffFile, encodePng(result.diffImage))
        console.log(`      新截图：${path.relative(ROOT, currentFile)}`)
        console.log(`      差异图：${path.relative(ROOT, diffFile)}（差异像素标红）`)
      } else {
        console.log(`      新截图：${path.relative(ROOT, currentFile)}`)
      }
    }

    if (failed > 0) {
      console.log(`[visual] 结果：${STATES.length - failed} 通过，${failed} 失败（容差 ${TOLERANCE}/通道，阈值 ${(MAX_DIFF_RATIO * 100).toFixed(1)}%）`)
      return 1
    }
    console.log(`[visual] 结果：${STATES.length}/${STATES.length} 全部通过（容差 ${TOLERANCE}/通道，阈值 ${(MAX_DIFF_RATIO * 100).toFixed(1)}%）`)
    return 0
  } finally {
    cleanup()
  }
}

run()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error('[visual] 失败：', error && error.stack ? error.stack : error)
    process.exitCode = 1
  })
