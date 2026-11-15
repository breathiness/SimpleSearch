// 把 docs/wiki/*.md 发布到 GitHub Wiki。
//
//   node scripts/publish-wiki.mjs            # 克隆 wiki 仓库 → 复制页面 → 提交 → 推送
//   node scripts/publish-wiki.mjs --dry-run  # 只打印将写入的文件，不动 wiki 仓库
//
// 前置条件：Wiki 必须已经在网页上初始化过（GitHub 没有 wiki API，第一次要在
// https://github.com/<owner>/<repo>/wiki 点「Create the first page」，之后
// https://github.com/<owner>/<repo>.wiki.git 才存在）。
//
// 页面源文件放在 docs/wiki/：文件名就是页面标题（Home → 首页，_Sidebar / _Footer
// 是特殊页）。仓库里保留源文件，方便 review 和 diff；wiki 只是发布目标。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const WIKI_SRC = path.join(ROOT, 'docs', 'wiki')
const DRY_RUN = process.argv.includes('--dry-run')

function readRepoSlug() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url
  const match = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(repo || '')
  if (!match) throw new Error('package.json 里没有可识别的 GitHub repository')
  return { owner: match[1], name: match[2], wikiUrl: `https://github.com/${match[1]}/${match[2]}.wiki.git` }
}

function run(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim()
}

function main() {
  const { wikiUrl, owner, name } = readRepoSlug()
  const pages = fs
    .readdirSync(WIKI_SRC)
    .filter((file) => file.endsWith('.md'))
    .sort()

  if (pages.length === 0) throw new Error(`docs/wiki 里没有 .md 文件：${WIKI_SRC}`)
  console.log(`[wiki] 待发布 ${pages.length} 个页面 → ${owner}/${name}`)
  for (const page of pages) console.log(`  - ${page}`)

  if (DRY_RUN) {
    console.log('[wiki] --dry-run：不克隆、不推送')
    return
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-wiki-'))
  try {
    try {
      run(work, ['clone', '--depth=1', wikiUrl, '.'])
    } catch (error) {
      throw new Error(
        `wiki 仓库还不存在（${wikiUrl}）。请先在 https://github.com/${owner}/${name}/wiki 点「Create the first page」初始化，再重跑本脚本。`
      )
    }

    for (const page of pages) {
      fs.copyFileSync(path.join(WIKI_SRC, page), path.join(work, page))
    }
    // 删除源里已经不存在的页面（wiki 自己维护的页面不受影响，只清理曾经发布过的）
    const known = new Set(pages)
    for (const file of fs.readdirSync(work)) {
      if (!file.endsWith('.md')) continue
      if (known.has(file)) continue
      console.log(`[wiki] 删除旧页面 ${file}`)
      fs.rmSync(path.join(work, file))
    }

    run(work, ['add', '-A'])
    const status = run(work, ['status', '--porcelain'])
    if (!status) {
      console.log('[wiki] 没有变化，跳过提交')
      return
    }
    run(work, ['-c', 'user.name=SimpleSearch Bot', '-c', 'user.email=bot@users.noreply.github.com', 'commit', '-m', 'wiki: 同步 docs/wiki'])
    run(work, ['push', 'origin', 'HEAD'])
    console.log('[wiki] 已推送')
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  console.error('[wiki] 失败：', error && error.message ? error.message : error)
  process.exit(1)
}
