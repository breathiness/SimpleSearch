# 贡献指南

感谢你愿意改进 SimpleSearch。这个项目的目标是**足够简单**：纯静态、零运行时依赖、打开就能用。改动请尽量顺着这个方向走，别为了一个功能引入框架、构建链或第三方请求。

## 开发环境

- **Node.js 21+**（开发和 CI 实际都用 Node 22；`npm test` 的 glob 参数需要 Node ≥ 21，别用 `node --test tests/`）。
- 任意现代浏览器；验证 `file://` 直接双击打开的能力时，用浏览器直接打开 `index.html` 即可。
- 编辑器建议开启 EditorConfig 式的「2 空格缩进、行尾 LF、文件末尾保留换行」。
- **不需要 `npm install`**：`package.json` 里没有 `dependencies` / `devDependencies`，克隆下来就能跑。

```bash
git clone https://github.com/breathiness/SimpleSearch.git
cd SimpleSearch
node -v   # 应为 v21 或更高（CI 用 22）
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 由模板 + `assets/js/sites.js` + `scripts/icons.mjs` 生成 5 个产物：`index.html`、`SimpleSearch.html`、两个重定向壳、`sw.js`（**改完站点或模板后必须跑**） |
| `npm test` | 运行 `node --test "tests/**/*.test.mjs"`，跑全部单元测试 |
| `npm run validate` | 静态检查 + 生成产物是否最新（内部会跑 `node scripts/build.mjs --check`） |
| `npm run check` | `build && test && validate`，提交前与 CI 都跑这个 |
| `npm run serve` | 零依赖本地静态服务器，默认 <http://127.0.0.1:8080/>（可用 `PORT` 环境变量改端口） |
| `npm run e2e` | 可选：用本机 Edge/Chrome 跑真实浏览器端到端检查（没装浏览器会跳过，CI 不跑），截图输出到已 gitignore 的 `artifacts/` |
| `npm run coverage` | 可选：Node 内置覆盖率 + 阈值（90 行 / 75 分支 / 80 函数，低于阈值失败）；零依赖，不进 CI 必跑 |
| `npm run check:sites` | 可选：逐个请求站点 `home` / `search`，检查是否 2xx、是否被重定向到首页（**需要网络，不进 CI**）；`--strict` 有 FAIL 退 1 |

## 目录结构

```
SimpleSearch/
├─ assets/
│  ├─ css/            # tokens.css / base.css / input.css
│  ├─ img/            # favicon.svg + PWA 图标 icon-192.png / icon-512.png
│  └─ js/             # 经典脚本（sites / search / suggest / history / theme / remote / input / sites-store / sites-admin / app）
├─ docs/              # 契约、自定义站点指南、更新日志
├─ scripts/           # build.mjs / icons.mjs（dev-time 图标数据）/ serve.mjs / validate.mjs / e2e.mjs / check-sites.mjs
├─ templates/         # page.html（真实页：顶栏 / 导航 / 卡片 / 设置抽屉 / 快捷键对话框）/ redirect.html（重定向壳）/ sw.js（Service Worker 模板）
├─ tests/             # node:test 单元测试
├─ .github/workflows/ # ci.yml（GitHub Actions）
├─ manifest.webmanifest # PWA manifest（手写）
├─ sw.js              # Service Worker，由 build 生成，勿手改
├─ index.html         # 唯一真实页面（多文件 + PWA），由 build 生成，勿手改
├─ SimpleSearch.html  # 单文件便携版（CSS/JS/图标全内联、零外部请求），由 build 生成，勿手改
├─ SimpleSearch-Light.html / SimpleSearch-Dark.html  # 两个 0 秒重定向壳，由 build 生成，勿手改
├─ .nojekyll          # GitHub Pages 用
└─ package.json
```

## 分支与提交约定

- 从主分支切出短生命周期分支：`feat/xxx`、`fix/xxx`、`docs/xxx`、`test/xxx`、`chore/xxx`。
- 一个 PR 只做一件事；顺手的大重构请单独开 PR，方便 review。
- 提交信息用 `<type>: <简述>`，`type` 取 `feat` / `fix` / `docs` / `test` / `chore` / `refactor`，简述用中文或英文都可以，说清楚做了什么：

  ```
  feat: 联想列表支持用 ↑↓ 选择
  fix: 修复含 & 的搜索词在京东断链
  docs: 重写 README 的自定义网站一节
  ```

- 生成产物（`index.html`、`SimpleSearch.html`、`SimpleSearch-Light.html`、`SimpleSearch-Dark.html`、`sw.js`）与源码**在同一个提交里**更新，不要分两次提交，否则 CI 的漂移检查会红。
- 不要提交 `node_modules/`、编辑器/系统临时文件（`.gitignore` 已覆盖）。
- 不要直接改生成产物（`index.html`、`SimpleSearch.html`、两个重定向壳、`sw.js`），所有按钮都来自 `assets/js/sites.js`；页面结构改动改 `templates/` 下的模板，这五个文件都是 `npm run build` 的产物。

## 代码风格

- **2 空格缩进、单引号、语句不加分号**（与原项目一致），用 `const` / `let`，注释用中文。
- `assets/js/` 下每个文件是一个 **IIFE + `globalThis`** 的经典脚本，只挂自己的命名空间：

  ```js
  ;(function (root) {
    'use strict'

    const SS = (root.SimpleSearch = root.SimpleSearch || {})

    // ... 实现

    SS.example = { /* ... */ }
  })(typeof globalThis !== 'undefined' ? globalThis : this)
  ```

- **`assets/js/` 里禁止 ESM**：不能出现 `import` / `export` 语句，HTML 里也不能加 `type="module"`。这是 `file://` 双击可用和测试可直接 `import()` 的前提。需要 Node 专用的脚本放 `scripts/`（`.mjs`）。
- **禁止内联事件属性**（`onclick="..."` 之类）。事件一律在 JS 里 `addEventListener`，并在 `DOMContentLoaded` 之后由 `app.js` 装配。
- 模块文件顶层不要直接操作 DOM；纯逻辑（URL 构建、联想、历史、主题解析）不读 DOM、不读真实 `localStorage`，由调用方注入，方便单测。
- **脚本加载顺序**：`templates/page.html` 里按 `sites → search → suggest → history → theme → remote → input → sites-store → sites-admin → app` 顺序挂 10 个经典脚本。新增模块文件必须同步加进模板（该文件归 lead 维护，PR 里说明让 lead 改，不要自己动）。
- **顶栏 / 抽屉 / 设置面板 / 快捷键对话框**：`#nav-toggle`、`#settings-toggle`、`#site-nav`、`#settings-panel`、`#shortcuts-dialog`、`#scrim` 的开合、遮罩联动和焦点进出（打开时焦点进面板/关闭按钮、关闭后回到触发元素）由 `app.js` 负责。`#suggest-source-toggle` 文案固定「联网联想」，状态只用 `aria-pressed`；主题模式 / 搜索引擎都是 `#theme-mode`、`#engine-mode` 分段控件（`.segmented-item[data-mode|data-engine]`），旧的 `#theme-toggle` 开关行已移除，不要再加回来。
- **视觉风格参考 MDUI 1 / Material Design 1**（主色、2px 圆角、elevation 阴影、涟漪、下划线输入框、raised button），但**全部是自研手写 CSS**：不引入 MDUI 库、不引入任何 CDN 或第三方资源。改样式时沿用 `tokens.css` 里的变量，别硬编码颜色。
- 不引入 `!important`；保留可见的 `:focus-visible` 焦点轮廓；动画要尊重 `prefers-reduced-motion: reduce`。
- **不新增第三方依赖、CDN、字体或追踪脚本**；所有核心功能必须断网可用。唯一的网络请求是**可关闭**的联网联想（见下）。
- 读写 `localStorage`、`window.open` 等可能失败的调用要放在 `try/catch` 或做能力判断里（隐私模式不能报错）。
- DOM 契约（`#search-input`、`#suggest-list`、`#nav-toggle`、`#site-nav`、`#settings-toggle`、`#settings-panel`、`#theme-mode`、`#engine-mode`、`.segmented-item`、`#shortcuts-dialog`、`#shortcuts-open`、`#shortcuts-close`、`#history-count`、`#history-clear`、`.panel-version`、`.suggest-delete`、`#suggest-source-toggle`、`#color-swatches`、`.swatch`、`#scrim`、`.nav-item`、`.nav-icon`、`.appbar-logo`、`.card-title`、`[data-site][data-featured]`、`#custom-sites-open`、`#sites-dialog`、`#sites-list`、`#site-form`、`#order-open`、`#order-dialog`、`#order-list`、`#config-export`、`#config-import-open`、`#config-import-file`、`#sites-status`、`#buttons-container .button[data-site]` 等 id/class）由 `docs/contract.md` 规定，改动前先确认没有别的模块依赖。

## 扩展联网联想数据源

联网联想的实现只在 `assets/js/remote.js`，数据源可插拔：

```js
SS.remote.provider = {
  id: 'baidu',
  label: '百度',
  buildUrl(query, callbackName) {},  // 返回 JSONP URL
  parse(text) {},                    // 解析 JSONP 回包，返回字符串数组
}
```

- 目前默认且**仅有**百度一个源（`https://suggestion.baidu.com/su?wd=<q>&cb=<fn>`），JSONP 天然绕过 CORS，`file://` 下也能用。实测 Google / DuckDuckGo 的联想接口在本机不可达、Bing 的 `osjson` 响应没有 CORS 头，所以没有接更多源。
- **想加 Google / Bing 等联想源**：先确认该源提供 JSONP（回调参数）接口，并且从目标网络环境真的可达。如果只有普通 JSON 接口，浏览器里直接请求会被 CORS 拦住，不能只改 provider 就上线；要么该源支持 JSONP，要么自建一个小代理（会多一个第三方服务，违背零依赖原则，PR 里必须说明并征得同意）。
- provider 之外的逻辑（超时、缓存、并发去重、结果合并、开关）由 `remote.js` 统一处理，换源不需要动 `suggest.js`。
- **注意**：目前联想项右侧的「百度」标注是 `input.js` 里写死的（`sublabel: '百度'`），换 provider 时还要同步改这一处；更干净的做法是让维护者把它改成读 `SS.remote.provider.label`（需要动 `input.js`，先提 issue/PR 说明）。
- 硬约束：JSONP 只允许 `document.createElement('script')` 注入，回调用完删除 script 标签和全局回调，禁止 `eval`；结果只用 `textContent` 渲染；联网联想关闭（`ss.remote = 'off'`）时**不得发出任何第三方请求**。
- 自测：在右上角设置面板里关掉「联网联想」后，浏览器 Network 面板里不应出现 `suggestion.*` 请求；断网时联想列表仍只有本地数据、搜索照常。

## 站点图标（scripts/icons.mjs）

图标是 **dev-time 数据**，不会被页面加载，也不会产生图片请求：

- `scripts/icons.mjs` 导出两组：`SITE_ICONS`（站点图标，键是站点 `id`）和 `UI_ICONS`（`menu` / `settings` / `close` 给顶栏和面板用，`logo` 是顶栏圆形徽标，`cat-all` / `cat-tech` / `cat-community` / `cat-media` / `cat-shopping` / `cat-content` 是分类导航小图标），值都是 `{ body: '<path .../>' }`（`viewBox` 可省略，默认 `0 0 24 24`）；
- `scripts/build.mjs` 把用到的图标渲染成隐藏的 `<svg class="icon-sprite">` + `<symbol id="i-<name>">` 插到 `<body>` 开头：站点按钮输出 `<svg class="button-icon" aria-hidden="true" focusable="false"><use href="#i-<siteId>"></use></svg>`，顶栏/面板输出 `#i-menu` / `#i-settings` / `#i-close`；模板里对应 `{{ICON_SPRITE}}`、`{{GROUP_NAV}}` 两个占位符；
- **它不属于运行时脚本**：不要把它加进 `templates/page.html` 的 `<script>` 列表（那 8 个才是运行时脚本）；
- 风格：24×24 viewBox、`fill="none"`、`stroke="currentColor"`、线宽 1.8、圆头；画**通用几何符号**，不要精确复制他人商标（避免商标问题）；
- **站点图标三级解析**：站点专属图标 `SITE_ICONS[site.id]` → `site.icon` 指向的 symbol（可写成 `cat-tech` 复用分类图标，必须存在于 `SITE_ICONS` / `UI_ICONS`）→ 首字符 monogram。所以不是每个站点都要画新图标。
- 体积红线：sprite（32 个 symbol：22 站点 + 3 UI + 1 logo + 6 分类）让 HTML 的增量 ≤ **12 KB**（未压缩），全站仍需 < 200 KB 预算；
- 禁止：外链 favicon 服务（如 `icons.duckduckgo.com`、Google favicon API）、外部图标库/CDN、用 emoji 冒充品牌图标——前两者会新增请求，后者跨平台不一致；
- 新增图标：站点专属图标在 `SITE_ICONS` 里加一条（键 = 站点 `id`）→ `npm run build`；UI 图标同理加进 `UI_ICONS`；
- 分类导航的小图标按**固定 id** 取：`cat-<group.id>`（例如 `cat-tech`）。加新分类时 build 只用已存在的 `cat-<id>` 图标，没有对应图标就只显示文字，需要的话在 `UI_ICONS` 补一条。
- 没配图标的站点由 build 自动渲染首字符 monogram（`<span class="button-icon button-icon-text" aria-hidden="true">首</span>`），不用手工补。

## 新增站点分组

分组也是数据驱动的，只写在 `assets/js/sites.js`：

- `SS.siteGroups` 数组定义**左侧分类导航条目**的顺序，例如 `[{ id: 'tech', label: '技术开发' }, ...]`；
- 每个站点必须带 `group`，且取值必须存在于 `SS.siteGroups`，否则 `npm run build` 会失败；分组暂时没有站点时 build 只给警告（建议别留空分组）；
- 加新分类：往 `SS.siteGroups` 追加 `{ id, label }`，把相关站点的 `group` 指过去，再 `npm run build`；导航条目顺序跟着数组顺序；
- 交互约定：`scripts/build.mjs` 从 `SS.siteGroups` 生成 `.nav-item`（首项「常用」`data-group="all"` + 各分组，放在 `#group-chips.nav-list` 里）；点「常用」只显示 `featured: true` 的站点，点分类显示该分类全部站点。`app.js` 的 `applyGroupFilter(group)` 统一更新 `aria-current`、按钮 `hidden` 和 `.card-title` 文案（常用 →「常用网站」，分类 → 分类 label）；点分类时地址栏用 `replaceState` 同步 `?cat=`（`all` 时去掉），<960px 时选中后自动收起左侧抽屉。**不持久化**，刷新以 URL 为准。无 JS 时 build 已给非 featured 按钮加 `hidden`，默认只显示 11 个常用站。

## 主题色（ss.color）

主题色是「CSS 变量 + 运行时色块」，不涉及任何图片或请求：

- 色值在 `assets/css/tokens.css` 末尾：19 组 `:root[data-color='<id>'] { --c-500 / --c-700 / --c-200 / --c-on }`；上面的语义变量（`--primary` / `--primary-bg` / `--primary-bg-hover` / `--focus-ring` / `--on-primary`）由它们派生。浅色主题 `--primary` 用 700 档、深色主题用 200 档，保证对比度。
- 颜色清单在 `assets/js/theme.js`：`SS.theme.COLORS`（19 项，`{ id, label }`，顺序 = 色块顺序）和内部的 `COLOR_500`（色块背景色）。**两处要一起改**。
- 交互：`SS.theme.applyColor(id)` 只写 `<html data-color>`（非法 id 回退 `indigo`）；`initColor()` 读 `ss.color`，并在 `#color-swatches` 里**用 JS 运行时生成** 19 个 `.swatch`（不进构建 HTML，避免 HTML 变大）；点击色块 = `applyColor` + 写 `ss.color` + 更新 `aria-pressed`。
- 首屏不闪错色：`templates/page.html` 的内联脚本（归 lead 维护）在设置 `data-theme` 的同时设置 `data-color`。
- 加一种新颜色：`tokens.css` 加一组 `--c-*`，`theme.js` 的 `COLORS` / `COLOR_500` 加同名条目，再 `npm run build`；默认色不用动。
- 不要用图片 / emoji / 第三方色板实现主题色。浅色系（黄 / 黄绿 / 浅绿 / 琥珀 / 青 / 灰）的 `--c-on` 必须用深色文字（`rgba(0, 0, 0, .87)`），否则顶栏和按钮文字会看不清。

## 深链（URL 参数）

三组参数只做「预填 / 预选」，**不自动提交、不自动跳转**，逻辑主要在 `app.js` 的启动流程里：

- `?cat=<groupId>`：选中对应分类，等价点击 `.nav-item`（同步 `aria-current`，非法 id 忽略）；点分类时用 `history.replaceState` 把地址栏同步为 `?cat=<id>`，`all`（或用「常用」）时删掉参数。`?cat=all` / 默认访问 = 常用视图（只显示 featured 站点）。
- `?q=<term>`：填入 `#search-input` 并聚焦，**不触发提交**。
- `?site=<siteId>`：选中该站点所属分类，并把焦点移到对应站点按钮，**不跳转**；非法 id 忽略。
- 组合时执行顺序固定 **cat → site → q**（q 最后，保证焦点落在输入框）。
- 处理完**不要**用 replaceState 删掉这些参数——它们是可分享状态，和 `?theme=` 老链接的语义不同。
- 项目**明确不做** `?q=%s` 默认搜索引擎自动提交，别再实现它。

## 主题三态

- 设置里的 `#theme-mode` 分段控件：`.segmented-item[data-mode="auto|light|dark"]`，`aria-pressed` 表示当前模式。
- `SS.theme` 提供 `getMode()` / `setMode(mode)` / `applyMode()`：`auto` = 跟随系统（**删除 `ss.theme`，不是写 `auto`**，`matchMedia` 变化实时跟随）；`light` / `dark` = 写 `ss.theme` 记住。
- 首屏内联脚本（`templates/page.html`，归 lead 维护）优先级：`?theme=` 老参数 → `ss.theme` 显式选择 → 系统偏好 → 浅色。
- `?theme=light|dark` 老链接仍然有效（等价 setMode 并持久化），处理后会 `history.replaceState` 去掉参数。
- 原来的 `#theme-toggle` 开关行已移除；新增/改主题逻辑只走 `#theme-mode`。

## 搜索历史管理

- 设置面板 `#history-count` 显示 `SS.history.list().length` 条；`#history-clear` 在 0 条时 `disabled`，点击调用 `SS.history.clear()` 并刷新计数。
- 联想列表里 `data-type="history"` 的项带 `.suggest-delete` 小按钮（`aria-label="删除这条历史"`、`tabindex="-1"`，点击 `stopPropagation` 后删除并重渲染）；键盘高亮历史项时按 `Delete` 删除。
- 历史写入**仍只由 `app.js` 负责**；`app.js` 在 `record()` 后派发 `ss:history-changed` 事件，`input.js` 监听它刷新计数（清空 / 单删后也自行刷新）。
- 仍然最多 10 条、新的在前、去重。

## 站点健康自检（可选，不进 CI）

- `scripts/check-sites.mjs` + `package.json` 的 `check:sites`：从 `SS.sites` 读站点，逐个请求 `home` 和把 `{q}` 换成 `test` 的 `search`，8s 超时、`redirect: 'follow'`，输出表格（站点 id / home 状态 / search 状态 / 最终 URL / 判定：OK / 重定向到首页 / 非 2xx / 网络失败）。
- 判定分级：`OK`（2xx 正常）、`WARN`（网络失败 / 反爬 401/403/429 / 被重定向到首页 / 跨域跳转，需人工确认）、`FAIL`（404/410/5xx 真坏链）。站点库有 33 个站点后 WARN 会更常见（Unsplash 401、知乎 403 反爬、京东跨域跳转等），可以用它逐个自查。
- 默认退出码 0（只报告）；`npm run check:sites -- --strict` 时**只有 FAIL** 才退出 1（WARN 不阻断）。
- **不加入 `npm run check`、不进 CI**（网络抖动会误伤）。站方改版或新增站点后可以手动跑它自查。

## PWA / 离线（Service Worker）

- `manifest.webmanifest` 是**手写静态文件**：name/short_name「简单搜索」、`start_url`/`scope` 指向站点根、`display: standalone`、192/512 图标（`assets/img/icon-192.png` / `icon-512.png`，构建前手工生成并提交）。模板 `<head>` 里有 `<link rel="manifest">` 和 `apple-touch-icon`。
- `sw.js` 是**构建产物**（`templates/sw.js` + `scripts/build.mjs`）：注入 `{{APP_VERSION}}` 与 `{{PRECACHE_LIST}}`（首页 + manifest + `assets/css`、`assets/js` 下全部文件 + favicon/PWA 图标，共 16 项）。
- 生命周期：`install` → `cache.addAll` + `skipWaiting`；`activate` → 删除非当前版本 cache + `clients.claim`；`fetch` → 只处理同源 GET，导航请求用 `ignoreSearch` 回退缓存首页，其他 cache-first → 网络 → 回填；**跨域请求直接放行、不缓存**。
- 注册：`app.js` 只在 http(s) 且支持 `serviceWorker` 时注册，失败静默；`file://` 不注册。
- **`sw.js` 必须与页面同版本**：改了静态资源后 `npm run build` 会重写 sw.js（版本号 / precache 列表），CI 的产物漂移检查包含 `sw.js`，不要手改它。

## `!bang`（站点快捷搜索）

- `SS.search.resolveBang(raw)`（纯函数）：`normalizeQuery` 后必须以 `!` 开头；token = `!` 到第一个空白之间整段（允许中文），小写后按注册表顺序**先比 `site.id` 再比 `keywords`**，精确相等才命中；**只认第一个 token**。
- 返回 `{ siteId, term, url, kind, token }`：空 term → `kind='nav'` 指向首页；`url/kind` 复用 `resolveSite`。非法输入（`!`、`!!x`、`!` 后接空白、未知 token、非字符串）返回 `null`，不抛错。
- 联想：`input.js` 的 `buildBangItem` 在合法 bang 时把第一项换成 `type:'bang'`（sublabel `!<token>`），采用即跳转、**不写历史**；表单直接提交的路径由 `app.js` 先 `resolveBang`，命中则 `preventDefault`、记录 `term` 历史再跳转。
- 新增站点 / 新关键词会自动成为 bang token，不需要额外注册（见 `docs/custom-sites.md`）。

## 搜索引擎切换

- `SS.engines` 四个：`bing` / `google` / `ddg`（`param: 'q'`）、`baidu`（`param: 'wd'`）；`SS.defaultEngine` 默认 `bing`。
- 存储键 `ss.engine`（默认 bing，非法回退）；`app.js` 启动时读存储 → `applyEngine(id, { persist: false })` → 同步 `SS.defaultEngine`、表单 `action`（`engine.search.split('?')[0]`）与 `#search-input` 的 `name`。
- `#engine-mode` 里 4 个 `.segmented-item[data-engine]`，点击后 `applyEngine` + 持久化 + `aria-pressed`；联想首项文案用当前引擎 label（形如「用 Google 搜索：…」）。
- 加引擎：`assets/js/sites.js` 的 `SS.engines` 加定义（含 `param`）→ 模板加一个 `.segmented-item`（模板归 lead）→ 同步测试/校验。

## 快捷键对话框

- 触发：`?`（即 Shift + `/`，且焦点不在 input/textarea/contenteditable）或设置里的 `#shortcuts-open`；`app.js` 的 `openShortcuts(trigger)` 记录触发元素、显示 `#shortcuts-dialog`、焦点给 `#shortcuts-close`。
- 关闭：`Esc` / `#shortcuts-close` / 点 `#scrim` → `closeShortcuts()` 隐藏并把焦点还给触发元素；与设置抽屉、分类抽屉共用 `#scrim`，同一时刻只开一个。
- 内容 9 条快捷键写在模板里；改快捷键行为时同步改模板列表（模板归 lead，PR 里说明）。

## 覆盖率（可选，不进 CI）

- `npm run coverage`：`node --test --experimental-test-coverage --test-coverage-lines=90 --test-coverage-branches=75 --test-coverage-functions=80 "tests/**/*.test.mjs"`，零依赖。
- 当前基线约 96% 行 / 80% 分支 / 87% 函数（阈值 90 / 75 / 80），低于阈值命令失败。**不进 CI 必跑**。

## 单文件便携版（SimpleSearch.html）

- 由 `scripts/build.mjs` 的 `renderSingleFile()` 从 `index.html` 生成：把 3 个 `<style>`、10 个经典脚本、防闪烁脚本全部内联，favicon 转成 data URI，并删掉 `<link rel="manifest">` 与 `apple-touch-icon`；HTML 里加 `window.__SS_SINGLE_FILE = true` 标记。
- `app.js` 看到 `__SS_SINGLE_FILE` 就不再注册 Service Worker（SW 必须是独立文件），所以单文件版**没有 PWA 安装 / 离线缓存**；它零外部请求、双击即用，但改一个字整页都要重新下载。要 PWA 用 `index.html` 多文件版。
- 版本口径：当前 **2.9.0**（停在 2.x）；`sw.js` 的缓存名与设置面板版本号都跟随 `package.json`。
- 改任何 CSS / JS / 模板后都要 `npm run build` 重新生成它；CI 的产物漂移检查包含 `SimpleSearch.html`，测试 / validate 也有「CSS/JS 全内联、无 `assets/`、无 manifest/apple-touch 引用」的断言。

## 自定义站点与配置（v2.9.0）

- **数据层 `assets/js/sites-store.js`**：纯函数 + 注入 storage，便于单测。键 `ss.customSites`（JSON 数组，最多 100 个）与 `ss.order`（常用顺序的站点 id 数组）。API：`normalizeSite` / `listCustom` / `saveCustom` / `addCustom` / `updateCustom` / `removeCustom` / `getOrder` / `saveOrder` / `merge` / `applyOrder` / `exportConfig` / `serializeConfig` / `parseImport`。
- **自定义站点字段**：`id`（自动生成 `custom-1` / `custom-<时间戳>`，仅 `[a-z0-9-]`）、`label`、`home`（https）、`search`（https 且含 `{q}`）、`group`（必须在 `SS.siteGroups` 内）、`keywords`（字符串数组）、`featured`（bool）、`icon`（可选，只允许引用已存在的 symbol 名）。校验失败返回 `{ ok: false, error }`，不抛错、不写入。
- **导入/导出**：`exportConfig` 生成 `{ app: 'SimpleSearch', schema: 1, version, customSites, order, settings }`；导出触发下载 `simplesearch-config.json`。导入只 `JSON.parse` + schema 校验（app / schema / 数组长度 / 逐项 normalize），**任一非法项整包拒绝**，不执行任何代码。
- **UI 层 `assets/js/sites-admin.js`**：只在 DOM 就绪后由 `app.js` 调 `init()`；`#sites-dialog`（列表 + 新增/编辑表单 + 导出/导入）与 `#order-dialog`（↑/↓/置顶）。所有用户数据渲染用 `textContent`，禁止 `innerHTML` 拼接。
- **`app.js` 集成**：启动时 `merge(builtin, custom)` → `applyOrder` → 注入 `SS.sites`（联想 / `!bang` 立即生效）→ `refreshSiteButtons()` 重建 `#buttons-container`（内置图标复用 build 输出的 `data-icon`，自定义站点用 `icon` 或 monogram）→ 再按当前视图套 `hidden`。两个新对话框纳入 `anyOverlayOpen` / Esc / scrim / Tab 焦点循环。
- **测试**：`tests/sites-store.test.mjs` 覆盖 normalize 合法/非法、增删改、id 冲突、order 合并、export/import 往返、坏 JSON / 坏 schema / 超量拒绝；e2e 覆盖新增 → 分类里出现、编辑、删除、导出下载、置顶后常用第一个按钮变化、刷新后自定义站点仍在。

## 新增或删除网站

只改 `assets/js/sites.js` 的 `SS.sites` 一处，然后 `npm run build` 重新生成五个产物（`index.html` + `SimpleSearch.html` + 两个重定向壳 + `sw.js`）。字段含义、`{q}` 占位规则与完整示例见 [docs/custom-sites.md](docs/custom-sites.md)。

> 个人自用加站点**优先用设置里的「我的站点」界面**（存 localStorage、不构建、刷新还在，见「自定义站点与配置」一节）；下面改 `sites.js` 的流程只用于把站点提交进仓库当内置站点。

```js
{
  id: 'example',
  label: '示例站点',
  home: 'https://example.com',
  search: 'https://example.com/search?q={q}',
  keywords: ['示例', 'demo'],
  group: 'tech',
  icon: 'cat-tech',
  featured: true,
},
```

- `id` 只能是小写字母/数字/连字符且全表唯一；`home`、`search` 必须是 `https://`；`search` 必须含 `{q}`。
- `group` **必填**，取值见 `SS.siteGroups`（目前 `tech` / `community` / `media` / `shopping` / `content`）；新分类要先登记到 `SS.siteGroups`。
- 图标可选：不配就自动 monogram；想复用分类图标写 `icon: 'cat-<group>'`；配专属图标只改 `scripts/icons.mjs`，不要引外部图标库或 CDN。
- **`featured` 可选**：`true` 才进默认的「常用」视图；不加则只在对应分类里出现。build 会给 featured 站点写 `data-featured="true"`、给非 featured 站点按钮加 `hidden` 兜底；内置的 11 个站点都带 `featured: true`。
- 新站点的 `id` / `keywords` 会自动成为 `!bang` token，不需要额外注册。
- **不要自己编码关键词**（不要手写 `%20`），`{q}` 交给代码替换。
- 新增站点不会影响 `npm test`；如果删掉了默认内置的站点，测试会失败并提示恢复（内置站点是契约的一部分）。
- 改完记得把五个生成产物（`index.html`、`SimpleSearch.html`、两个重定向壳、`sw.js`）一起提交。

## 测试与 CI

- 单元测试用 Node 内置的 `node:test`，放在 `tests/`，文件名以 `.test.mjs` 结尾，`npm test` 用 `node --test "tests/**/*.test.mjs"` 的 glob 自动发现，不用额外登记。
- `tests/sites.test.mjs` 要求默认内置的站点都存在、且相对顺序一致（站点库现为 33 个）；**新增站点不会让测试变红**，删除内置站点才会失败并提示恢复。
- 提交/开 PR 前必须本地跑通 `npm run check`（构建 + 测试 + 静态校验/产物一致性）。
- 当前测试基线：`npm test` **207 例**、`npm run validate` **29 项**、`npm run e2e` **172 项**全绿；覆盖率基线约 96.04% 行 / 80.3% 分支 / 87.17% 函数（阈值 90 / 75 / 80）。
- `npm run coverage` 可选、不进 CI 必跑；`npm run check:sites` 同样可选、需要网络。
- `npm run e2e` 用本机 Edge/Chrome（CDP）跑真实浏览器检查：单页主题解析、主题三态与主题色切换与持久化、深链 `?cat=` / `?q=` / `?site=`、`!bang` 直达、搜索引擎切换（表单 action/name/存储）、快捷键对话框（`?` 打开、Esc 关闭归还焦点）、PWA 注册与断网刷新、两个旧链接的 0 秒跳转与地址栏清理、联网联想开关 / 超时降级 / 真实百度联调、分类导航筛选与左侧抽屉开合、设置面板、搜索历史计数 / 清空 / 单条删除、设置里的版本号、图标 sprite（无额外图片请求）、960px 断点与 390px 移动端布局、`file://` 打开。CI 不跑它（需要浏览器）。
- GitHub Actions（`.github/workflows/ci.yml`）在 `push` 和 `pull_request` 时用 Node 22 跑 `npm run check`，并检查五个生成产物（`index.html`、`SimpleSearch.html`、两个重定向壳、`sw.js`）是否与 `sites.js` / 模板漂移。
- `e2e` 只断言首屏请求数 ≤16 + 零第三方，**不校验体积**（Service Worker 接管后传输字节会记 0）；体积预算由 `validate` 按磁盘产物校验（200 KB）。
- 本项目零依赖，CI 里**不需要 `npm ci` / `npm install`**。
- 只改文档或样式时也请跑一次 `npm run check`，确认没有把生成页改漂。

## PR 检查清单

- [ ] `npm run check` 本地全绿
- [ ] 改动范围内没有手工编辑生成产物（`index.html`、两个重定向壳、`sw.js` 都由 `npm run build` 产出，且已随源码一起提交）
- [ ] 新增/修改的功能在浅色与夜间两套主题下都正常，键盘可操作
- [ ] 单页主题解析正确：`?theme=` → 上次选择 → 系统偏好 → 浅色；两个老 URL 能跳到首页并应用对应主题
- [ ] 关闭「联网联想」后无第三方请求、断网可用；开启时请求失败/超时不阻塞搜索
- [ ] 新增站点带了 `group`；左侧分类导航能正确筛选、`aria-current` 只有一个、刷新回「常用」；新增站点默认只在分类里，`featured: true` 才进常用视图
- [ ] 桌面 ≥960px 侧栏常驻、<960px 变抽屉且汉堡可开合（点遮罩 / Esc / 选中分类后收起）；没有 `#site-footer`
- [ ] 设置面板可从右上角打开；联网联想开关文案固定、状态只看 `aria-pressed`；主题模式是「跟随系统 / 浅色 / 深色」三段控件；关闭后焦点回到设置按钮
- [ ] 19 个主题色色块可切换、刷新后保持、首屏不闪错色；切换不产生任何网络请求
- [ ] 顶栏 logo 与分类导航小图标来自内联 sprite（没有新增图片请求）
- [ ] 深链 `?cat=` / `?q=` / `?site=` 只预填 / 预选，不自动提交、不跳转；点分类时地址栏同步 `?cat=`
- [ ] 主题三态：跟随系统不写 `ss.theme` 且实时跟随；浅色 / 深色会记住；旧的 `#theme-toggle` 已移除
- [ ] 搜索历史计数 / 清空（0 条禁用）与单条删除（`.suggest-delete` 或 `Delete`）正常
- [ ] 设置面板底部版本号来自 `package.json`（改版本号后 `npm run build` 会自动更新）
- [ ] PWA：`manifest.webmanifest` 可解析、`sw.js` 与页面同版本；http(s) 下能注册、断网刷新可用；`file://` 不注册
- [ ] `!bang`：`!gh rust` / `!b站 视频` 能直达；未知 token 当普通搜索；只认第一个 token
- [ ] 搜索引擎四选一可切换、`ss.engine` 持久化、表单 action/name 与联想首项文案同步
- [ ] 快捷键对话框：`?` 打开、9 条快捷键、Esc / 关闭按钮 / 遮罩关闭并归还焦点
- [ ] `npm run coverage` 通过阈值（90 / 75 / 80）
- [ ] 单文件便携版 `SimpleSearch.html` 已随源码 build：CSS/JS 全内联、无 `assets/` / manifest / apple-touch-icon 引用、零外部请求（约 196.6 KB / gzip 48.0 KB，上限 260 KB）
- [ ] 站点图标来自内联 sprite（没有新增图片请求）；没配图标的站点显示 monogram；新增站点可用 `icon: 'cat-<group>'` 复用分类图标，sprite 增量 ≤12 KB
- [ ] 直接双击 `index.html`（`file://`）无报错
- [ ] `README.md` / `docs/custom-sites.md` / `docs/CHANGELOG.md` 等受影响的文档已同步
- [ ] PR 描述里写清楚改动内容、验证方式和截图（如涉及视觉变化）

## 有疑问？

开一个 [Issue](https://github.com/breathiness/SimpleSearch/issues) 说明你的想法或复现步骤，比直接大改更容易被接受。
