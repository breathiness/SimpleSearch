# v2 重构接口契约（v1）

> 本文件由 lead 维护。**所有成员在动工前必读**；任何需要变更契约的地方，先发消息给 lead，由 lead 更新本文件，不要自行改动别人的文件或改契约。

## 1. 目标与硬约束

1. **纯静态**：GitHub Pages 直接托管，**零运行时依赖**，不引入 CDN、字体、框架。
2. **`file://` 双击可用**：直接双击 `SimpleSearch-Light.html` 打开必须完整可用（这是原项目的核心卖点：「本地版加载时间 3 毫秒」）。**因此 `assets/js/*.js` 一律使用经典脚本（classic script），禁止在 `assets/js/` 内出现 `import` / `export` 语句、禁止 `type="module"`。**
3. **保留原入口 URL**：`SimpleSearch-Light.html`、`SimpleSearch-Dark.html` 继续存在且可访问（README 里的在线地址不能 404）。
4. **单一数据源**：站点列表只写在 `assets/js/sites.js` 一处。v2.1 起只有一个真实页面 `index.html`，由 `scripts/build.mjs` 在**开发时**生成为静态 HTML 后提交入库；线上仍是无构建的静态文件。旧的 `SimpleSearch-Light.html` / `-Dark.html` 保留为 0 秒重定向壳。
5. **视觉风格克制**：延续原项目的极简风格（居中输入框 + 下方按钮墙），不改成卡片站导航或花哨动效。明暗两套配色都要好看、可读（正文对比度 ≥ 4.5:1）。
6. 不引入任何追踪、不请求任何非必要第三方资源。搜狗/必应联想等网络请求必须可选、可失败、失败即静默降级。

## 2. 模块模式（全员必须遵守）

经典脚本 + 单一全局命名空间，同时能被 Node 直接 `import()` 做测试与构建：

```js
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  // ... 你的实现，挂到 SS 下
  SS.search = { /* ... */ }
})(typeof globalThis !== 'undefined' ? globalThis : this)
```

- 浏览器里 `root === window`；Node 里 `root === globalThis`。
- 每个 `assets/js/*.js` 只负责注册自己的命名空间，**禁止在文件顶层直接操作 DOM**（必须由 `app.js` 在 DOMContentLoaded 后调用你的 `init`）。
- 文件名与命名空间一一对应：`sites.js → SS.sites`、`search.js → SS.search`、`suggest.js → SS.suggest`、`history.js → SS.history`、`theme.js → SS.theme`、`input.js → SS.input`。
- 纯逻辑必须可测：不读 DOM、不读真实 `localStorage`（由调用方注入）。
- 代码风格：2 空格缩进，单引号，语句不加分号（与原项目一致），`const`/`let`，注释用中文。

## 3. 文件所有权（写入范围，越界即冲突）

| 归属 | 文件 |
|---|---|
| **lead** | `templates/`、`scripts/build.mjs`、`scripts/serve.mjs`、`index.html`、`SimpleSearch-Light.html`、`SimpleSearch-Dark.html`、`package.json`、`docs/contract.md`、`assets/js/app.js`、`.gitignore` |
| **core-engine** | `assets/js/sites.js`、`assets/js/search.js` |
| **theme-ui** | `assets/css/tokens.css`、`assets/css/base.css`、`assets/js/theme.js` |
| **input-ux** | `assets/js/suggest.js`、`assets/js/history.js`、`assets/js/input.js`、`assets/css/input.css` |
| **qa-test** | `tests/`（全部）、`scripts/validate.mjs` |
| **docs-release** | `README.md`、`CONTRIBUTING.md`、`docs/` 下除 `contract.md` 外的一切、`.github/`、`.nojekyll`、`assets/img/` |

- 两个入口 HTML 与 `templates/` **只允许 lead 改**。需要新增 DOM 挂载点/属性，发消息给 lead。
- `package.json` 的 scripts 已按本契约预置好，qa-test / docs-release 直接用，不要改 `package.json`。

## 4. 数据结构

### 4.1 站点注册表 `SS.sites`

```js
SS.sites = [
  {
    id: 'github',                       // 唯一、小写、[a-z0-9-]，用于 data-site / 测试
    label: 'GitHub',                    // 按钮文字
    home: 'https://github.com',         // 无关键词时跳转
    search: 'https://github.com/search?q={q}', // 必含 {q} 占位符
    keywords: ['gh', '代码', '开源'],    // 可选，用于本地联想匹配，可为空数组
  },
  // ...
]
```

- **11 个站点，两个主题完全一致（不允许再出现 Light 有、Dark 没有的漂移）**，顺序固定：
  `github`, `unsplash`, `bilibili`, `sspai`, `moegirl`, `zhihu`, `tieba`, `taobao`, `jd`, `steam`, `archwiki`
- 所有 URL 必须 `https://`。URL 值参照原项目两文件里的现有写法，Unsplash 的搜索地址用 `https://unsplash.com/s/photos/{q}`（原 `search?q=` 已失效，作为修正点）。

### 4.2 默认搜索引擎 `SS.engines`

```js
SS.engines = {
  bing: { id: 'bing', label: 'Bing', search: 'https://www.bing.com/search?q={q}' },
}
SS.defaultEngine = 'bing'
```

### 4.3 localStorage 键（统一前缀 `ss.`）

| 键 | 类型 | 说明 |
|---|---|---|
| `ss.theme` | `'light' \| 'dark'` | 用户显式选择的主题；无值则按 `?theme=` → 系统偏好 → 浅色（见 §12） |
| `ss.history` | `string[]` | 最近搜索词，最多 10 条，新的在前，去重 |
| `ss.remote` | `'on' \| 'off'` | 联网联想开关；缺省视为 `on`（见 §12） |

读写在 `try/catch` 内（隐私模式/禁用 localStorage 不能报错）。

## 5. 模块 API

### 5.1 `SS.search`（core-engine）

```js
SS.search = {
  DEFAULT_ENGINE: 'bing',
  // 关键词规范化：去首尾空白、把连续空白折叠为一个空格；返回 string
  normalizeQuery(raw) -> string,
  // 用 {q} 模板构建 URL，内部必须 encodeURIComponent；模板无 {q} 则抛 TypeError
  buildUrl(template, query) -> string,
  // 决策：query 为空 → { kind: 'nav', url: site.home }
  //       query 非空 → { kind: 'search', url: buildUrl(...) }
  resolveSite(siteId, rawQuery) -> { kind, url, siteId, query } | null   // 未知 siteId → null
  // query 为空 → { kind: 'nav', url: 'https://www.bing.com' }；非空 → Bing 搜索
  resolveDefault(rawQuery) -> { kind, url, query }
}
```

### 5.2 `SS.suggest`（input-ux）

```js
SS.suggest = {
  // 纯函数，便于单测：给 query 返回建议项数组（最多 8 条），不读 DOM
  // item: { type: 'engine'|'site'|'history', label, sublabel, siteId? }
  getItems(rawQuery, opts) -> SuggestionItem[]
  // opts（全部可选）: { history: string[], sites: SS.sites, engines: SS.engines, max: 8 }
  // 规则：query 为空时给"历史 + 站点"列表；非空时给"用 Bing 搜 xxx" + 匹配到的站点项 + 历史匹配
}
```

- **默认必须完全离线可用**（只用站点表 + 历史）。可选网络联想由 `SS.input` 决定是否开启，实现放 `input.js`，且必须 `AbortController` 300ms 超时、失败静默、结果只做追加不阻塞键盘。

### 5.3 `SS.history`（input-ux）

```js
// 纯工厂，便于单测（storage 只需 getItem/setItem，测试注入内存假对象）
SS.history.create(storage) -> {
  list() -> string[],
  add(query) -> string[],      // 去重、置顶、截断到 10
  remove(query) -> string[],
  clear() -> void,
}
// 便利封装：内部懒创建基于真实 localStorage 的实例（app.js / input.js 用这些）
SS.history.KEY = 'ss.history'
SS.history.record(query) -> string[]   // = create(localStorage).add
SS.history.list() -> string[]
SS.history.remove(query) / SS.history.clear()
```
**历史写入只由 `app.js` 触发**（表单提交、站点按钮点击），`input.js`/`suggest.js` 只读取历史做联想，避免双写。

### 5.4 `SS.theme`（theme-ui）

```js
SS.theme = {
  KEY: 'ss.theme',
  get() -> 'light' | 'dark' | null,       // 仅读存储
  resolve(pageDefault) -> 'light'|'dark', // 存储优先，否则 pageDefault
  apply(theme) -> void,                   // 写 documentElement.dataset.theme + 同步按钮状态
  toggle() -> 'light'|'dark',             // 切换、持久化、apply，返回新主题
  init() -> void,                         // 读 <html data-theme-default>，apply 并绑定 #theme-toggle
}
```

- 主题通过 `<html data-theme="light|dark">` 生效，CSS 只认这个属性。
- 防闪烁：`templates/page.html` 里已有一小段内联脚本，在 CSS 之前按 `?theme=` → 存储 → 系统偏好 → 浅色 的顺序设置 `data-theme`；`theme.js` 不要重复造轮子，只做交互与持久化。
- **单页模式（§12）**：`data-theme-default` 固定为 `auto`，主题解析优先级见 §12；`theme.js` 的 `resolve(pageDefault)` 需实现该系统偏好回退，并在检测到 `?theme=` 时把它持久化、再用 `history.replaceState` 把参数从地址栏去掉。
- 主题按钮文案/`aria-pressed` 由 `theme.js` 更新；`#theme-toggle` 初始内容由模板给出。

### 5.5 `SS.input`（input-ux）

```js
SS.input = {
  init() -> void   // 绑定 #search-input 的输入/键盘事件、#clear-button、联想列表渲染
}
```

职责边界：
- 清除按钮 `#clear-button`：`input` 有内容时显示（去掉 `hidden`），点击清空并聚焦输入框。
- 搜索按钮 `#search-submit` 是原生 `type="submit"`，提交由 `app.js` 处理，`input.js` 只管可见性/禁用态。
- 联想列表 `#suggest-list`：`role="listbox"`，子项 `role="option"`；`ArrowUp/ArrowDown` 移动 `aria-activedescendant`，`Enter` 采用当前项，`Esc` 关闭（并清空高亮），点击/`mousedown`（用 mousedown 抢在 blur 前）采用。
- 联想项被采用后：`type==='engine'` → 用默认引擎搜索该词；`site` → `SS.search.resolveSite`；`history` → 填入输入框并搜索。
- 输入框为空时不渲染列表；`hidden` 属性控制显隐，**不要**用 `display:none` 内联样式。

### 5.6 `SS.remote`（input-ux，新增模块 `assets/js/remote.js`）

联网联想：把当前输入发给**百度联想**（JSONP，无需 CORS），失败/超时/关闭时静默返回空数组，联想能力始终可用（本地部分不依赖网络）。

```js
SS.remote = {
  KEY: 'ss.remote',                 // 'on' | 'off'，缺省 on
  enabled() -> boolean,
  setEnabled(bool) -> boolean,      // 写存储并返回新状态
  // 返回纯字符串数组（已去重、已裁剪），永不 reject；关闭/空词/失败 → []
  fetch(rawQuery, opts) -> Promise<string[]>,
  // opts: { timeout?: number（默认 700ms）, limit?: number（默认 5）, signal? }
  // 内部要求：内存缓存 Map（≤100 条、TTL 10 分钟）、同词并发只发一次、
  //           新 query 到来时旧请求结果直接丢弃（用序号/AbortController 守卫）
  provider: {                       // 可插拔，默认百度；将来加别的只改这里
    id: 'baidu',
    label: '百度',
    buildUrl(query, callbackName) -> string,   // JSONP URL
    parse(text) -> string[],                   // 解析 JSONP 回包里的词
  },
}
```

硬约束：
- JSONP 只允许 `document.createElement('script')` 注入，回调名唯一（`ss_suggest_<n>`），**用完删除 script 标签和全局回调**，并 `try/catch` 包住；禁止 `eval`。
- 结果只用 `textContent` 渲染（禁止 `innerHTML`），非字符串/超长（>100 字符）一律过滤。
- 网络请求只在 `enabled()` 为真且输入非空时发生；关闭后**不得有任何第三方请求**。
- `file://` 下也必须可用（JSONP 不受 CORS 限制）。

### 5.7 `SS.app`（lead）

`app.js` 负责：DOMContentLoaded 后依次 `SS.theme.init()`、`SS.input.init()`；用事件委托处理 `#buttons-container .button[data-site]` 点击；拦截 `#search-form` submit（空词则聚焦输入框并阻止提交，非空交给原生 GET 提交到 Bing —— 浏览器的表单编码天然正确）；`Ctrl/⌘/Alt + 点击`站点按钮时 `window.open` 新标签页。

## 6. DOM 契约（模板已按此写好，改文案可以，改 id/class/aria 必须先问 lead）

```html
<html lang="zh-CN" data-theme="light" data-theme-default="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>简单搜索 · 浅色</title>
  <meta name="description" content="...">
  <meta name="theme-color" content="#f5f5f5">
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/css/tokens.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/input.css">
  <script>/* 防闪烁内联：读 ss.theme，写 data-theme */</script>
</head>
<body>
  <a class="skip-link" href="#search-input">跳到搜索框</a>
  <main id="search-container">
    <form id="search-form" role="search" action="https://www.bing.com/search" method="get" autocomplete="off">
      <div class="search-field">
        <input id="search-input" name="q" type="text" placeholder="搜索…" aria-label="搜索关键词"
               aria-autocomplete="list" aria-controls="suggest-list" aria-expanded="false"
               enterkeyhint="search" autocomplete="off" spellcheck="false" maxlength="512">
        <button id="clear-button" class="icon-button" type="button" aria-label="清除输入内容" hidden>✕</button>
        <ul id="suggest-list" class="suggest-list" role="listbox" aria-label="搜索建议" hidden></ul>
      </div>
      <button id="search-submit" class="submit-button" type="submit">搜索</button>
    </form>
    <nav id="buttons-container" aria-label="常用网站">
      <!-- 由 build 从 SS.sites 生成： -->
      <button class="button" type="button" data-site="github">GitHub</button>
      <!-- ... -->
    </nav>
  </main>
  <footer id="site-footer">
    <button id="suggest-source-toggle" class="footer-button" type="button" aria-pressed="true">联网联想：开</button>
    <button id="theme-toggle" class="footer-button" type="button">夜间模式</button>
    <a class="footer-link" href="https://github.com/breathiness/SimpleSearch">关于</a>
  </footer>
  <script defer src="assets/js/sites.js"></script>
  <script defer src="assets/js/search.js"></script>
  <script defer src="assets/js/suggest.js"></script>
  <script defer src="assets/js/history.js"></script>
  <script defer src="assets/js/theme.js"></script>
  <script defer src="assets/js/remote.js"></script>
  <script defer src="assets/js/input.js"></script>
  <script defer src="assets/js/app.js"></script>
</body>
</html>
```

补充要求：
- **`hidden` 属性必须真的能隐藏元素**：`base.css` 里给出 `[hidden] { display: none; }`，并且任何自带 `display` 的组件（如 `.suggest-list`）要用 `.suggest-list:not([hidden]) { display: ... }` 写法，否则会盖掉原生的 `[hidden]` 规则。
- `assets/js/app.js` 由 lead 直接维护；`index.html` 由 `scripts/build.mjs` 从 `templates/page.html` 生成，**不允许手改**（`index.html` 只能通过模板改）。
- CSS 里**禁止**用 `!important`（除第三方覆盖场景，本项目不需要）。
- 所有交互控件保留可见 `:focus-visible` 轮廓（≥2px，对比度达标）。
- 支持 `prefers-reduced-motion: reduce`（关闭过渡）。
- 布局：桌面输入框居中偏上、按钮墙在下方居中换行；≤ 480px 时输入框接近满宽、按钮字号可读、底部 footer 不遮挡。

## 7. 构建产物（lead）

**v2.1 起只有一个真实页面**（单页主题，见 §12），两个旧 URL 变成重定向壳：

- 输入：`templates/page.html`（真实页）、`templates/redirect.html`（重定向壳）+ `SS.sites`（`node` 动态 `import` `assets/js/sites.js` 读取）
- 输出三个文件，均由 `scripts/build.mjs` 生成：
  - `index.html` —— 唯一真实页面，`data-theme-default="auto"`；占位符 `{{THEME_DEFAULT}}`、`{{TITLE}}`、`{{DESCRIPTION}}`、`{{THEME_COLOR}}`、`{{THEME_TOGGLE_LABEL}}`、`{{SITE_BUTTONS}}`
  - `SimpleSearch-Light.html` —— 0 秒重定向到 `index.html?theme=light`（`<meta http-equiv="refresh">` + `location.replace` + `<link rel="canonical">`，无 JS 也能跳）
  - `SimpleSearch-Dark.html` —— 同上，指向 `index.html?theme=dark`
- `node scripts/build.mjs` 写入；`--check` 只比对不写、有差异退出码 1（CI 用）。
- 生成文件顶部带 `<!-- 由 scripts/build.mjs 生成，请勿手改 -->` 注释。

## 8. 脚本（`package.json` 预置，勿改）

```
npm run build      # 生成 index.html + 两个重定向壳
npm test           # node --test "tests/**/*.test.mjs"（Node ≥ 21 由 Node 自己展开 glob；不要用 `node --test tests/`）
npm run validate   # 静态检查 + 生成产物是否最新（--check）
npm run check      # build && test && validate（CI 只跑这个）
npm run e2e        # 真实浏览器 E2E（本机 Edge/Chrome，CDP，截图到 artifacts/；CI 不跑）
npm run serve      # 本地静态服务器 http://127.0.0.1:8080
```

## 9. 验收门（qa-test 与 lead 必查）

1. `npm run check` 全绿。
2. 11 个站点 ×（空词 / 普通词 / 特殊词 `a&b`、`c#d`、`a+b`、`中文 空格`、emoji）× 明暗两主题，URL 与预期表一致。
3. 生成产物与模板一致（`--check` 通过，无手改漂移）；三个产物齐全，两个重定向壳指向正确。
4. 单页主题：`?theme=` → 存储 → 系统偏好 → 浅色 的解析顺序正确；切换后刷新保持；旧 URL 跳转后主题正确。
5. 键盘全流程：Tab 可达、`/` 聚焦、↑↓ 选联想、Enter 采用、Esc 关闭、清除按钮可用。
6. 关闭联网联想（`ss.remote='off'`）时**零第三方网络请求**，全部核心功能离线可用。
7. 开启联网联想时：请求只发往 provider 域（百度），700ms 超时/失败静默降级为本地联想，永不阻塞键盘。
8. `file://` 直接打开可用（无 CORS 报错、无 module 加载失败；联网联想在 file:// 下也能工作）。
9. 单文件页面 + 全部资源体积目标：< 80 KB（gzip 前，MDUI 1 风格下仍远小于引入框架的体积）。

## 10. 沟通规则

- 任务进度用共享任务板更新；阻塞立即消息 lead。
- 不要 `git commit`/`git checkout`/`git push` —— 版本控制由 lead 统一负责。**所有人只在工作区改文件。**
- 不要动别人的文件，即使看到了 bug：发消息给 lead 或对应 owner。
- 提交前自查：`node --check <file>` 语法通过；控制台无报错。

## 11. 视觉风格：MDUI 1 / Material Design 1（用户指定）

**不是引入 MDUI 库**，而是用自研 CSS 复刻 MDUI 1（Material Design 1）的视觉语言：零第三方依赖、不引 CDN、不拷贝 MDUI 的 CSS 文件。

调色板（取自 MDUI 1 官方色表）：

| 用途 | 浅色 | 深色 |
|---|---|---|
| 主色 primary | `#3F51B5`（indigo-500）；hover `#303F9F` | 文字/描边用 `#9FA8DA`（indigo-200） |
| 强调色 accent | `#FF4081`（pink-a200），仅少量点缀 | 同 |
| 页面背景 | `#F5F5F5`（grey-100，**固定值，E2E 断言**） | `#303030`（**固定值，E2E 断言**） |
| 表面 surface | `#FFFFFF` | `#424242` |
| 正文 / 次要 / 禁用 / 分隔线 | `rgba(0,0,0,.87/.54/.38/.12)` | `rgba(255,255,255,.87/.70/.50/.12)` |

组件规范：
- **涟漪（ripple）**：MDUI 招牌反馈。CSS 在 `base.css`（`.ripple` + keyframes），JS 注入在 `assets/js/app.js`（点击 `.button`、`#search-submit`、`#theme-toggle`、`#suggest-source-toggle`、`.icon-button`、`.suggest-item`）。
- **按钮**：MD1 raised button —— 36px 高（移动端 ≥44px）、圆角 2px、14px/500、`letter-spacing:.5px`、elevation 2dp，hover 4dp。
- **输入框**：MD1 textfield —— 48px 高、2px 圆角、表面色底、底部下划线（聚焦 2px 主色并做 scaleX 动画），`cubic-bezier(.4,0,.2,1)` 200ms。
- **联想下拉**：MD1 menu —— 表面色、2px 圆角、elevation 8dp、项高 44px、hover 8% 遮罩、当前项左侧 3px 主色条。
- 字体：`Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif`（系统回退，不下载字体）。
- 圆角统一 2px；阴影只用 2dp/4dp/8dp 三档 elevation；`prefers-reduced-motion: reduce` 下关闭涟漪与过渡。

## 12. v2.1：单页主题 + 联网联想（用户指定）

### 12.1 单页主题（明暗在同一个网页里切换）

v1/v2.0 是两个文件（Light/Dark），v2.1 合并成**一个真实页面 `index.html`**：

- 主题解析优先级（首屏内联脚本与 `SS.theme.resolve()` 必须一致）：
  1. URL 参数 `?theme=light|dark`（老链接进来时用）
  2. `localStorage['ss.theme']`（用户上一次显式切换）
  3. 系统偏好 `prefers-color-scheme`
  4. 回退 `light`
- 检测到 `?theme=` 时：应用该主题 → `ss.theme` 持久化 → `history.replaceState` 去掉参数（避免分享出去的地址固定主题）。
- 两个旧 URL 保留为重定向壳（`SimpleSearch-Light.html` → `index.html?theme=light`，Dark 同理），老书签/老 README 链接不失效。
- 页脚切换按钮 `#theme-toggle` 不变：点击在 light/dark 间切换并持久化。
- 系统偏好变化（用户在 OS 里切深浅色）且用户没有显式选择时，应实时跟随（`matchMedia` 监听；用户显式切换过就不再跟随）。

### 12.2 联网联想（百度 JSONP）

- 默认开启（`ss.remote` 缺省 = `on`），页脚 `#suggest-source-toggle` 可关闭；关闭后零第三方请求。
- 数据源：百度联想 JSONP `https://suggestion.baidu.com/su?wd=<q>&cb=<fn>` → 回包 `fn({q:"...",p:false,s:["词1","词2",...]})`。provider 可插拔（§5.6），将来换/加源只改 `remote.js`。
- 合并顺序（最多 8 条）：`[用 Bing 搜索：q]` + 站点匹配（本地，≤3） + 联网联想（≤5，sublabel 显示「百度」） + 历史匹配（本地，≤2）。去重按词面（大小写不敏感）。
- 性能与稳健：输入防抖 140ms 之后才发请求；700ms 超时；同词并发只发一次；缓存 10 分钟、最多 100 条；结果返回时若输入已变化则丢弃；**任何失败都不影响本地联想与搜索**。
- 隐私：开启时会把输入的关键词发给百度；README 必须明确写清，并说明「关闭后完全离线」。
