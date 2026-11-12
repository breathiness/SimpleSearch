// v2.9 自定义站点 / 配置导入导出 / 常用排序 —— UI 层（契约 §20.2）。
// 只做 DOM 绑定与渲染；数据读写全部走 SS.sitesStore（注入 localStorage）。
// 所有用户数据一律用 textContent 渲染，禁止 HTML 字符串拼接。
// 经典脚本：只注册 SS.sitesAdmin，由 app.js 在 DOM 就绪后调用 init()。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  let initialized = false

  function init() {
    if (initialized) return
    const doc = root.document
    if (!doc) return
    const store = SS.sitesStore
    if (!store) return

    const byId = (id) => doc.getElementById(id)

    const dialog = byId('sites-dialog')
    const sitesList = byId('sites-list')
    const sitesEmpty = byId('sites-empty')
    const sitesStatus = byId('sites-status')
    const sitesClose = byId('sites-close')
    const openSitesButton = byId('custom-sites-open')
    const addButton = byId('site-add')
    const exportButton = byId('config-export')
    const importOpenButton = byId('config-import-open')
    const importFile = byId('config-import-file')

    const orderDialog = byId('order-dialog')
    const orderList = byId('order-list')
    const orderClose = byId('order-close')
    const openOrderButton = byId('order-open')

    const form = byId('site-form')
    const formTitle = byId('site-form-title')
    const formError = byId('site-form-error')
    const fieldLabel = byId('site-label')
    const fieldHome = byId('site-home')
    const fieldSearch = byId('site-search')
    const fieldGroup = byId('site-group')
    const fieldKeywords = byId('site-keywords')
    const fieldFeatured = byId('site-featured')
    const formCancel = byId('site-cancel')

    if (!dialog && !orderDialog) return

    let editingId = null
    let orderIds = []

    // ------------------------------------------------------------ 基础工具

    function safeStorage() {
      try {
        return root.localStorage || null
      } catch (error) {
        return null
      }
    }

    function listCustom() {
      try {
        return store.listCustom(safeStorage())
      } catch (error) {
        return []
      }
    }

    function refreshButtons() {
      if (SS.app && typeof SS.app.refreshSiteButtons === 'function') {
        try {
          SS.app.refreshSiteButtons()
        } catch (error) {
          /* 重建失败不影响当前操作 */
        }
      }
    }

    function setStatus(message) {
      if (sitesStatus) sitesStatus.textContent = message || ''
    }

    function setFormError(message) {
      if (!formError) return
      formError.textContent = message || ''
      formError.hidden = !message
    }

    function groupLabel(groupId) {
      const groups = Array.isArray(SS.siteGroups) ? SS.siteGroups : []
      for (const group of groups) {
        if (group && group.id === groupId) {
          return typeof group.label === 'string' && group.label !== '' ? group.label : groupId
        }
      }
      return groupId || ''
    }

    function createElement(tag, className, text) {
      const element = doc.createElement(tag)
      if (className) element.className = className
      if (text !== undefined) element.textContent = text
      return element
    }

    function createRowAction(attribute, value, className, accessibleLabel, text) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = className
      button.setAttribute(attribute, value)
      button.setAttribute('aria-label', accessibleLabel)
      button.textContent = text
      return button
    }

    // 打开/关闭优先交给 app.js（它统一管理 scrim / 焦点 / Esc / Tab 循环）；
    // 旧装配环境缺失 API 时做最小兜底。
    function syncScrimFallback() {
      const scrim = byId('scrim')
      if (!scrim) return
      const overlays = [dialog, orderDialog, byId('shortcuts-dialog'), byId('settings-panel')]
      let open = doc.body.classList.contains('nav-open')
      for (const element of overlays) {
        if (element && !element.hidden) open = true
      }
      scrim.hidden = !open
    }

    function openSites(trigger) {
      hideForm()
      setStatus('')
      if (SS.app && typeof SS.app.openSitesDialog === 'function') {
        SS.app.openSitesDialog(trigger || null)
      } else if (dialog) {
        dialog.hidden = false
        syncScrimFallback()
        if (sitesClose && typeof sitesClose.focus === 'function') sitesClose.focus()
      }
      renderSitesList()
    }

    function closeSites() {
      hideForm()
      if (SS.app && typeof SS.app.closeSitesDialog === 'function') {
        SS.app.closeSitesDialog()
      } else if (dialog) {
        dialog.hidden = true
        syncScrimFallback()
      }
    }

    function openOrder(trigger) {
      if (SS.app && typeof SS.app.openOrderDialog === 'function') {
        SS.app.openOrderDialog(trigger || null)
      } else if (orderDialog) {
        orderDialog.hidden = false
        syncScrimFallback()
        if (orderClose && typeof orderClose.focus === 'function') orderClose.focus()
      }
      renderOrderList()
    }

    function closeOrder() {
      if (SS.app && typeof SS.app.closeOrderDialog === 'function') {
        SS.app.closeOrderDialog()
      } else if (orderDialog) {
        orderDialog.hidden = true
        syncScrimFallback()
      }
    }

    // ------------------------------------------------------------ 自定义站点列表

    function renderSitesList() {
      if (!sitesList) return
      const customSites = listCustom()
      sitesList.textContent = ''
      for (const site of customSites) {
        const row = doc.createElement('li')
        row.setAttribute('data-site-id', site.id)
        row.appendChild(createElement('span', 'site-label', site.label))
        row.appendChild(createElement('span', 'site-group', groupLabel(site.group)))
        row.appendChild(createRowAction('data-action', 'edit', 'row-action', '编辑 ' + site.label, '编辑'))
        row.appendChild(createRowAction('data-action', 'delete', 'row-action', '删除 ' + site.label, '删除'))
        sitesList.appendChild(row)
      }
      if (sitesEmpty) sitesEmpty.hidden = customSites.length > 0
    }

    function findCustomSite(id) {
      const customSites = listCustom()
      for (const site of customSites) {
        if (site.id === id) return site
      }
      return null
    }

    // ------------------------------------------------------------ 新增 / 编辑表单

    function fillGroupOptions() {
      if (!fieldGroup) return
      fieldGroup.textContent = ''
      const groups = Array.isArray(SS.siteGroups) ? SS.siteGroups : []
      for (const group of groups) {
        if (!group || typeof group.id !== 'string' || group.id === '') continue
        const option = doc.createElement('option')
        option.value = group.id
        option.textContent = typeof group.label === 'string' ? group.label : group.id
        fieldGroup.appendChild(option)
      }
      if (groups.length > 0) fieldGroup.value = groups[0].id
    }

    function showForm(site) {
      if (!form) return
      editingId = site && typeof site.id === 'string' && site.id !== '' ? site.id : null
      if (formTitle) formTitle.textContent = editingId ? '编辑站点' : '新增站点'
      try {
        form.reset()
      } catch (error) {
        /* 老浏览器忽略 */
      }
      fillGroupOptions()
      if (site) {
        if (fieldLabel) fieldLabel.value = site.label || ''
        if (fieldHome) fieldHome.value = site.home || ''
        if (fieldSearch) fieldSearch.value = site.search || ''
        if (fieldGroup && site.group) fieldGroup.value = site.group
        if (fieldKeywords) {
          fieldKeywords.value = Array.isArray(site.keywords) ? site.keywords.join(' ') : ''
        }
        if (fieldFeatured) fieldFeatured.checked = site.featured === true
      }
      setFormError('')
      form.hidden = false
      if (fieldLabel && typeof fieldLabel.focus === 'function') fieldLabel.focus()
    }

    function hideForm() {
      editingId = null
      if (form) form.hidden = true
      setFormError('')
    }

    function readForm() {
      return {
        label: fieldLabel ? fieldLabel.value : '',
        home: fieldHome ? fieldHome.value : '',
        search: fieldSearch ? fieldSearch.value : '',
        group: fieldGroup ? fieldGroup.value : '',
        keywords: fieldKeywords ? fieldKeywords.value : '',
        featured: Boolean(fieldFeatured && fieldFeatured.checked),
      }
    }

    function handleSubmit(event) {
      if (event) event.preventDefault()
      const storage = safeStorage()
      const result = editingId
        ? store.updateCustom(storage, editingId, readForm())
        : store.addCustom(storage, readForm())
      if (!result.ok) {
        setFormError(result.error || '保存失败')
        setStatus('保存失败：' + (result.error || '未知错误'))
        return
      }
      hideForm()
      renderSitesList()
      refreshButtons()
      setStatus('已保存：' + result.site.label)
    }

    function deleteSite(site) {
      let confirmed = false
      try {
        confirmed = Boolean(root.confirm('确定删除「' + site.label + '」吗？此操作不可撤销。'))
      } catch (error) {
        confirmed = false
      }
      if (!confirmed) return
      const removed = store.removeCustom(safeStorage(), site.id)
      if (!removed) {
        setStatus('删除失败：本地存储不可用或站点不存在')
        return
      }
      if (editingId === site.id) hideForm()
      renderSitesList()
      refreshButtons()
      setStatus('已删除：' + site.label)
    }

    // ------------------------------------------------------------ 导入 / 导出

    function collectSettings() {
      const settings = {}
      const storage = safeStorage()
      if (!storage) return settings
      const read = (key) => {
        try {
          return storage.getItem(key)
        } catch (error) {
          return null
        }
      }
      const theme = read('ss.theme')
      if (theme === 'light' || theme === 'dark') settings.theme = theme
      const color = read('ss.color')
      if (typeof color === 'string' && color !== '') settings.color = color
      const engine = read('ss.engine')
      if (typeof engine === 'string' && engine !== '') settings.engine = engine
      const remote = read('ss.remote')
      if (remote === 'on' || remote === 'off') settings.remote = remote
      return settings
    }

    function handleExport() {
      try {
        const config = store.exportConfig(safeStorage(), collectSettings())
        const text = store.serializeConfig(config)
        const blob = new root.Blob([text], { type: 'application/json;charset=utf-8' })
        const url = root.URL.createObjectURL(blob)
        const anchor = doc.createElement('a')
        anchor.href = url
        anchor.download = 'simplesearch-config.json'
        anchor.rel = 'noopener'
        doc.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        root.setTimeout(() => {
          try {
            root.URL.revokeObjectURL(url)
          } catch (error) {
            /* 忽略 */
          }
        }, 1000)
        setStatus('已导出配置（含 ' + config.customSites.length + ' 个自定义站点）')
      } catch (error) {
        setStatus('导出失败：' + (error && error.message ? error.message : '未知错误'))
      }
    }

    function applyImportedSettings(settings) {
      if (!settings || typeof settings !== 'object') return
      const storage = safeStorage()
      const write = (key, value) => {
        if (!storage) return
        try {
          storage.setItem(key, String(value))
        } catch (error) {
          /* 忽略 */
        }
      }
      if (settings.remote === 'on' || settings.remote === 'off') write('ss.remote', settings.remote)
      if (typeof settings.color === 'string' && settings.color !== '') {
        write('ss.color', settings.color)
        if (SS.theme && typeof SS.theme.applyColor === 'function') {
          try {
            SS.theme.applyColor(settings.color)
          } catch (error) {
            /* 忽略 */
          }
        }
      }
      if (settings.theme === 'light' || settings.theme === 'dark' || settings.theme === 'auto') {
        if (SS.theme && typeof SS.theme.setMode === 'function') {
          try {
            SS.theme.setMode(settings.theme)
          } catch (error) {
            write('ss.theme', settings.theme)
          }
        } else {
          write('ss.theme', settings.theme)
        }
      }
      if (typeof settings.engine === 'string' && SS.engines && SS.engines[settings.engine]) {
        if (SS.app && typeof SS.app.applyEngine === 'function') {
          try {
            SS.app.applyEngine(settings.engine)
          } catch (error) {
            write('ss.engine', settings.engine)
          }
        } else {
          write('ss.engine', settings.engine)
        }
      }
    }

    function applyImport(parsed) {
      const data = parsed.data
      const current = listCustom()
      const merged = new Map()
      for (const site of current) merged.set(site.id, site)
      for (const site of data.customSites) merged.set(site.id, site)
      if (!store.saveCustom(safeStorage(), Array.from(merged.values()))) {
        setStatus('导入失败：本地存储不可用')
        return
      }
      store.saveOrder(safeStorage(), data.order)
      applyImportedSettings(data.settings)
      refreshButtons()
      renderSitesList()
      renderOrderList()
      setStatus('已导入 ' + data.customSites.length + ' 个自定义站点')
    }

    function readFileText(file) {
      if (file && typeof file.text === 'function') return file.text()
      return new Promise((resolve, reject) => {
        const reader = new root.FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('无法读取文件'))
        reader.readAsText(file)
      })
    }

    function handleImportFile() {
      const file = importFile && importFile.files && importFile.files[0] ? importFile.files[0] : null
      if (!file) return
      readFileText(file)
        .then((text) => {
          const parsed = store.parseImport(text)
          if (!parsed.ok) {
            setStatus('导入失败：' + (parsed.error || '配置文件不合法'))
            return
          }
          applyImport(parsed)
        })
        .catch((error) => {
          setStatus('导入失败：' + (error && error.message ? error.message : '无法读取文件'))
        })
        .then(() => {
          if (importFile) {
            try {
              importFile.value = ''
            } catch (error) {
              /* 忽略 */
            }
          }
        })
    }

    // ------------------------------------------------------------ 常用排序

    function featuredSites() {
      if (SS.app && typeof SS.app.getFeaturedSites === 'function') {
        try {
          const list = SS.app.getFeaturedSites()
          if (Array.isArray(list)) return list
        } catch (error) {
          /* 继续走兜底 */
        }
      }
      if (Array.isArray(SS.sites)) {
        const list = SS.sites.filter((site) => site && site.featured === true)
        if (list.length > 0) return list
      }
      const result = []
      const container = byId('buttons-container')
      if (!container) return result
      for (const button of container.querySelectorAll('[data-site]')) {
        if (button.getAttribute('data-featured') !== 'true') continue
        const id = button.getAttribute('data-site')
        const labelNode = button.querySelector('.button-label')
        result.push({ id, label: labelNode ? labelNode.textContent : id, featured: true })
      }
      return result
    }

    function renderOrderList() {
      if (!orderList) return
      const sites = featuredSites()
      orderIds = sites.map((site) => site.id)
      orderList.textContent = ''
      if (sites.length === 0) {
        orderList.appendChild(createElement('li', 'order-empty', '还没有「常用」站点'))
        return
      }
      for (const site of sites) {
        const row = doc.createElement('li')
        row.setAttribute('data-site-id', site.id)
        row.appendChild(createElement('span', 'site-label', site.label || site.id))
        row.appendChild(createRowAction('data-move', 'up', 'row-action', '上移 ' + (site.label || site.id), '↑'))
        row.appendChild(createRowAction('data-move', 'down', 'row-action', '下移 ' + (site.label || site.id), '↓'))
        row.appendChild(createRowAction('data-move', 'top', 'row-action', '置顶 ' + (site.label || site.id), '置顶'))
        orderList.appendChild(row)
      }
    }

    function moveSite(id, move) {
      const index = orderIds.indexOf(id)
      if (index === -1) return
      const next = orderIds.slice()
      if (move === 'top') {
        next.splice(index, 1)
        next.unshift(id)
      } else if (move === 'up' && index > 0) {
        next[index - 1] = orderIds[index]
        next[index] = orderIds[index - 1]
      } else if (move === 'down' && index < orderIds.length - 1) {
        next[index] = orderIds[index + 1]
        next[index + 1] = orderIds[index]
      } else {
        return
      }
      store.saveOrder(safeStorage(), next)
      orderIds = next
      refreshButtons()
      renderOrderList()
    }

    // ------------------------------------------------------------ 事件绑定

    if (openSitesButton) {
      openSitesButton.addEventListener('click', () => openSites(openSitesButton))
    }
    if (openOrderButton) {
      openOrderButton.addEventListener('click', () => openOrder(openOrderButton))
    }
    if (sitesClose) sitesClose.addEventListener('click', closeSites)
    if (orderClose) orderClose.addEventListener('click', closeOrder)

    if (addButton) addButton.addEventListener('click', () => showForm(null))
    if (formCancel) formCancel.addEventListener('click', hideForm)
    if (form) form.addEventListener('submit', handleSubmit)
    if (sitesList) {
      sitesList.addEventListener('click', (event) => {
        const target = event.target
        const actionButton = target && typeof target.closest === 'function'
          ? target.closest('[data-action]')
          : null
        if (!actionButton || !sitesList.contains(actionButton)) return
        const row = actionButton.closest('[data-site-id]')
        if (!row) return
        const site = findCustomSite(row.getAttribute('data-site-id'))
        if (!site) return
        if (actionButton.getAttribute('data-action') === 'edit') showForm(site)
        else if (actionButton.getAttribute('data-action') === 'delete') deleteSite(site)
      })
    }
    if (orderList) {
      orderList.addEventListener('click', (event) => {
        const target = event.target
        const moveButton = target && typeof target.closest === 'function'
          ? target.closest('[data-move]')
          : null
        if (!moveButton || !orderList.contains(moveButton)) return
        const row = moveButton.closest('[data-site-id]')
        if (!row) return
        moveSite(row.getAttribute('data-site-id'), moveButton.getAttribute('data-move'))
      })
    }
    if (exportButton) exportButton.addEventListener('click', handleExport)
    if (importOpenButton) {
      importOpenButton.addEventListener('click', () => {
        if (importFile) importFile.click()
      })
    }
    if (importFile) importFile.addEventListener('change', handleImportFile)

    // 对话框可能被 app.js 直接打开（SS.app.openSitesDialog()），用 MutationObserver 兜底渲染；
    // 同时兼容不支持 MutationObserver 的老浏览器：直接渲染一次。
    function watchDialog(element, render) {
      if (!element) return
      if (typeof root.MutationObserver !== 'function') {
        render()
        return
      }
      const observer = new root.MutationObserver(() => {
        if (!element.hidden) render()
      })
      observer.observe(element, { attributes: true, attributeFilter: ['hidden'] })
    }
    watchDialog(dialog, renderSitesList)
    watchDialog(orderDialog, renderOrderList)

    if (fieldGroup) fillGroupOptions()
    renderSitesList()
    renderOrderList()
    initialized = true
  }

  SS.sitesAdmin = { init }
})(typeof globalThis !== 'undefined' ? globalThis : this)
