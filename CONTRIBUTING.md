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
| `npm run build` | 由 `templates/page.html`、`templates/redirect.html` + `assets/js/sites.js` 生成 `index.html` 与两个重定向壳（**改完站点或模板后必须跑**） |
| `npm test` | 运行 `node --test "tests/**/*.test.mjs"`，跑全部单元测试 |
| `npm run validate` | 静态检查 + 生成产物是否最新（内部会跑 `node scripts/build.mjs --check`） |
| `npm run check` | `build && test && validate`，提交前与 CI 都跑这个 |
| `npm run serve` | 零依赖本地静态服务器，默认 <http://127.0.0.1:8080/>（可用 `PORT` 环境变量改端口） |
| `npm run e2e` | 可选：用本机 Edge/Chrome 跑真实浏览器端到端检查（没装浏览器会跳过，CI 不跑），截图输出到已 gitignore 的 `artifacts/` |

## 目录结构

```
SimpleSearch/
├─ assets/
│  ├─ css/            # tokens.css / base.css / input.css
│  ├─ img/            # favicon.svg
│  └─ js/             # 经典脚本（sites / search / suggest / history / theme / remote / input / app）
├─ docs/              # 契约、自定义站点指南、更新日志
├─ scripts/           # build.mjs / icons.mjs（dev-time 图标数据）/ serve.mjs / validate.mjs / e2e.mjs
├─ templates/         # page.html（真实页：顶栏 / 分类导航 / 卡片 / 设置抽屉 + 图标 sprite）/ redirect.html（两个重定向壳）
├─ tests/             # node:test 单元测试
├─ .github/workflows/ # ci.yml（GitHub Actions）
├─ index.html         # 唯一真实页面，由 build 生成，勿手改
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

- 生成产物（`index.html`、`SimpleSearch-Light.html`、`SimpleSearch-Dark.html`）与源码**在同一个提交里**更新，不要分两次提交，否则 CI 的漂移检查会红。
- 不要提交 `node_modules/`、编辑器/系统临时文件（`.gitignore` 已覆盖）。
- 不要直接改三个生成 HTML，所有按钮都来自 `assets/js/sites.js`；页面结构改动改 `templates/` 下的模板。`index.html` 和两个重定向壳都是 `npm run build` 的产物。

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
- **脚本加载顺序**：`templates/page.html` 里按 `sites → search → suggest → history → theme → remote → input → app` 顺序挂 8 个经典脚本。新增模块文件必须同步加进模板（该文件归 lead 维护，PR 里说明让 lead 改，不要自己动）。
- **顶栏 / 抽屉 / 设置面板**：`#nav-toggle`、`#settings-toggle`、`#site-nav`、`#settings-panel`、`#scrim` 的开合、遮罩联动和焦点进出（打开时焦点进面板、关闭后回到设置按钮）由 `app.js` 负责。两个开关 `#theme-toggle` / `#suggest-source-toggle` 的**文案固定**（永远是「夜间模式」「联网联想」），状态只用 `aria-pressed` 表达——`theme.js` / `input.js` 不得再改它们的 `textContent`。
- **视觉风格参考 MDUI 1 / Material Design 1**（主色、2px 圆角、elevation 阴影、涟漪、下划线输入框、raised button），但**全部是自研手写 CSS**：不引入 MDUI 库、不引入任何 CDN 或第三方资源。改样式时沿用 `tokens.css` 里的变量，别硬编码颜色。
- 不引入 `!important`；保留可见的 `:focus-visible` 焦点轮廓；动画要尊重 `prefers-reduced-motion: reduce`。
- **不新增第三方依赖、CDN、字体或追踪脚本**；所有核心功能必须断网可用。唯一的网络请求是**可关闭**的联网联想（见下）。
- 读写 `localStorage`、`window.open` 等可能失败的调用要放在 `try/catch` 或做能力判断里（隐私模式不能报错）。
- DOM 契约（`#search-input`、`#suggest-list`、`#nav-toggle`、`#site-nav`、`#settings-toggle`、`#settings-panel`、`#scrim`、`.nav-item`、`.switch-row`、`#buttons-container .button[data-site]` 等 id/class）由 `docs/contract.md` 规定，改动前先确认没有别的模块依赖。

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

- `scripts/icons.mjs` 导出两组：`SITE_ICONS`（站点图标，键是站点 `id`）和 `UI_ICONS`（`menu` / `settings` / `close`，给顶栏和设置面板用），值都是 `{ body: '<path .../>' }`（`viewBox` 可省略，默认 `0 0 24 24`）；
- `scripts/build.mjs` 把用到的图标渲染成隐藏的 `<svg class="icon-sprite">` + `<symbol id="i-<name>">` 插到 `<body>` 开头：站点按钮输出 `<svg class="button-icon" aria-hidden="true" focusable="false"><use href="#i-<siteId>"></use></svg>`，顶栏/面板输出 `#i-menu` / `#i-settings` / `#i-close`；模板里对应 `{{ICON_SPRITE}}`、`{{GROUP_NAV}}` 两个占位符；
- **它不属于运行时脚本**：不要把它加进 `templates/page.html` 的 `<script>` 列表（那 8 个才是运行时脚本）；
- 风格：24×24 viewBox、`fill="none"`、`stroke="currentColor"`、线宽 1.8、圆头；画**通用几何符号**，不要精确复制他人商标（避免商标问题）；
- 体积红线：sprite（11 个站点图标 + 3 个 UI 图标）让 HTML 的增量 ≤ 6 KB（未压缩），全站仍需 < 100 KB 预算；
- 禁止：外链 favicon 服务（如 `icons.duckduckgo.com`、Google favicon API）、外部图标库/CDN、用 emoji 冒充品牌图标——前两者会新增请求，后者跨平台不一致；
- 新增图标：站点图标在 `SITE_ICONS` 里加一条（键 = 站点 `id`）→ `npm run build`；UI 图标同理加进 `UI_ICONS`；
- 没配图标的站点由 build 自动渲染首字符 monogram（`<span class="button-icon button-icon-text" aria-hidden="true">首</span>`），不用手工补。

## 新增站点分组

分组也是数据驱动的，只写在 `assets/js/sites.js`：

- `SS.siteGroups` 数组定义**左侧分类导航条目**的顺序，例如 `[{ id: 'tech', label: '技术开发' }, ...]`；
- 每个站点必须带 `group`，且取值必须存在于 `SS.siteGroups`，否则 `npm run build` 会失败；分组暂时没有站点时 build 只给警告（建议别留空分组）；
- 加新分类：往 `SS.siteGroups` 追加 `{ id, label }`，把相关站点的 `group` 指过去，再 `npm run build`；导航条目顺序跟着数组顺序；
- 交互约定：`scripts/build.mjs` 从 `SS.siteGroups` 生成 `.nav-item`（`全部` + 各分组，放在 `#group-chips.nav-list` 里），`app.js` 点击时按 `data-group` 隐藏其它站点按钮，并同步 `aria-current`（导航项语义，**不是** `aria-pressed`）；<960px 时选中分类后自动收起左侧抽屉。**不写 URL、不持久化**，刷新回「全部」。无 JS 时筛选不可用，但所有站点按钮仍然显示。

## 新增或删除网站

只改 `assets/js/sites.js` 的 `SS.sites` 一处，然后 `npm run build` 重新生成三个产物（`index.html` + 两个重定向壳）。字段含义、`{q}` 占位规则与完整示例见 [docs/custom-sites.md](docs/custom-sites.md)。

```js
{
  id: 'example',
  label: '示例站点',
  home: 'https://example.com',
  search: 'https://example.com/search?q={q}',
  keywords: ['示例', 'demo'],
  group: 'tech',
},
```

- `id` 只能是小写字母/数字/连字符且全表唯一；`home`、`search` 必须是 `https://`；`search` 必须含 `{q}`。
- `group` **必填**，取值见 `SS.siteGroups`（目前 `tech` / `community` / `media` / `shopping` / `content`）；新分类要先登记到 `SS.siteGroups`。
- 图标可选：不配就自动 monogram；配图标只改 `scripts/icons.mjs`，不要引外部图标库或 CDN。
- **不要自己编码关键词**（不要手写 `%20`），`{q}` 交给代码替换。
- 新增站点不会影响 `npm test`；如果删掉了默认内置的站点，测试会失败并提示恢复（内置站点是契约的一部分）。
- 改完记得把三个生成的 HTML 一起提交。

## 测试与 CI

- 单元测试用 Node 内置的 `node:test`，放在 `tests/`，文件名以 `.test.mjs` 结尾，`npm test` 用 `node --test "tests/**/*.test.mjs"` 的 glob 自动发现，不用额外登记。
- `tests/sites.test.mjs` 要求默认内置的 11 个站点都存在、且相对顺序一致；**新增站点不会让测试变红**，删除内置站点才会失败并提示恢复。
- 提交/开 PR 前必须本地跑通 `npm run check`（构建 + 测试 + 静态校验/产物一致性）。
- 当前测试基线：`npm test` **136 例**、`npm run validate` **16 项**、`npm run e2e` **92 项**全绿。
- `npm run e2e` 用本机 Edge/Chrome（CDP）跑真实浏览器检查：单页主题解析（`?theme=` → 存储 → 系统 → 浅色）、两个旧链接的 0 秒跳转与地址栏清理、联网联想开关 / 超时降级 / 真实百度联调、分类导航筛选与左侧抽屉开合、设置面板与 MD1 开关、图标 sprite（无额外图片请求）、960px 断点与 390px 移动端布局、`file://` 打开。CI 不跑它（需要浏览器）。
- GitHub Actions（`.github/workflows/ci.yml`）在 `push` 和 `pull_request` 时用 Node 22 跑 `npm run check`，并检查三个生成产物是否与 `sites.js` / 模板漂移。
- 本项目零依赖，CI 里**不需要 `npm ci` / `npm install`**。
- 只改文档或样式时也请跑一次 `npm run check`，确认没有把生成页改漂。

## PR 检查清单

- [ ] `npm run check` 本地全绿
- [ ] 改动范围内没有手工编辑三个生成 HTML（它们由 `npm run build` 产出，且已随源码一起提交）
- [ ] 新增/修改的功能在浅色与夜间两套主题下都正常，键盘可操作
- [ ] 单页主题解析正确：`?theme=` → 上次选择 → 系统偏好 → 浅色；两个老 URL 能跳到首页并应用对应主题
- [ ] 关闭「联网联想」后无第三方请求、断网可用；开启时请求失败/超时不阻塞搜索
- [ ] 新增站点带了 `group`；左侧分类导航能正确筛选、`aria-current` 只有一个、刷新回「全部」
- [ ] 桌面 ≥960px 侧栏常驻、<960px 变抽屉且汉堡可开合（点遮罩 / Esc / 选中分类后收起）；没有 `#site-footer`
- [ ] 设置面板可从右上角打开，两个开关文案固定、状态只看 `aria-pressed`，关闭后焦点回到设置按钮
- [ ] 站点图标来自内联 sprite（没有新增图片请求）；没配图标的站点显示 monogram
- [ ] 直接双击 `index.html`（`file://`）无报错
- [ ] `README.md` / `docs/custom-sites.md` / `docs/CHANGELOG.md` 等受影响的文档已同步
- [ ] PR 描述里写清楚改动内容、验证方式和截图（如涉及视觉变化）

## 有疑问？

开一个 [Issue](https://github.com/breathiness/SimpleSearch/issues) 说明你的想法或复现步骤，比直接大改更容易被接受。
