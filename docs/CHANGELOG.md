# 更新日志

本项目的对用户可见变化都记录在这里。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：主版本号在页面结构/使用方式有明显变化时递增。

## 2.8.0（未发布）

分类导航改成「常用 + 分类」两段式视图：默认只看常用站，点分类再展开该分类全部站点。

### 变更

- **导航首项「全部」改名「常用」**：只显示最初内置的 11 个常用站点；33 个站点不再一次性平铺，找新站请点对应分类。
- **点分类显示该分类全部站点**：技术开发 7 个、社区问答 6 个、影音游戏 8 个、购物 6 个、素材资讯 6 个。
- **内容区卡片标题跟随视图**：常用 →「常用网站」，分类 → 分类名（如「技术开发」）。
- **深链 `?cat=` 继续有效**：`?cat=tech` 进入即展开技术开发；`?cat=all` 或不带参数 = 常用视图（地址栏不带 cat）。
- **无 JS 兜底**：build 直接给非 featured 按钮加 `hidden`，默认也只显示 11 个常用站。
- `sites.js` 新增可选字段 `featured: true`：内置 11 个站点都有；新增站点默认只在分类里，想进常用视图才加。

### 工程

- `sites.js` 内置 11 站加 `featured: true`；build 渲染 `data-featured="true"` 与非 featured 按钮的 `hidden`。
- `app.js` 的 `applyGroupFilter` 同步导航 `aria-current`、站点按钮 `hidden` 和 `.card-title` 文案；启动与深链处理后都会跑一次（默认 `all`）。
- 体积：多文件版单页 **147.9 KB 未压缩 / gzip 42.8 KB**（预算 156 KB）；单文件版 **148.1 KB / gzip 36.9 KB**；sprite 仍是 32 symbol / 8.23 KB（gzip 1.34 KB）。
- 测试基线：`npm test` **176 例**、`npm run validate` **27 项**、`npm run e2e` **155 项**全绿。

## 2.7.0（未发布）

站点库扩充：从 11 个扩到 33 个，每个分类补齐 4–5 个站点。

### 新增

- 技术开发 +StackOverflow、MDN、Gitee、npm、掘金；社区问答 +豆瓣、微博、V2EX、Reddit；影音游戏 +YouTube、抖音、爱奇艺、腾讯视频、Twitch；购物 +天猫、拼多多、闲鱼、亚马逊；素材资讯 +Pexels、Pixabay、36氪、站酷。共 **33 个站点**，「全部」按注册表顺序展示（最早内置的 11 个在前），分类视图只显示该组。
- 新站点的 `!bang` token 自动可用（`id` 与 `keywords`），例如 `!so rust`、`!youtube cats`；keyword 重复时按注册表顺序命中靠前站点（`!购物` → 淘宝、`!视频` → 哔哩哔哩）。
- 图标三级策略：11 个新站点画了专属图标，另外 11 个用 `icon: 'cat-<group>'` 复用分类图标，最后兜底首字符 monogram；sprite 变为 32 个 symbol（22 站点 + 3 UI + 1 logo + 6 分类），红线 8 KB → **12 KB**。

### 工程

- `assets/js/sites.js` 追加 22 个站点（最早 11 个内置站点的顺序不变），字段含 `group` / `keywords` / 可选 `icon`。
- build 的图标解析顺序：`SITE_ICONS[site.id]` → `site.icon` 指向的 symbol → 首字符 monogram。
- 体积：多文件版单页 **146.4 KB 未压缩 / gzip 42.4 KB**（预算 136 → **156 KB**）；单文件版 **146.7 KB / gzip 36.5 KB**；sprite **8.23 KB / gzip 1.34 KB**（红线 12 KB）。
- 测试基线：`npm test` **174 例**、`npm run validate` **26 项**、`npm run e2e` **153 项**全绿。

## 2.6.1（未发布）

### 修复

- **侧栏站点分类点击无效**：`[hidden]{display:none}` 与 `.button{display:inline-flex}` 特异性相同且后者在后，导致 `button.hidden = true` 后按钮仍在渲染——点分类只改了 `aria-current`，站点列表视觉上没动。改为 `:root [hidden]{display:none}`（特异性 0,1,1，不是 `!important`），分类筛选恢复真实隐藏；清除按钮、联想列表、设置抽屉等其它 `hidden` 控件一并受益。
- 测试补齐：E2E 新增「渲染层可见性」断言（不再只信 DOM 的 `hidden` 属性），并覆盖单文件便携版里的分类筛选。
## 2.6.0（未发布）

PWA 离线、`!bang` 快捷搜索、搜索引擎切换、快捷键说明、覆盖率门槛和单文件便携版。版本口径特意停在 2.x。

### 新增

- **PWA / 离线**：新增 `manifest.webmanifest`（name「简单搜索」、`standalone`、192/512 图标）和 `sw.js`（构建时注入版本号 2.6.0 与 16 项 precache）。安装后可独立窗口打开，**断网刷新仍可用**；`install` 预缓存、`activate` 清旧缓存并 `claim`、`fetch` 只处理同源 GET（跨域请求直接放行、不缓存）；升级版本旧缓存自动清理；`file://` 下不注册 SW。
- **`!bang` 站点快捷搜索**：`!<token> [搜索词]`，token 匹配站点 `id` 或 `keywords`（支持中文，如 `!b站 视频`、`!淘宝 键盘`），**只认第一个 token**；`!gh` 不带词直接打开 GitHub 首页；未知 token 当普通搜索；联想列表首项会给出「在 GitHub 搜索：rust」，选中即直达。
- **搜索引擎切换**：Bing / Google / DuckDuckGo / 百度四选一（默认 Bing），记住 `ss.engine`；切换后表单 `action` 与参数名自动适配（百度用 `wd`），回车 / 「搜索」立即用新引擎，联想首项文案跟着变。
- **快捷键说明对话框**：按 `?`（焦点不在输入框）或设置里「查看」打开 MDUI 对话框，列出 9 条快捷键；`Esc` / 关闭按钮 / 遮罩关闭，并把焦点还给触发元素。
- **覆盖率**：`npm run coverage`（Node 内置覆盖率 + 阈值 90% 行 / 75% 分支 / 80% 函数），零依赖、**不进 CI 必跑**。
- **单文件便携版 `SimpleSearch.html`**：`npm run build` 的第 5 个产物。CSS / JS / 图标全部内联（3 个 `<style>`、8 个 JS + 防闪烁脚本 + `window.__SS_SINGLE_FILE` 标记），favicon 改成 data URI，移除 `manifest.webmanifest` 与 `apple-touch-icon`，`app.js` 在单文件模式下不注册 Service Worker。**零外部请求**，双击即用、可单文件分享；体积 **132.6 KB（135,750 B）/ gzip 34.2 KB**。取舍：没有 PWA 安装 / 离线缓存（Service Worker 必须是独立文件），改一个字整页都要重新下载——要 PWA 用 `index.html` 多文件版。
- localStorage 变为 **5 个键**（新增 `ss.engine`）。

### 工程

- 构建产物变为 5 个：`index.html` + `SimpleSearch.html`（单文件便携版）+ `sw.js` + 两个重定向壳；CI 的产物漂移检查把 `SimpleSearch.html` 和 `sw.js` 一起 `git diff`。
- `app.js` 通过 `window.__SS_SINGLE_FILE` 判断单文件模式，跳过 Service Worker 注册；单文件版不引用任何 `assets/` 文件（favicon 为 data URI）。
- `SS.engines` 扩为 4 个（带 `param`）；`SS.search.resolveBang` 为纯函数；`app.js` 负责注册 SW、搜索引擎切换、快捷键对话框与 `?` 触发、深链兼容。
- 体积：多文件版单页静态资源约 130 KB 未压缩 / gzip 约 39 KB（预算 136 KB）；单文件版 **132.6 KB / gzip 34.2 KB**。`sw.js` 约 2.5 KB、`manifest.webmanifest` 665 B、PWA 图标约 21 KB **不计入首屏**。首屏 14 个请求、零第三方（其中一次是浏览器按 `apple-touch-icon` 抓取 PWA 图标，属预期）。
- `e2e` 的首屏断言改为「请求数 ≤16 + 零第三方」，不再断言传输体积（Service Worker 接管后 `transferSize` 会归零）；体积预算由 `validate` 按磁盘产物校验。
- 测试基线：`npm test` **172 例**、`npm run validate` **25 项**、`npm run e2e` **149 项**全绿；覆盖率约 **96.04% 行 / 80.3% 分支 / 87.17% 函数**（阈值 90 / 75 / 80）。
- 文档同步：README（PWA、`!bang`、搜索引擎、快捷键、单文件便携版与取舍、隐私 5 键、体积/首屏口径）、CONTRIBUTING（PWA / `!bang` / 引擎 / 快捷键 / 覆盖率 / 单文件生成流程）、`docs/custom-sites.md`（`!bang` token、precache、五产物）。

## 2.5.0（未发布）

深链、主题三态、搜索历史管理、版本号与可选的站点自检。按需求**不做**「把本站设为浏览器默认搜索引擎（`?q=%s` 自动提交）」。

### 新增

- **深链（只预填 / 预选，不自动跳转）**：`?cat=<id>` 进入即选中分类，点分类时地址栏同步 `?cat=`（`all` 时去掉），分类视图可收藏；`?q=<term>` 预填搜索框并聚焦、**不自动提交**；`?site=<id>` 选中该站分类并聚焦站点按钮、**不跳转**。三者可组合，顺序为 cat → site → q。
- **主题三态**：设置里的「主题模式」改成「跟随系统 / 浅色 / 深色」分段控件；选「跟随系统」会删除 `ss.theme`（不会写 `auto`）、实时响应系统深浅色变化，选浅色 / 深色才记住。原来的「夜间模式」开关行移除；`?theme=` 老链接仍然有效。
- **搜索历史管理**：设置里显示「搜索历史 N 条」+「清空」（0 条时禁用）；联想列表的历史项带删除按钮，键盘高亮后按 `Delete` 也能删。历史仍最多 10 条、仍只由页面记录。
- **版本号**：设置面板底部显示「简单搜索 v2.5.0」，构建时从 `package.json` 注入。
- **站点健康自检**：新增可选命令 `npm run check:sites`（需网络、**不进 CI**），逐个检查站点 `home` / `search` 并输出 OK / WARN / FAIL 表格（实测当前 11 站 OK 8 / WARN 3 / FAIL 0，WARN 来自 Unsplash 401、知乎 403 反爬、京东跨域跳转）；`--strict` 时只有 FAIL 退出 1。

### 工程

- `templates/page.html` 新增 `#theme-mode` 分段控件、搜索历史行（`#history-count` / `#history-clear`）、`.panel-version`，移除 `#theme-toggle`；build 新增 `{{APP_VERSION}}` 占位符（从 `package.json` 注入）。
- `theme.js` 新增 `getMode()` / `setMode()` / `applyMode()`（`auto` 不写 `ss.theme`，`light`/`dark` 持久化）；`input.js` 历史项删除按钮与 `Delete` 键、清空后刷新计数；`app.js` 处理深链与 `?cat=` 的 `replaceState` 同步、派发 `ss:history-changed`。
- 新增 `scripts/check-sites.mjs` + `check:sites` 脚本（默认只报告，`--strict` 失败退 1）；**不加入 `npm run check` / CI**。
- 体积：单页静态资源约 115.5 KB 未压缩 / gzip 约 35 KB（预算 128 KB，gzip 是真实成本口径）；首屏 12 个请求，e2e 实测传输约 118 KB（含协议开销），没有任何图片请求。
- 测试基线：`npm test` **156 例**、`npm run validate` **19 项**、`npm run e2e` **121 项**全绿。
- 文档同步：README（深链、主题三态、历史管理、版本号、命令表、隐私）、CONTRIBUTING（深链/主题三态/历史管理/自检流程）、`docs/custom-sites.md`（深链与 check:sites 自查）。

## 2.4.0（未发布）

主题色可选（MDUI 19 组主色）+ 顶栏圆形 logo + 分类导航小图标。

### 新增

- **19 组主题色**：设置抽屉新增「主题色」一行，19 个色块（红 / 粉 / 紫 / 深紫 / 靛蓝 / 蓝 / 浅蓝 / 青 / 蓝绿 / 绿 / 浅绿 / 黄绿 / 黄 / 琥珀 / 橙 / 深橙 / 棕 / 灰 / 蓝灰）；点一下顶栏、选中态、搜索按钮、开关、焦点环全部换主色，选择写入 `ss.color`（默认靛蓝，刷新后保持）。浅色主题用 700 档、深色主题用 200 档保证对比度；黄 / 黄绿 / 浅绿 / 琥珀 / 青 / 灰等浅色系自动改用深色文字。实现只是 CSS 变量（一层色值 + 一层语义变量），**零额外请求**；色块由 JS 运行时生成，不进构建 HTML。
- **顶栏圆形 logo**：标题左侧新增内联 SVG 圆形徽标（圆环 + 放大镜，通用几何而非商标），零请求。
- **分类导航小图标**：全部（九宫格）、技术开发（终端）、社区问答（对话气泡）、影音游戏（播放电视）、购物（手提袋）、素材资讯（相机），全部内联进 sprite。

### 工程

- sprite 从 14 个 symbol 扩到 **21 个**（11 站点 + 3 UI + 1 logo + 6 分类），**5.57 KB 未压缩 / gzip 0.97 KB**，仍然零图片请求；sprite 红线 ≤ 8 KB。
- 体积：单页静态资源 **107.5 KB 未压缩 / gzip 35.3 KB**（预算 110 KB，达标）；首屏实测 12 个请求、传输约 109.6 KB（含协议开销），没有任何图片请求。
- `tokens.css` 新增 19 组 `:root[data-color='<id>']`；`theme.js` 新增 `SS.theme.COLORS` / `COLOR_500` / `applyColor` / `initColor` 与 `ss.color`；`<html>` 静态带 `data-color="indigo"`，首屏内联脚本在样式表前按存储覆盖，不会先闪默认色。
- 测试基线：`npm test` **147 例**、`npm run validate` **17 项**、`npm run e2e` **102 项**全绿。
- 文档同步：README（主题色、logo、分类图标、隐私 4 键、体积）、CONTRIBUTING（主题色与图标流程）、`docs/custom-sites.md`。

## 2.3.0（未发布）

页面骨架改成 MDUI 1 文档站样式：主色顶栏 + 左侧分类导航 + 内容卡片 + 右侧设置抽屉；原来的页脚移除。

### 变更

- **文档站式骨架**：顶部主色应用栏（左侧汉堡仅 <960px 显示、标题「简单搜索」、右侧设置图标）；左侧 240px 分类导航（组标题「站点分类」+ 竖排条目，选中项有底色、主色文字和左侧 3px 主色条）；内容区两张卡片「搜索」「常用网站」。
- **分类从按钮墙上的 chip 行改成左侧竖向导航**：宽屏常驻，<960px 变成左侧抽屉（汉堡打开，点遮罩 / `Esc` / 选中分类后收起），选中语义改用 `aria-current`；仍然不记忆、不写 URL，刷新回「全部」。
- **移除页脚**：原来页脚里的两个开关搬进右上角设置图标打开的**右侧设置抽屉**，改成两个 MD1 开关行「夜间模式」「联网联想」，文案固定、状态只用 `aria-pressed` 表达；再加一个 GitHub 仓库链接。点关闭按钮 / 遮罩 / `Esc` 收起，打开时焦点进面板、关闭后回设置按钮；分类抽屉与设置抽屉共用遮罩，同时最多开一个。

### 工程

- `scripts/icons.mjs` 增加 `UI_ICONS`（`menu` / `settings` / `close`），build 把站点图标与 UI 图标塞进同一个内联 sprite（14 个 symbol：11 站点 + 3 UI，≤ 6 KB 未压缩），依旧零图片请求。
- 体积：单页静态资源约 95 KB 未压缩 / gzip 约 33 KB（预算 100 KB）；其中内联图标 sprite 约 3.8 KB（gzip 约 0.85 KB）。
- 测试基线：`npm test` 136 例、`npm run validate` 16 项、`npm run e2e` 92 项全绿。
- `templates/page.html` 重构为 appbar / shell / 卡片 / scrim / settings-panel；新增 `{{GROUP_NAV}}` 占位符；`app.js` 负责抽屉开合、焦点管理、`aria-expanded` / `aria-current` 同步；`theme.js` / `input.js` 不再改开关文案。
- 设置面板首次打开时遮罩不显示、`Esc` 无法关闭的时序问题在发布前修复（`app.js` 的遮罩判断改为直接读面板 `hidden` 状态，不再依赖动画 class）。
- 测试与 E2E 更新（顶栏、侧栏、抽屉、设置面板、两个开关、无 `#site-footer`、960px 断点 / 390px 移动端）。
- 文档同步：README（布局、分类导航、设置面板、键盘表、体积）、CONTRIBUTING（DOM 契约、UI 图标、分组导航流程）、`docs/custom-sites.md`（分类导航措辞）。

## 2.2.0（未发布）

站点分类 + 站点图标：更好找站点，同时把「加图标」的请求/体积成本压到接近零。

### 新增

- **站点分类**：按钮墙上方新增一行 MD1 chip（全部 / 技术开发 / 社区问答 / 影音游戏 / 购物 / 素材资讯），点一下只显示该分组站点，不重排 DOM；不写 URL、不持久化，刷新回「全部」。无 JS 时整行 chip 隐藏（`#group-chips-wrap` 初始 `hidden`，由 `app.js` 打开），不会出现点了没反应的死 chip。
- **站点图标**：每个站点按钮前加图标，全部内联进 `index.html` 的隐藏 SVG sprite（`<symbol id="i-github">` + `<use href="#i-github">`），**零图片请求、不使用外部 favicon 服务**；`currentColor` 描边跟随主题文字色；没配图标的站点自动退化为首字符 monogram（`.button-icon-text`）。
- 图标数据在 `scripts/icons.mjs`（dev-time 资产，不进运行时、不被页面加载）；加 / 换图标只改这一处再 `npm run build`。
- 分组数据在 `assets/js/sites.js`：`SS.siteGroups`（5 项，顺序即 chip 顺序）+ 每个站点新增必填 `group` 字段。

### 工程

- 体积：单页静态资源 **86.2 KB 未压缩 / gzip 30.7 KB**（预算 90 KB）。其中内联图标 sprite **3.03 KB 未压缩 / gzip 0.75 KB**。**加图标 + 分类后真实传输只增加约 2.1 KB gzip**（未压缩 +9.2 KB，主要是压缩率极高的 SVG sprite 与 chip 行）。
- `scripts/build.mjs` 新增图标 sprite 与分类 chip 渲染（`{{ICON_SPRITE}}` / `{{GROUP_CHIPS}}` 占位符）和分组校验：缺 `group` / `group` 不存在会失败，空分组只警告；`templates/page.html` 新增 `#group-chips-wrap[hidden]` + `#group-chips`；`app.js` 新增分类筛选（`.chip` 也加入涟漪目标）并对无 JS 场景兜底。
- 测试基线：`npm test` **129 例**、`npm run validate` **15 项**、`npm run e2e` **72 项**全绿。
- 文档同步：README（分类说明、图标方案与取舍、体积对比、自定义网站字段）、CONTRIBUTING（图标与分组流程）、`docs/custom-sites.md`（`group` 字段、图标可选、新增分类）。

## 2.1.0（未发布）

单页主题 + 联网联想：明暗切换合并进同一个页面（旧链接自动跳转），并在本地联想之外增加**可一键关闭**的百度联网联想。

### 变更

- **明暗切换合并到单页**：唯一的真实页面 `index.html` 按「`?theme=` 参数 → 上次的选择（`ss.theme`）→ 系统深色偏好 → 浅色」决定主题；页脚一键切换并记住；没有手动选过时，系统深浅色变化会实时跟随；手动切换过之后以你的选择为准。
- **两个旧链接变成 0 秒重定向壳**：`SimpleSearch-Light.html` → `index.html?theme=light`，`SimpleSearch-Dark.html` → `index.html?theme=dark`（`meta refresh` + `location.replace` + `<link rel="canonical">`，无 JS 也能跳），老书签不失效。
- 检测到 `?theme=` 时会应用并持久化该主题，再用 `history.replaceState` 从地址栏去掉参数，分享出去的链接不会固定死主题。
- 首屏防闪烁内联脚本同步新的解析优先级，避免切主题时闪一下。
- 站点列表不再分「浅色页 / 夜间页」两份，只有一套页面 + 两套 CSS 变量。

### 新增

- **联网联想（默认开启）**：输入时把关键词发给百度联想（JSONP，`suggestion.baidu.com`），结果排在本地站点匹配之后、右侧标注「百度」；联想列表仍是最多 8 条。
- 页脚新增「联网联想」开关（开启显示「联网联想：开」、关闭显示「联网联想：关闭」，写入 `ss.remote`）：关闭后**零第三方请求**，只剩本地联想，完全离线可用。
- 700ms 超时或请求失败会静默退回本地联想，不影响搜索与键盘操作；140ms 防抖；同词并发只发一次；结果缓存 10 分钟（最多 100 条）；输入已变化时旧结果直接丢弃。
- 隐私说明：联网联想开启时关键词会发给百度，关闭后完全离线；本地只存 `ss.theme` / `ss.history` / `ss.remote` 三个键，无统计、无追踪。

### 工程

- 构建产物从 2 个变成 3 个：`index.html`（唯一真实页）+ 两个重定向壳；新增 `templates/redirect.html` 与 `assets/js/remote.js`。
- 体积：单页静态资源合计约 77 KB（未压缩）/ gzip 后约 29 KB，其中 `remote.js` 约 10 KB。
- 测试基线：`npm test` 117 例、`npm run validate` 11 项、`npm run e2e` 63 项全绿。
- `templates/page.html` 增加 `#suggest-source-toggle` 按钮与 `remote.js` 引用；`app.js` 的涟漪目标补充该按钮。
- CI 的产物漂移检查覆盖三个生成文件；测试与 E2E 更新（单页主题解析、旧 URL 跳转、联网联想开关/超时降级）。
- 文档同步：README（在线地址、使用说明、技术说明、新增「隐私」小节）、CONTRIBUTING（单页/重定向壳、`remote.js` provider 扩展）、`docs/custom-sites.md`（三产物）。

## 2.0.0（未发布）

v2 重构：在**不改变使用方式**的前提下，把站点数据收敛到一处，并补上 v1 里一直想做的交互。

### 修复

- **修复 URL 编码断链**：搜索词统一在 `SS.search.buildUrl` 里做 `encodeURIComponent`，`a&b`、`c#d`、`a+b`、中文、空格、emoji 都能正确进入目标站点（v1 靠手工拼接，特殊字符会截断查询参数）。
- **修复 Unsplash 站内搜索失效**：`search?q=` 地址已不可用，改为官网当前的 `https://unsplash.com/s/photos/{q}`。
- **修复双主题漂移**：v1 需要手工维护两个 HTML 文件，曾出现浅色页有 Unsplash、夜间页没有的问题；v2 由 `assets/js/sites.js` 单一数据源生成，两页站点列表与顺序完全一致。

### 新增

- **关键词联想**：输入时给出「用 Bing 搜索」「站点（含别名/关键词匹配）」「搜索历史」三类建议，纯本地数据、默认离线可用，最多 8 条。
- **清除按钮**：输入框有内容时出现，一键清空并保持输入框聚焦。
- **搜索按钮**：除回车外也可以点「搜索」，空词时不会提交空查询。
- **明暗模式切换**：页面底部一键切换浅色/夜间，选择写入 `localStorage`，刷新后保持；两个入口页仍保留各自默认主题，首屏防闪烁。
- **搜索历史**：最近 10 条搜索词、新的在前、自动去重，作为联想来源；写入由表单提交和站点按钮点击触发。
- **键盘操作**：`/` 聚焦搜索框、`↑`/`↓` 选择联想项、`Enter` 采用、`Esc` 关闭联想、`Ctrl/⌘/Alt + 点击`站点按钮在新标签页打开。
- **可访问性**：联想列表使用 `listbox`/`option` 语义与 `aria-activedescendant`，补充 skip link、`:focus-visible` 焦点样式、`prefers-reduced-motion` 支持。
- **视觉风格改为 MDUI 1 / Material Design 1 观感**：indigo 主色（`#3f51b5`）、2px 圆角、2/4/8dp elevation 阴影、点击涟漪反馈、下划线输入框、主色 raised 搜索按钮、MD1 菜单式联想下拉；深浅两套配色都重调过。全部为自研手写 CSS（`assets/css/tokens.css`），**未引入 MDUI 库或任何第三方资源**。
- **搜索页落地页**：新增 `index.html`，作为两个主题入口的选择页（原 `SimpleSearch-Light.html` / `SimpleSearch-Dark.html` 地址保持不变）。

### 工程

- 站点注册表只维护 `assets/js/sites.js` 一处；`scripts/build.mjs` 在开发时生成两个静态入口页，线上依旧零构建、零运行时依赖。
- 新增 `npm run build` / `test` / `validate` / `check` / `serve` 脚本；`tests/` 覆盖查询规范化、URL 构建、站点决策、联想、历史与主题逻辑。
- 新增 GitHub Actions CI（`.github/workflows/ci.yml`）：Node 22，跑 `npm run check`，并检查生成产物是否漂移。
- 新增可选的本地端到端检查 `npm run e2e`（用本机 Edge/Chrome，CI 不跑），截图输出到已 gitignore 的 `artifacts/`。
- 新增品牌图标 `assets/img/favicon.svg`、`.nojekyll`（GitHub Pages 直接托管）。
- 文档重写：README、CONTRIBUTING、`docs/custom-sites.md`、本更新日志；删除 v1 README 里「要在三个地方分别填」的说明和会失效的截图。
- `assets/js/` 全部为经典脚本（classic script），浏览器和 Node 共用同一份代码；`file://` 双击打开依旧可用。
