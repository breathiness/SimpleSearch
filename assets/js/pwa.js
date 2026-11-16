// v2.11 PWA 体验（契约 §22.2）：Service Worker 注册、安装引导、新版本提示。
// 经典脚本：只注册 SS.pwa，由 app.js 在 DOMContentLoaded 后调用 init()。
// 所有 DOM 元素都可能不存在（单文件版 / 旧产物）：全部守卫，不抛错。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  let initialized = false
  // 安装引导记住的事件（beforeinstallprompt）
  let deferredPrompt = null
  // 新版本提示是否已展示 / 已被用户关掉（模块内标记 + sessionStorage，二选一场景下两者都兼容）
  let updateShown = false
  let updateDismissed = false
  const DISMISS_KEY = 'ss.updateDismissed'

  function $(id) {
    const doc = root.document
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null
  }

  function safeSessionGet(key) {
    try {
      const storage = root.sessionStorage
      return storage ? storage.getItem(key) : null
    } catch (error) {
      return null
    }
  }

  function safeSessionSet(key, value) {
    try {
      const storage = root.sessionStorage
      if (storage) storage.setItem(key, value)
    } catch (error) {
      /* sessionStorage 不可用时仅模块内生效 */
    }
  }

  function hideInstallRow() {
    const row = $('install-row')
    if (row) row.hidden = true
  }

  function showInstallRow() {
    const row = $('install-row')
    if (row) row.hidden = false
  }

  // ------------------------------------------------------------ 安装引导

  function bindInstall() {
    if (typeof root.addEventListener !== 'function') return

    root.addEventListener('beforeinstallprompt', (event) => {
      // 阻止浏览器默认的迷你安装条，改由设置面板里的「安装到桌面」入口触发
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      deferredPrompt = event || null
      showInstallRow()
    })

    root.addEventListener('appinstalled', () => {
      deferredPrompt = null
      hideInstallRow()
    })

    const installButton = $('install-app')
    if (!installButton) return

    installButton.addEventListener('click', () => {
      const promptEvent = deferredPrompt
      deferredPrompt = null
      if (!promptEvent || typeof promptEvent.prompt !== 'function') {
        hideInstallRow()
        return
      }
      const hide = () => hideInstallRow()
      let result = null
      try {
        result = promptEvent.prompt()
      } catch (error) {
        hide()
        return
      }
      const finish = () => hide()
      if (result && typeof result.then === 'function') {
        result.then(finish, finish)
      } else if (promptEvent.userChoice && typeof promptEvent.userChoice.then === 'function') {
        promptEvent.userChoice.then(finish, finish)
      } else {
        hide()
      }
    })
  }

  // ------------------------------------------------------------ 新版本提示

  function showUpdateToast() {
    if (updateShown || updateDismissed) return
    if (safeSessionGet(DISMISS_KEY) === '1') {
      updateShown = true
      return
    }
    const toast = $('update-toast')
    if (!toast) return
    updateShown = true
    toast.hidden = false
  }

  function hideUpdateToast() {
    const toast = $('update-toast')
    if (toast) toast.hidden = true
  }

  function dismissUpdate() {
    updateDismissed = true
    hideUpdateToast()
    safeSessionSet(DISMISS_KEY, '1')
  }

  function bindUpdateToast() {
    const reloadButton = $('update-reload')
    if (reloadButton) {
      reloadButton.addEventListener('click', () => {
        try {
          root.location.reload()
        } catch (error) {
          /* 无法刷新时静默 */
        }
      })
    }
    const dismissButton = $('update-dismiss')
    if (dismissButton) dismissButton.addEventListener('click', dismissUpdate)
  }

  // ------------------------------------------------------------ Service Worker

  function registerServiceWorker() {
    // 单文件便携版没有 sw.js / manifest，不注册
    if (root.__SS_SINGLE_FILE) return
    // file:// 下不注册（双击打开场景不需要也不支持）
    const location = root.location
    if (!location || (location.protocol !== 'http:' && location.protocol !== 'https:')) return
    const nav = root.navigator
    const container = nav && nav.serviceWorker
    if (!container || typeof container.register !== 'function') return

    // 用初始 controller 是否为 null 区分「首次接管」与「新版本接管」：
    // 首次接管只是 SW 第一次生效，不应该弹「新版本已就绪」。
    // 注意：手动 dispatchEvent('controllerchange') 时 controller 仍为 null，
    // 这不算真实接管，按新版本提示处理（便于调试与 E2E）。
    let firstTakeoverPending = !container.controller

    try {
      container.addEventListener('controllerchange', () => {
        if (firstTakeoverPending) {
          firstTakeoverPending = false
          if (container.controller) return
        }
        showUpdateToast()
      })
    } catch (error) {
      /* 老浏览器忽略 */
    }

    try {
      const registration = container.register('sw.js')
      if (registration && typeof registration.catch === 'function') {
        registration.catch(() => undefined)
      }
    } catch (error) {
      /* 注册失败不影响页面功能 */
    }
  }

  function init() {
    if (initialized) return
    initialized = true
    updateDismissed = safeSessionGet(DISMISS_KEY) === '1'
    registerServiceWorker()
    bindInstall()
    bindUpdateToast()
  }

  SS.pwa = { init }
})(typeof globalThis !== 'undefined' ? globalThis : this)
