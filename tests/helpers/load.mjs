// 测试辅助：按「经典脚本」方式在 Node 里加载 assets/js/*.js，并从 globalThis.SimpleSearch 取命名空间。
// 只用 Node 内置模块（node:test / node:assert / node:fs / node:path / node:vm），不引入任何第三方依赖。
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const JS_DIR = path.join(ROOT, 'assets', 'js')

export const ENTRY_FILES = ['SimpleSearch-Light.html', 'SimpleSearch-Dark.html']

// build.mjs 生成的产物顶部会带这段注释；没有它说明还没构建过（或被人手改）。
export const BUILD_MARKER = /<!--\s*由 scripts\/build\.mjs/

let loadSeq = 0

export function repoPath(...parts) {
  return path.join(ROOT, ...parts)
}

export function hasRepo(...parts) {
  return fs.existsSync(repoPath(...parts))
}

export function readRepo(...parts) {
  return fs.readFileSync(repoPath(...parts), 'utf8')
}

export function jsPath(name) {
  return path.join(JS_DIR, `${name}.js`)
}

/**
 * 依次加载给定的经典脚本（如 'sites', 'search'），返回 { ok, missing, SS }。
 * 每次加载前清空 globalThis.SimpleSearch 并用唯一 query 绕过 ESM 缓存，
 * 保证测试拿到的是当前磁盘上的实现，而不是上一次 import 的缓存。
 *
 * 文件缺失时不抛错：返回 ok:false 与 missing 列表，调用方用 skip 而不是整体崩。
 */
export async function loadClassic(...names) {
  const missing = names
    .filter((name) => !fs.existsSync(jsPath(name)))
    .map((name) => `assets/js/${name}.js`)

  if (missing.length > 0) {
    return { ok: false, missing, skipReason: `等待交付：${missing.join('、')}`, SS: null }
  }

  delete globalThis.SimpleSearch
  for (const name of names) {
    const url = `${pathToFileURL(jsPath(name)).href}?load=${++loadSeq}`
    await import(url)
  }

  const SS = globalThis.SimpleSearch
  if (!SS || typeof SS !== 'object') {
    return {
      ok: false,
      missing: names.map((name) => `assets/js/${name}.js`),
      skipReason: '加载后 globalThis.SimpleSearch 不存在',
      SS: null,
    }
  }
  return { ok: true, missing: [], SS }
}

/**
 * 根据 loadClassic() 的结果生成 test 函数：
 *   const testIt = makeTester(loaded)
 *   testIt('用例名', () => { ... })
 * 依赖缺失时全部用例显式 skip 并说明等谁交付。
 */
export function makeTester(loaded) {
  if (loaded.ok) return test
  const reason = loaded.skipReason || '依赖尚未交付'
  return (name, fn) => test(name, { skip: reason }, fn)
}

/** 去掉 HTML 注释，便于对「真实标记」做检查而不是对着注释里的示例误判。 */
export function stripHtmlComments(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, '')
}

/** 简单的 HTML 实体解码，用于比较按钮文字与注册表 label。 */
export function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
