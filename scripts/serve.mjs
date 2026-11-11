// 零依赖静态服务器，仅用于本地预览：node scripts/serve.mjs
// 线上用 GitHub Pages，不需要这个脚本。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const PORT = Number(process.env.PORT || 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.md': 'text/markdown; charset=utf-8',
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  const relative = urlPath === '/' ? '/index.html' : urlPath
  const target = path.join(ROOT, path.normalize(relative).replace(/^([/\\])+/, ''))

  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 Not Found')
      return
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(data)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve] http://127.0.0.1:${PORT}/`)
  console.log(`[serve] http://127.0.0.1:${PORT}/SimpleSearch-Light.html`)
  console.log(`[serve] http://127.0.0.1:${PORT}/SimpleSearch-Dark.html`)
})
