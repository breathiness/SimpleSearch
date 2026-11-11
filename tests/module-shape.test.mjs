// 模块形态 / file:// 可用性红线守卫。
// 契约依据：docs/contract.md §1.2、§2、§6（经典脚本、IIFE + globalThis、无内联事件、无外部资源）。
//
// 为什么用 vm.Script 而不只做正则：vm.Script 以「经典脚本」语法解析，
// 文件里只要出现 import/export 语句就会直接 SyntaxError —— 这正是 file:// 双击打开时
// 浏览器会遇到的失败，等于用 Node 复现了真实的红线。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {
  JS_DIR,
  ENTRY_FILES,
  BUILD_MARKER,
  hasRepo,
  readRepo,
  stripHtmlComments,
} from './helpers/load.mjs'

const jsFiles = fs.existsSync(JS_DIR)
  ? fs.readdirSync(JS_DIR).filter((file) => file.endsWith('.js')).sort()
  : []

// 去掉 JS 注释，避免「注释里提到 import/export」被误判（契约文档、代码注释都会提到）。
function stripJsComments(source) {
  let out = ''
  let i = 0
  let quote = null
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (quote) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

// 取所有会触发「子资源加载」的标签（a 的 href / form 的 action 是跳转，不算资源）。
const RESOURCE_TAG_RE = /<(link|script|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi
const URL_ATTR_RE = /\b(?:src|href|data|poster)\s*=\s*(["'])([^"']*)\1/gi

function findExternalResources(html) {
  const clean = stripHtmlComments(html)
  const problems = []
  for (const tagMatch of clean.matchAll(RESOURCE_TAG_RE)) {
    const tag = tagMatch[0]
    for (const attrMatch of tag.matchAll(URL_ATTR_RE)) {
      const url = attrMatch[2].trim()
      if (!url) continue
      if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) continue
      if (/^(https?:)?\/\//i.test(url)) {
        problems.push(`${tagMatch[1]} 引用了外部资源：${url}`)
      }
    }
  }
  // <style> 块里的 @import / url(http...) 也算外部资源
  const styleBlocks = clean.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []
  for (const block of styleBlocks) {
    if (/@import/i.test(block) || /url\(\s*["']?(https?:)?\/\//i.test(block)) {
      problems.push('内联 <style> 中存在外部资源引用（@import / url(http...)）')
    }
  }
  return problems
}

test('assets/js 目录存在，且每个文件都是经典脚本（IIFE + globalThis）', () => {
  assert.ok(fs.existsSync(JS_DIR), '缺少 assets/js 目录')
  assert.ok(jsFiles.length > 0, 'assets/js 下没有任何 .js 文件')
})

for (const file of jsFiles) {
  const source = fs.readFileSync(`${JS_DIR}/${file}`, 'utf8')

  test(`${file}：可按经典脚本解析（出现 import/export 会直接 SyntaxError）`, () => {
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: file }),
      `${file} 含 ESM 语法，file:// 双击打开会失败`,
    )
  })

  test(`${file}：不含 import / export / 动态 import() 语句`, () => {
    const code = stripJsComments(source)
    const patterns = [
      [/(^|[;{}()\s])import\s*\(/, '动态 import()'],
      [/(^|[;{}\s])import\s+[\w{*]/, 'import 语句'],
      [/\bexport\s+(default|const|let|var|function|class|\{|\*)/, 'export 语句'],
    ]
    for (const [pattern, label] of patterns) {
      assert.ok(!pattern.test(code), `${file} 中出现 ${label}（禁止，破坏 file:// 可用性）`)
    }
  })

  test(`${file}：使用 IIFE + globalThis 命名空间模式`, () => {
    assert.match(source, /\(\s*function\s*\(\s*[A-Za-z_$][\w$]*\s*\)/, `${file} 不是 IIFE 形态`)
    assert.match(source, /globalThis/, `${file} 未使用 globalThis 作为 root fallback`)
    assert.match(source, /['"]use strict['"]/, `${file} 缺少 'use strict'`)
  })
}

for (const entry of ENTRY_FILES) {
  const present = hasRepo(entry)
  const html = present ? readRepo(entry) : ''
  const built = present && BUILD_MARKER.test(html)

  test(`${entry}：无 type="module"（file:// 可用性红线）`, { skip: built ? false : '入口 HTML 尚未由 build.mjs 生成（等 lead 构建）' }, () => {
    const clean = stripHtmlComments(html)
    assert.ok(!/type\s*=\s*["']module["']/i.test(clean), `${entry} 出现 type="module"`)
  })

  test(`${entry}：无内联 on* 事件属性`, { skip: built ? false : '入口 HTML 尚未由 build.mjs 生成（等 lead 构建）' }, () => {
    const clean = stripHtmlComments(html)
    const matches = clean.match(/\son[a-z]+\s*=\s*["']/gi) || []
    assert.equal(matches.length, 0, `${entry} 含内联事件属性：${matches.join(', ')}`)
  })

  test(`${entry}：不引用任何 http(s) 外部子资源`, { skip: built ? false : '入口 HTML 尚未由 build.mjs 生成（等 lead 构建）' }, () => {
    const problems = findExternalResources(html)
    assert.deepEqual(problems, [], `${entry} 引用了外部资源：\n${problems.join('\n')}`)
  })
}
