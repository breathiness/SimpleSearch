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
9. 单文件页面 + 全部资源体积目标：< 156 KB（gzip 前；v2.7 站点扩到 33 个后实际约 146 KB，gzip 后约 42 KB）。内联图标 sprite 约 5.6 KB（gzip 0.97 KB）且零额外请求。**以 gzip 体积为真实成本口径**（GitHub Pages 默认 gzip）。

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

## 13. v2.2：站点分类 + 图标（用户要求）

### 13.1 站点分类（数据驱动）

- `assets/js/sites.js` 里每个站点增加字段 `group`（必填），并在文件里新增分组表：

```js
SS.siteGroups = [
  { id: 'tech', label: '技术开发' },      // github, archwiki
  { id: 'community', label: '社区问答' }, // zhihu, tieba
  { id: 'media', label: '影音游戏' },     // bilibili, steam, moegirl
  { id: 'shopping', label: '购物' },      // taobao, jd
  { id: 'content', label: '素材资讯' },   // unsplash, sspai
]
```

- 每个 `SS.siteGroups[i].id` 至少要有一个站点使用；`site.group` 必须存在于分组表中；分组表顺序 = chip 渲染顺序。
- 交互：`#group-chips` 渲染「全部 + 各分组」chip（MD1 chip，32px 高、圆角 16px、`aria-pressed` 表示选中，单选语义），点击后只显示该分组的站点按钮（其余用 `hidden`），「全部」恢复全量。
- 无 JS 兜底：`#group-chips-wrap` 初始带 `hidden`，由 `app.js` 在 init 时去掉；无 JS 时只看到全部按钮，不会出现「点了没反应」的死 chip。
- 不引入 URL 状态（不写 hash/query），不持久化筛选（每次打开都是「全部」）。

### 13.2 图标：内联 SVG sprite（零额外请求）

**红线**：不得新增任何图片请求、不得引用外部 favicon 服务（如 `icons.duckduckgo.com`）、不得用 emoji 字体图标冒充品牌。图标必须**内联进生成的 HTML**：

- 图标数据放 `scripts/icons.mjs`（**dev-time 资产，不进运行时、不被页面加载**），形如：
  `export const SITE_ICONS = { github: { body: '<path .../>' }, ... }`（`viewBox` 可省略，默认 24×24）。
- `scripts/build.mjs` 把用到的图标渲染成一个隐藏的 `<svg class="icon-sprite">` + `<symbol id="i-<siteId>">`，插在 `<body>` 开头；每个按钮里放 `<svg class="button-icon" aria-hidden="true" focusable="false"><use href="#i-<siteId>"></use></svg>`。
- 没有配图标的站点（用户自加的站点）**不留空**：渲染 `<span class="button-icon button-icon-text" aria-hidden="true">首字符</span>` 做字母/汉字 monogram 兜底。
- 图标风格：24×24 viewBox、`fill="none"` + `stroke="currentColor"` + 1.8 线宽 + 圆头，**通用几何符号而不是他人商标的精确复制**（避免商标问题）。
- 体积红线：sprite 全部内联后 HTML 增量 ≤ 4 KB（未压缩），全站仍满足 §9.9 的 156 KB 预算（当前约 130 KB）；首屏不得因此新增任何网络请求。

## 14. v2.3：改成 MDUI 文档站式骨架（用户要求）

用户要求：「设置的样式」和「分类的排列方式」改成 MDUI 1 文档网页类似的样子。参考 https://www.mdui.org/zh-cn/docs/1/ 的结构：**主色顶栏 + 左侧分组导航 + 内容卡片 + 右侧设置面板（开关项）**。

### 14.1 页面骨架

```
<body>
  {{ICON_SPRITE}}
  .skip-link
  header.appbar        → #nav-toggle(汉堡, 仅 <960px 显示) + .appbar-title + #settings-toggle(设置图标)
  div.shell
    aside#site-nav     → 左侧分类导航（桌面常驻；<960px 变左侧抽屉）
      .nav-group-title 「站点分类」+ 折叠箭头(装饰)
      nav#group-chips.nav-list
        button.nav-item[data-group=all|tech|…][aria-current=true|false]   ← 分类项（竖向排列）
    main#main-content
      section.card.card-search  → #search-form（输入框 + 清除 + 搜索按钮）
      section.card.card-sites   → h2.card-title「常用网站」+ nav#buttons-container（站点按钮墙）
  div#scrim.scrim[hidden]
  aside#settings-panel[role=dialog][aria-modal=true][hidden]
    .panel-header → h2#settings-title「设置」+ button#settings-close
    .panel-body
      button#theme-toggle.switch-row[aria-pressed]        文案固定「夜间模式」
      button#suggest-source-toggle.switch-row[aria-pressed] 文案固定「联网联想」
      a.panel-link → GitHub 仓库
```

- **移除页脚**（原 `#site-footer` 里的两个开关搬到设置面板；「关于」变成面板里的链接）。
- 分类选中语义用 `aria-current="true"`（导航项语义，替代原来的 `aria-pressed`）；设置里两个开关仍用 `aria-pressed`（按钮式开关，视觉上是 MD1 switch）。
- **文案固定**：`#theme-toggle` 永远显示「夜间模式」、`#suggest-source-toggle` 永远显示「联网联想」，状态只通过 `aria-pressed` 表达。因此 `theme.js` / `input.js` **不得再改这两个按钮的 textContent**（只更新 aria-pressed / title）。
- 交互：
  - 点 `.nav-item` → 只显示对应 group 的站点按钮（`hidden`），其余隐藏；`aria-current` 同步；「全部」恢复全量。
  - <960px：汉堡按钮开合左侧抽屉（`#site-nav` 滑动 + `#scrim` 显示），点 scrim / Esc / 选中分类后自动关闭；`aria-expanded` 同步。
  - 设置面板：点 `#settings-toggle` 从右侧滑出（`#scrim` 显示），点 `#settings-close` / scrim / Esc 关闭；打开时焦点移到面板内第一个开关，关闭后焦点回到 `#settings-toggle`。
  - 面板打开时 `scrim` 全屏、点击穿透关闭；抽屉与面板共用同一个 `#scrim`，同时最多开一个。
- 响应式：≥960px 侧边栏宽 240px 常驻、汉堡隐藏；<960px 侧边栏为抽屉、内容区满宽。

### 14.2 图标（继续内联，零请求）

`scripts/icons.mjs` 分两组：`SITE_ICONS`（11 个站点图标）+ `UI_ICONS`（`menu` 汉堡、`settings` 设置、`close` 关闭）。build 把两组都塞进同一个 `<svg class="icon-sprite">`，UI 图标的 `<symbol id="i-menu">` 等。sprite 体积仍须 ≤ 6 KB（未压缩），全站 ≤ 128 KB。

### 14.3 验收门增补

- 顶栏存在（`.appbar`）、标题正确、设置按钮可开合面板、面板内有 2 个 `.switch-row`。
- 桌面（≥960）：`#site-nav` 可见、无横向溢出；移动（390/320）：汉堡可见、抽屉可开合、scrim 生效、无横向溢出。
- `.nav-item` 数量 = 1 + 分组数；点分类后只有该组站点可见，`aria-current` 只有一个 true。
- 页面无 `#site-footer`；设置面板关闭时 `#settings-panel[hidden]`。

## 15. v2.4：顶栏 logo + 分类图标 + 主题色可选（MDUI 19 色）

### 15.1 主题色（MDUI 19 组主色）

- 存储键 `ss.color`，值为颜色 id；缺省 `indigo`。首屏内联脚本在设置 `data-theme` 的同时设置 `<html data-color="<id>">`（非法值回退 indigo），保证不闪错色。
- `tokens.css` 用「一层色值 + 一层语义变量」：
```css
:root {
  --primary-bg: var(--c-500); --primary-bg-hover: var(--c-700);
  --primary: var(--c-700); --focus-ring: var(--c-700); --on-primary: var(--c-on);
}
:root[data-theme='dark'] { --primary: var(--c-200); --focus-ring: var(--c-200); }
:root[data-color='red'] { --c-500:#f44336; --c-700:#d32f2f; --c-200:#ef9a9a; --c-on:#fff }
/* …19 组，每组一行… */
```
- 19 组（id / 中文名 / 500 / 700 / 200 / on-primary）：
  - red 红 `#F44336` `#D32F2F` `#EF9A9A` #fff
  - pink 粉 `#E91E63` `#C2185B` `#F48FB1` #fff
  - purple 紫 `#9C27B0` `#7B1FA2` `#CE93D8` #fff
  - deep-purple 深紫 `#673AB7` `#512DA8` `#B39DDB` #fff
  - indigo 靛蓝 `#3F51B5` `#303F9F` `#9FA8DA` #fff（默认）
  - blue 蓝 `#2196F3` `#1976D2` `#90CAF9` #fff
  - light-blue 浅蓝 `#03A9F4` `#0288D1` `#81D4FA` #fff
  - cyan 青 `#00BCD4` `#0097A7` `#80DEEA` `rgba(0,0,0,.87)`
  - teal 蓝绿 `#009688` `#00796B` `#80CBC4` #fff
  - green 绿 `#4CAF50` `#388E3C` `#A5D6A7` #fff
  - light-green 浅绿 `#8BC34A` `#689F38` `#C5E1A5` `rgba(0,0,0,.87)`
  - lime 黄绿 `#CDDC39` `#AFB42B` `#E6EE9C` `rgba(0,0,0,.87)`
  - yellow 黄 `#FFEB3B` `#FBC02D` `#FFF59D` `rgba(0,0,0,.87)`
  - amber 琥珀 `#FFC107` `#FFA000` `#FFE082` `rgba(0,0,0,.87)`
  - orange 橙 `#FF9800` `#F57C00` `#FFCC80` `rgba(0,0,0,.87)`
  - deep-orange 深橙 `#FF5722` `#E64A19` `#FFAB91` #fff
  - brown 棕 `#795548` `#5D4037` `#BCAAA4` #fff
  - grey 灰 `#9E9E9E` `#616161` `#E0E0E0` `rgba(0,0,0,.87)`
  - blue-grey 蓝灰 `#607D8B` `#455A64` `#B0BEC5` #fff
- 设置面板新增一行：`<div class="settings-row"><span class="settings-label">主题色</span><div id="color-swatches" class="swatches" role="group" aria-label="主题色"></div></div>`；色块由 `theme.js` 运行时生成（不在构建产物里，避免 HTML 变大）。
- `theme.js` 新增：`SS.theme.COLORS = [{ id, label }, …]`（19 项，顺序同表）、`applyColor(id)`（写 `data-color`）、`initColor()`（读存储→applyColor）、点击色块时 applyColor + 持久化 + 更新 `aria-pressed`；`init()` 里调用 initColor。
- 色块 `.swatch`：圆形 28px、背景为该色 500、`aria-pressed="true"` 时外圈 2px 主色或勾选标记、`:focus-visible` 轮廓。用 `<button type="button" class="swatch" data-color="…" aria-pressed="false" title="靛蓝" aria-label="靛蓝">`。

### 15.2 顶栏圆形 logo

- appbar 标题左侧新增 `<span class="appbar-logo"><svg class="appbar-logo-svg"><use href="#i-logo"></use></svg></span>`，logo 用 `UI_ICONS.logo`：圆环 + 放大镜（通用几何，不抄商标）。

### 15.3 分类小图标

- 每个 `.nav-item` 内含 `<svg class="nav-icon"><use href="#i-cat-<group>"></use></svg>` + `<span class="nav-label">…</span>`；`all` 用网格图标。
- `UI_ICONS` 新增 `cat-all`（九宫格）、`cat-tech`（终端）、`cat-community`（对话气泡）、`cat-media`（播放电视）、`cat-shopping`（手提袋）、`cat-content`（相机）。
- sprite 体积红线：≤ 8 KB（未压缩）；全站预算 ≤ 156 KB。

## 16. v2.5：深链、主题三态、历史管理、站点自检、版本号（批次 A 去掉 `?q=` 默认搜索引擎）

用户明确**不做**「把自己设成浏览器默认搜索引擎（`?q=%s` 自动提交）」，其余照做。

### 16.1 深链（只预填/预选，不自动跳转）

- `?cat=<groupId>`：进入时选中该分类（等价点击该 `.nav-item`，`aria-current` 同步）；点分类时用 `history.replaceState` 把 URL 同步为 `?cat=<id>`（`all` 时删除参数），便于收藏/分享。非法 cat 忽略。
- `?q=<term>`：把查询词填入 `#search-input` 并聚焦（光标在末尾），**不自动提交**、不跳转。
- `?site=<siteId>`：选中该站点所属分类，并把焦点移到对应站点按钮（**不跳转**）。非法 id 忽略。
- 三个参数可组合，执行顺序：cat → site → q（q 最后，保证聚焦在输入框）。处理后**不要**用 replaceState 删掉这些参数（与 `?theme=` 不同，深链是可分享状态）。

### 16.2 主题三态（跟随系统 / 浅色 / 深色）

- **移除**设置面板里的「夜间模式」开关行 `#theme-toggle`（连带其 aria-pressed 语义），改为分段控件：
```html
<div class="settings-row">
  <span class="settings-label">主题模式</span>
  <div id="theme-mode" class="segmented" role="group" aria-label="主题模式">
    <button class="segmented-item" type="button" data-mode="auto" aria-pressed="true">跟随系统</button>
    <button class="segmented-item" type="button" data-mode="light" aria-pressed="false">浅色</button>
    <button class="segmented-item" type="button" data-mode="dark" aria-pressed="false">深色</button>
  </div>
</div>
```
- 语义：`data-mode="auto"` 时不写 `ss.theme`（跟随系统 + 实时响应系统变化）；`light`/`dark` 写 `ss.theme`。`theme.js` 新增 `getMode()` / `setMode(mode)`，`applyMode()` 同步 `aria-pressed`；`init()` 绑定分段按钮。旧的 `toggle()` 保留给内部/测试用。
- `?theme=light|dark` 深链仍然优先（进入时等价于 setMode 该值并持久化）——注意这是老链接语义，保留。

### 16.3 搜索历史管理

- 设置面板新增一行：
```html
<div class="settings-row settings-row-inline">
  <span class="settings-label">搜索历史 <span id="history-count" class="settings-value">0 条</span></span>
  <button id="history-clear" class="text-button" type="button" disabled>清空</button>
</div>
```
- `#history-count` 显示 `SS.history.list().length` 条；`#history-clear` 在 0 条时 `disabled`。点击 → `SS.history.clear()` → 刷新计数 → 关闭联想列表。
- **单条删除**：联想列表里 `data-type="history"` 的项，鼠标路径上提供一个 `.suggest-delete` 小按钮（`aria-label="删除这条历史"`，`tabindex="-1"`，点击 `stopPropagation` 后删除该条并重渲染）；键盘路径：高亮 history 项时按 `Delete` 键删除。
- 历史写入仍只由 `app.js` 负责；app.js 在每次 `record()` 后 `document.dispatchEvent(new CustomEvent('ss:history-changed'))`，input.js 监听它刷新计数（含清空/单删后自己刷新）。

### 16.4 版本号显示

- 设置面板底部新增 `<p class="panel-version">简单搜索 v{{APP_VERSION}}</p>`（`{{APP_VERSION}}` 由 build 从 package.json 读取注入；小号次要色）。

### 16.5 站点健康自检（可选网络，不进 CI）

- 新增 `scripts/check-sites.mjs` + `npm run check:sites`：逐个站点请求 `home` 与 `search`（把 `{q}` 换成 `test`），8s 超时、`redirect: 'follow'`，输出表格：站点 id、home 状态、search 状态、最终 URL、判定（OK / 重定向到首页 / 非 2xx / 网络失败）。
- 默认退出码 0（只报告）；`--strict` 时有 FAIL 退出 1。**不加入 `npm run check` 和 CI**（避免网络抖动误伤）。

## 17. v2.6：批次 B（PWA 离线 + `!bang` + 搜索引擎切换 + 快捷键帮助 + 覆盖率）+ 单文件便携版

### 17.1 PWA / 离线

- 新增 `manifest.webmanifest`（静态，链接在模板 `<head>`）：`name`/`short_name`「简单搜索」、`start_url: "./index.html"`、`scope: "./"`、`display: "standalone"`、`background_color: "#f5f5f5"`、`theme_color: "#3f51b5"`、icons 指向 `assets/img/icon-192.png` / `icon-512.png`（构建前手工生成并提交，PNG）。
- 新增 `templates/sw.js`，由 `scripts/build.mjs` 生成 `sw.js`：注入 `{{APP_VERSION}}` 与 `{{PRECACHE_LIST}}`（首页 + 全部 CSS/JS/图标/manifest）。
  - `install`：`cache.addAll(PRECACHE_LIST)` + `skipWaiting()`
  - `activate`：删除非当前版本的 cache + `clients.claim()`
  - `fetch`：只处理**同源 GET**；navigation 请求 cache-first 回退 index.html；其他 cache-first → 网络 → 回填缓存；**跨域请求（百度联想）直接放行、不缓存**
- `app.js` 注册：仅当 `location.protocol` 是 http/https 且浏览器支持 `serviceWorker` 时 `navigator.serviceWorker.register('sw.js')`，失败静默（`file://` 下不注册）。
- 缓存版本必须与 `package.json` 版本绑定，发布后旧缓存自动清理。

### 17.2 `!bang` 站内搜索

- 语法：`!<token> <搜索词>`，token 匹配 `site.id` 或该站的 `keywords`（小写）；`!gh rust` → 在 GitHub 搜 rust；`!gh` 无词 → 打开 GitHub 首页；未知 token 视为普通查询。
- `SS.search.resolveBang(raw)`（core-engine，纯函数）返回 `{ siteId, term, url, kind, token }` 或 `null`：
  - `normalizeQuery` 后必须以 `!` 开头；token = `!` 之后到第一个空白之间的整段（**允许中文**，如 `!b站`），小写后按注册表顺序**先比 `site.id` 再比 `keywords`**，精确相等才算命中
  - term = 剩余部分（保留用户大小写、折叠空白）；空 term → `kind: 'nav'` 指向 home；`url/kind` 复用 `resolveSite`
  - **只认第一个 token**（`!nope !gh x` → null，不做后扫）
  - `!`、`!!x`、`!` 后紧跟空白、未知 token、非字符串 → 一律 `null`，不抛错；另导出 `SS.search.BANG = '!'`
- 联想列表：当输入是合法 bang 时，第一项固定为「在 <站点> 搜索：<词>」（`type: 'bang'`，sublabel `!<token>`），采用即跳转（不再记录历史）。
- 表单提交路径（无高亮项直接回车）：`app.js` 的 submit 处理器先 `resolveBang`，命中则 `preventDefault` + 记历史 + 跳转；未命中走原生提交。

### 17.3 搜索引擎切换

- `SS.engines` 扩展为 4 个（core-engine）：`bing`（q）、`google`（q）、`ddg`（q）、`baidu`（wd），每个含 `{ id, label, search, param }`；`SS.defaultEngine` 仍为 `bing`。
- 存储键 `ss.engine`（默认 `bing`，非法回退）。`app.js` 启动时：读存储 → 设 `SS.defaultEngine` → 同步表单 `action`（`search` 去掉查询串）与 `#search-input` 的 `name`（`engine.param`）。
- 设置面板新增分段控件：
```html
<div class="settings-row">
  <span class="settings-label">搜索引擎</span>
  <div id="engine-mode" class="segmented" role="group" aria-label="搜索引擎">
    <button class="segmented-item" type="button" data-engine="bing" aria-pressed="true">Bing</button>
    <button class="segmented-item" type="button" data-engine="google" aria-pressed="false">Google</button>
    <button class="segmented-item" type="button" data-engine="ddg" aria-pressed="false">DDG</button>
    <button class="segmented-item" type="button" data-engine="baidu" aria-pressed="false">百度</button>
  </div>
</div>
```
- 切换后：表单 `action`/`name` 立即生效、`SS.defaultEngine` 更新、联想首项文案用当前引擎 label（如「用 Google 搜索：xxx」）、持久化 `ss.engine`。

### 17.4 快捷键帮助对话框

- 触发：按 `?`（Shift+/，且焦点不在输入框内）或点设置面板里的「快捷键」按钮（`#shortcuts-open`）。
- DOM：
```html
<section id="shortcuts-dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" hidden>
  <div class="dialog-header"><h2 id="shortcuts-title" class="dialog-title">键盘快捷键</h2>
    <button id="shortcuts-close" class="icon-button dialog-close" type="button" aria-label="关闭">✕</button></div>
  <dl class="shortcut-list">
    <div><dt><kbd>/</kbd></dt><dd>聚焦搜索框</dd></div>
    <div><dt><kbd>↑</kbd><kbd>↓</kbd></dt><dd>在联想列表里移动</dd></div>
    <div><dt><kbd>Enter</kbd></dt><dd>采用高亮项 / 提交搜索</dd></div>
    <div><dt><kbd>Esc</kbd></dt><dd>关闭联想 / 抽屉 / 对话框</dd></div>
    <div><dt><kbd>Tab</kbd></dt><dd>移出搜索框</dd></div>
    <div><dt><kbd>Delete</kbd></dt><dd>删除高亮的历史项</dd></div>
    <div><dt><kbd>?</kbd></dt><dd>打开本对话框</dd></div>
    <div><dt><kbd>!</kbd></dt><dd>站点快捷搜索，如 !gh rust</dd></div>
    <div><dt><kbd>Ctrl</kbd>/<kbd>⌘</kbd>+点击</dt><dd>新标签页打开站点</dd></div>
  </dl>
</section>
```
- 焦点：打开时聚焦关闭按钮；Esc/scrim/关闭按钮关闭并把焦点还给触发元素；Tab 循环（复用设置面板的 trap 思路）。
- 与设置抽屉共用 `#scrim`，同一时刻只开一个。

### 17.5 覆盖率

- `package.json` 新增 `npm run coverage`：`node --test --experimental-test-coverage --test-coverage-lines=90 --test-coverage-branches=75 --test-coverage-functions=80 "tests/**/*.test.mjs"`（不引入依赖，不进 CI 必跑）。
- 阈值以当前基线设定，低于阈值命令失败。

### 17.6 验收门增补

- `manifest.webmanifest` 存在且被 `<link rel="manifest">` 引用；`sw.js` 生成物带版本号与 precache 列表；`file://` 下不注册。
- E2E 需覆盖：SW 注册 → 断网（CDP offline）后刷新仍可用；`!gh rust` 跳转 GitHub 搜索；切换搜索引擎后表单 action/name 与 `ss.engine` 正确；`?` 打开快捷键对话框且 Esc 关闭归还焦点。
- 体积：新增 `sw.js`/manifest 不计入首页静态资源（首屏不加载 sw.js，仅后台注册），首页资源预算仍 136 KB。

## 18. v2.7：每个分类补充更多站点（用户要求）

- 在 `assets/js/sites.js` **追加**新站点（现有 11 个内置站点的顺序与字段一律不动，测试依赖其相对顺序），新站点集中追加在数组末尾，每个都必须有 `group`、`keywords`。
- 新增站点（22 个，4–5 个/分类）：
  - tech（5）：`stackoverflow` StackOverflow、`mdn` MDN、`gitee` Gitee、`npm` npm、`juejin` 掘金
  - community（4）：`douban` 豆瓣、`weibo` 微博、`v2ex` V2EX、`reddit` Reddit
  - media（5）：`youtube` YouTube、`douyin` 抖音、`iqiyi` 爱奇艺、`vqq` 腾讯视频、`twitch` Twitch
  - shopping（4）：`tmall` 天猫、`pinduoduo` 拼多多、`goofish` 闲鱼、`amazon` 亚马逊
  - content（4）：`pexels` Pexels、`pixabay` Pixabay、`36kr` 36氪、`zcool` 站酷
- 站点总数 11 → 33；「全部」视图按注册表顺序显示全部站点（内置 11 个在前，新站点在后），分类视图只显示该组站点。
- **图标**：`sites.js` 站点可新增可选字段 `icon`，值为已在 sprite 里的 symbol 名（如 `cat-tech`）。build 解析顺序：`SITE_ICONS[site.id]` → `site.icon` 指向的 symbol（必须存在于 `SITE_ICONS`/`UI_ICONS`） → 首字符 monogram。lead 会为 11 个新站点画专属图标，其余用 `cat-<group>` 复用分类图标；sprite 体积红线 8 KB → **12 KB**，全站预算 136 KB 不变。
- 门禁增补：断言每个分组站点数 ≥ 3、新站点 group/keywords 合法、总站点数 ≥ 30、每个按钮都有图标（专属 icon 或 `cat-*` 复用或 monogram）。

## 19. v2.8：常用站与分类展开（用户要求）

### 19.1 数据：`featured` 标记

- `assets/js/sites.js` 中原来 11 个内置站点新增 `featured: true`；新增的 22 个站点**不带**该字段（视为非 featured）。
- `build` 为 feature 站点渲染 `data-featured="true"`；非 featured 站点不带该属性。
- **无 JS 兜底**：build 直接给非 featured 按钮加 `hidden` 属性（初始只显示 11 个常用站），JS 在分类视图里再取消隐藏。

### 19.2 视图规则

- `data-group="all"`（导航首项，**文案从「全部」改为「常用」**）→ 只显示 `featured` 的 11 个站点。
- 选择某分类 → 显示该分类**全部**站点（featured + 新增）。
- `applyGroupFilter(group)` 同步：
  - 导航项 `aria-current`；
  - 站点按钮 `hidden`（all → 非 featured 隐藏；分类 → 不匹配的隐藏）；
  - **卡片标题**：all → 「常用网站」；分类 → 该分类 label（如「技术开发」）。
- 深链 `?cat=<group>` 仍然生效（`all` 表示常用视图，地址栏不带 cat 参数）。
- 启动时（含无深链的默认访问）都必须执行一次 `applyGroupFilter('all')`，保证 33 个按钮里只有 11 个可见。

### 19.3 门禁增补

- E2E：默认视图可见按钮 = 11 且全部 `data-featured="true"`；点「技术开发」→ 可见 7 个且卡片标题「技术开发」；点「常用」→ 回到 11 个、标题「常用网站」；`?cat=shopping` 深链 → 6 个且标题「购物」；单文件版同样断言。
- 导航首项文案断言改为「常用」。
