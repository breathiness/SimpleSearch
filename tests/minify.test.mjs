// v2.13 §24.1 安全压缩单测：minifyJs / minifyCss / minifyHtml 的边界、幂等、可解析与行为等价。
// 注意：单测始终读取/执行可读源码 assets/js/*.js；`.min.js` 只是构建产物，不参与 import。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { loadClassic, jsPath, hasRepo } from './helpers/load.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')

let minify = null
let loadError = null
try {
  minify = await import('../scripts/minify.mjs')
} catch (error) {
  loadError = error
}

const skipReason = loadError ? '等待交付 scripts/minify.mjs（' + loadError.message + '）' : null

function testM(name, fn) {
  test(name, skipReason ? { skip: skipReason } : {}, fn)
}

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, 'assets', 'js', file), 'utf8')
}

function listSourceJs() {
  return fs
    .readdirSync(path.join(ROOT, 'assets', 'js'))
    .filter((file) => file.endsWith('.js') && !file.endsWith('.min.js'))
    .sort()
}

function listSourceCss() {
  return fs
    .readdirSync(path.join(ROOT, 'assets', 'css'))
    .filter((file) => file.endsWith('.css') && !file.endsWith('.min.css'))
    .sort()
}

// ---------------------------------------------------------------- API

testM('minify.mjs 暴露三个纯函数：minifyJs / minifyCss / minifyHtml', () => {
  assert.equal(typeof minify.minifyJs, 'function')
  assert.equal(typeof minify.minifyCss, 'function')
  assert.equal(typeof minify.minifyHtml, 'function')
})

// ---------------------------------------------------------------- minifyJs 边界

testM('minifyJs：字符串/模板字面量里的 /*、//、https:// 不被破坏', () => {
  const input = [
    'const a = "/* not a comment */"',
    "const b = 'https://example.com/path'",
    "const c = 'a//b'",
    'const d = `tpl /* x */ // y ${a}`',
  ].join('\n')
  const output = minify.minifyJs(input)
  assert.ok(output.includes('"/* not a comment */"'), `字符串内容被破坏：\n${output}`)
  assert.ok(output.includes("'https://example.com/path'"), 'URL 字符串被破坏')
  assert.ok(output.includes("'a//b'"), '含 // 的字符串被破坏')
  assert.ok(output.includes('`tpl /* x */ // y ${a}`'), '模板字面量被破坏')
})

testM('minifyJs：保留行尾 // 注释，只删整行 // 注释', () => {
  const input = ['// full line comment', '  // indented full line', 'const a = 1 // keep me', 'const b = 2'].join('\n')
  const output = minify.minifyJs(input)
  assert.ok(!output.includes('full line comment'), `整行注释应被删除：\n${output}`)
  assert.ok(!output.includes('indented full line'))
  assert.ok(output.includes('const a = 1 // keep me'), `行尾注释应保留：\n${output}`)
})

testM('minifyJs：删除块注释（单行/行内/多行）', () => {
  const input = ['/* header */', 'const a = 1 /* inline */', '/* multi', ' * line', ' */', 'const b = 2'].join('\n')
  const output = minify.minifyJs(input)
  assert.ok(!output.includes('/*'), `块注释应被删除：\n${output}`)
  assert.ok(output.includes('const a = 1'), '删除行内块注释后代码应保留')
  assert.ok(output.includes('const b = 2'))
})

testM('minifyJs：压缩行首缩进/行尾空白/连续空行，末尾单个换行', () => {
  const input = '\n\n   const a = 1   \n\n\n\t\tconst b = 2\t\n\n'
  const output = minify.minifyJs(input)
  for (const line of output.split('\n')) {
    assert.equal(line, line.replace(/^[ \t]+|[ \t]+$/g, ''), `仍存在行首/行尾空白：${JSON.stringify(line)}`)
  }
  assert.ok(!output.includes('\n\n\n'), '连续空行应合并')
  assert.ok(output.endsWith('\n'), '输出应以单个换行结尾')
  assert.ok(output.includes('const a = 1'))
  assert.ok(output.includes('const b = 2'))
})

testM('minifyJs：CRLF 归一化为 LF', () => {
  const output = minify.minifyJs('const a = 1\r\nconst b = 2\r\n')
  assert.ok(!output.includes('\r'), '输出不应含 \\r')
})

testM('minifyJs：幂等（minify(minify(x)) === minify(x)）', () => {
  const samples = [
    '/* c */\n  const a = 1 // tail\n\n\nconst b = "x /* y */"\n',
    readSource('app.js'),
    readSource('sites.js'),
    readSource('i18n.js'),
  ]
  for (const sample of samples) {
    const once = minify.minifyJs(sample)
    const twice = minify.minifyJs(once)
    assert.equal(twice, once, '压缩应幂等')
  }
})

testM('minifyJs：跨行字符串/模板字面量按 fail-safe 抛错（不输出坏代码）', () => {
  assert.throws(() => minify.minifyJs('const s = "abc\ndef"'), /跨行/)
  assert.throws(() => minify.minifyJs('const t = `abc\ndef`'), /跨行/)
})

// ---------------------------------------------------------------- 真实 JS：可解析 + 幂等 + 体积

testM('assets/js/*.js：压缩后均可用 vm.Script 按经典脚本解析（无语法错误）', () => {
  const files = listSourceJs()
  assert.ok(files.length >= 13, `源码脚本应 ≥13 个，实际 ${files.length}`)
  for (const file of files) {
    const source = readSource(file)
    const output = minify.minifyJs(source)
    assert.doesNotThrow(() => new vm.Script(output, { filename: `${file}.min.js` }), `${file} 压缩后语法错误`)
    assert.ok(output.length <= source.length, `${file} 压缩后不应变大（${source.length} → ${output.length}）`)
    assert.equal(minify.minifyJs(output), output, `${file} 压缩应幂等`)
  }
})

testM('assets/css/*.css：压缩后可幂等、无块注释残留、体积不增', () => {
  const files = listSourceCss()
  assert.ok(files.length >= 3, `源码 CSS 应 ≥3 个，实际 ${files.length}`)
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, 'assets', 'css', file), 'utf8')
    const output = minify.minifyCss(source)
    assert.ok(!output.includes('/*'), `${file} 仍有块注释`)
    assert.ok(output.length <= source.length, `${file} 压缩后不应变大`)
    assert.equal(minify.minifyCss(output), output, `${file} 压缩应幂等`)
  }
})

// ---------------------------------------------------------------- sites.js 行为一致

testM('sites.js：压缩后执行，SS.sites 结构与原始一致（JSON 相等）', async () => {
  const original = await loadClassic('sites')
  assert.ok(original.ok, `原始 sites.js 加载失败：${original.skipReason || ''}`)
  const originalSites = original.SS.sites
  assert.ok(Array.isArray(originalSites) && originalSites.length > 0)

  const source = readSource('sites.js')
  const output = minify.minifyJs(source)
  const sandbox = { SimpleSearch: {} }
  vm.runInNewContext(output, sandbox, { filename: 'sites.js.min.js' })
  const minifiedSites = sandbox.SimpleSearch.sites
  assert.ok(Array.isArray(minifiedSites), '压缩后未注册 SS.sites')

  const normalize = (sites) => JSON.parse(JSON.stringify(sites))
  assert.deepEqual(normalize(minifiedSites), normalize(originalSites), '压缩前后站点数据不一致')
})

// ---------------------------------------------------------------- i18n.js 行为一致

function createI18nSandbox() {
  const store = new Map()
  const document = {
    documentElement: { setAttribute() {} },
    title: '',
    querySelectorAll() {
      return []
    },
  }
  return {
    SimpleSearch: {},
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    location: { search: '', href: 'https://example.com/index.html', pathname: '/index.html' },
    history: { replaceState() {} },
    navigator: { language: 'zh-CN' },
    document,
    URL,
  }
}

function runI18nModule(source) {
  const sandbox = createI18nSandbox()
  vm.runInNewContext(source, sandbox, { filename: 'i18n.js' })
  return sandbox.SimpleSearch.i18n
}

testM('i18n.js：压缩后 t() 取值/回退/占位行为与原文一致', () => {
  const source = readSource('i18n.js')
  const originalI18n = runI18nModule(source)
  const minifiedI18n = runI18nModule(minify.minifyJs(source))
  assert.ok(originalI18n, '原始 i18n.js 未注册 SS.i18n')
  assert.ok(minifiedI18n, '压缩后未注册 SS.i18n')

  // 中文：压缩版与原文完全一致（不硬编码词表文案，避免受运行环境影响）
  originalI18n.setLang('zh')
  minifiedI18n.setLang('zh')
  for (const key of ['nav.all', 'card.common', 'search.placeholder', 'hist.count']) {
    assert.equal(minifiedI18n.t(key, { n: 3 }), originalI18n.t(key, { n: 3 }), `中文 key ${key} 行为不一致`)
  }
  const zhValue = originalI18n.t('nav.all')
  assert.equal(typeof zhValue, 'string')
  assert.ok(zhValue.length > 0, 'nav.all 中文文案不应为空')
  assert.equal(minifiedI18n.t('no.such.key'), 'no.such.key', 'UNKNOWN key 应回退为 key 本身')
  assert.equal(originalI18n.t('no.such.key'), 'no.such.key')

  // 英文：压缩版与原文一致，且切换语言后文案确实变化
  originalI18n.setLang('en')
  minifiedI18n.setLang('en')
  for (const key of ['nav.all', 'hist.count']) {
    assert.equal(minifiedI18n.t(key, { n: 3 }), originalI18n.t(key, { n: 3 }), `英文 key ${key} 行为不一致`)
  }
  const enValue = originalI18n.t('nav.all')
  assert.equal(typeof enValue, 'string')
  assert.ok(enValue.length > 0, 'nav.all 英文文案不应为空')
  assert.notEqual(enValue, zhValue, '切换语言后 nav.all 文案应变化（验证 setLang 生效）')
  assert.equal(minifiedI18n.t('no.such.key'), 'no.such.key')
})

// ---------------------------------------------------------------- minifyCss / minifyHtml

testM('minifyCss：删注释、去缩进/行尾空白、合并空行、幂等', () => {
  const input = ['/* head */', '.a {', '  color: red; /* inline */', '}', '', '', '.b { margin: 0 }  '].join('\n')
  const output = minify.minifyCss(input)
  assert.ok(!output.includes('/*'), `CSS 注释应删除：\n${output}`)
  assert.ok(!output.includes('\n\n\n'))
  for (const line of output.split('\n')) assert.equal(line, line.replace(/^[ \t]+|[ \t]+$/g, ''))
  assert.ok(output.includes('.a {') && output.includes('.b { margin: 0 }'))
  assert.equal(minify.minifyCss(output), output, 'CSS 压缩应幂等')
})

testM('minifyHtml：删 HTML 注释、保留条件注释、保留 <script> 内容、幂等', () => {
  const input = [
    '<div>',
    '  <!-- remove me -->',
    '  <!--[if IE]>keep conditional<![endif]-->',
    '  <script>',
    '    // line comment inside script must stay',
    '    const a = 1',
    '  </script>',
    '</div>',
  ].join('\n')
  const output = minify.minifyHtml(input)
  assert.ok(!output.includes('remove me'), '普通 HTML 注释应删除')
  assert.ok(output.includes('<!--[if IE]>'), '条件注释应保留')
  assert.ok(output.includes('    // line comment inside script must stay'), 'script 内容应原样保留')
  assert.ok(output.includes('    const a = 1'))
  assert.equal(minify.minifyHtml(output), output, 'HTML 压缩应幂等')
})

testM('minifyHtml：对真实 index.html 幂等且不破坏标签计数', () => {
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const output = minify.minifyHtml(index)
  assert.equal(minify.minifyHtml(output), output, '真实页面压缩应幂等')
  const count = (text, re) => (text.match(re) || []).length
  assert.equal(count(output, /<script\b/gi), count(index, /<script\b/gi), '<script> 数量不应变化')
  assert.ok(count(output, /<use\b/gi) <= count(index, /<use\b/gi), '<use> 数量不应增加')
})
