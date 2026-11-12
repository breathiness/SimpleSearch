// 由 scripts/build.mjs 从 templates/sw.js 生成，请勿手改。
// Service Worker：预缓存首页静态资源，断网也能打开；跨域请求（百度联想等）不拦截。
const VERSION = '2.9.0'
const CACHE = 'simplesearch-' + VERSION
const PRECACHE = [
  "index.html",
  "manifest.webmanifest",
  "assets/css/base.css",
  "assets/css/input.css",
  "assets/css/tokens.css",
  "assets/js/app.js",
  "assets/js/history.js",
  "assets/js/input.js",
  "assets/js/remote.js",
  "assets/js/search.js",
  "assets/js/sites-admin.js",
  "assets/js/sites-store.js",
  "assets/js/sites.js",
  "assets/js/suggest.js",
  "assets/js/theme.js",
  "assets/img/favicon.svg",
  "assets/img/icon-192.png",
  "assets/img/icon-512.png"
]

// 安装：预缓存全部静态资源；失败（例如离线安装）不阻塞注册
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

// 激活：清掉旧版本缓存，立即接管页面
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch (error) {
    return
  }
  // 只处理同源请求；跨域（百度联想、站点跳转）直接放行，不缓存
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // 导航请求忽略查询串（?theme=、?cat= 等都回退到同一个首页缓存）
      const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' })
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response && response.ok && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => undefined)
        }
        return response
      } catch (error) {
        // 离线兜底：导航请求返回缓存的首页
        if (request.mode === 'navigate') {
          const fallback = (await cache.match('index.html')) || (await cache.match('./index.html'))
          if (fallback) return fallback
        }
        throw error
      }
    })
  )
})
