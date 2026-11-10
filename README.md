<div align="center">

<img src="assets/img/favicon.svg" width="72" height="72" alt="简单搜索图标">

# SimpleSearch - 简单搜索

一款超简单的聚合搜索网站

输入关键词，然后点击网站按钮，就在那个网站里搜索；不输入关键词直接点，就打开那个网站。

**纯静态 · 零依赖 · 本地打开 3 毫秒**

</div>

## 这是什么

就是一个搜索框加一排常用网站按钮。

- 输入关键词按回车：用 Bing 搜。
- 什么都不输入，点下面的按钮：直接打开那个网站。
- 输入关键词再点按钮：在**那个网站里**搜这个词。

页面本身没有框架、没有构建运行时，就是一张纯静态 HTML：核心功能全部在本地完成，唯一可能外发的请求是**可以一键关掉的联网联想**（开启时把输入的关键词发给百度）。双击本地文件就能用，扔到 GitHub Pages 上也能用。

## 在线地址

- [https://breathiness.github.io/SimpleSearch/](https://breathiness.github.io/SimpleSearch/) —— 现在只有这一个页面。打开后会自动跟随系统的深浅色偏好，页脚也可以手动切换。

v1 的两个老地址保留，但现在是 **0 秒立即跳转**的壳：`<meta http-equiv="refresh" content="0; url=index.html?theme=light">` + `location.replace`，跳到首页并应用对应主题（老书签不会失效）。落地后主题已经存进 `localStorage`，地址栏里的 `?theme=` 会被 `history.replaceState` 清掉，所以你看到的是一条干净地址。

- [白天模式（跳转到首页）](https://breathiness.github.io/SimpleSearch/SimpleSearch-Light.html)
- [夜间模式（跳转到首页）](https://breathiness.github.io/SimpleSearch/SimpleSearch-Dark.html)

## 使用说明

### 基本操作

- **直接搜索**：在输入框里输入内容，按回车（或点「搜索」），用 Bing 搜索。
- **进入常用网站**：输入框留空，直接点下方任意按钮，打开对应网站首页。
- **使用对应网站的搜索引擎**：先输入关键词，再点某个按钮，就会跳到那个网站的搜索结果页。

### 站点分类

按钮墙上方有一行 MD1 风格的分类 chip：「全部」「技术开发」「社区问答」「影音游戏」「购物」「素材资讯」。点某个分类就只显示这一组的站点，再点「全部」恢复全量。

筛选**不会记忆**：刷新或重新打开都回到「全部」，也不写 URL。禁用 JavaScript 时这行 chip 不显示（不会出现点了没反应的死按钮），直接看到全部站点按钮。

### v2 新增的小功能

- **清除按钮**：输入框里有内容时右侧出现 `✕`，点一下清空并保持输入状态（不用全选删除）。
- **搜索按钮**：除了回车，也可以直接点「搜索」。输入为空时不会提交一个空查询。
- **关键词联想**：输入时下方出现建议列表，最多 8 条。本地部分（「用 Bing 搜索：xxx」、匹配到的站点、以前搜过的词）永远可用，断网也在；开启联网联想后，百度返回的词会排在本地站点匹配之后，并在右侧标注「百度」。
- **联网联想（默认开启）**：输入时会把关键词发给百度联想接口（`suggestion.baidu.com`，JSONP），700ms 超时或请求失败会自动退回本地联想，不影响搜索，也不会阻塞键盘操作。页脚的「联网联想」按钮（开启时显示「联网联想：开」，关闭后显示「联网联想：关闭」）可以随时关闭，**关闭后不再有任何第三方请求，完全离线**。点击一条百度建议会用它再搜一次。
- **搜索历史**：最近 10 条搜索词，新的在前、自动去重。历史不会单独展示，而是作为联想项出现；联想列表里点历史项会用 Bing 再搜一次。
- **明暗模式切换**：现在在同一个页面里切换，不用换链接。打开时按「`?theme=` 参数 → 上次的选择 → 系统深色偏好 → 浅色」决定主题；页脚点一下即可切换并记住。没有手动选过时，系统深浅色变化会实时跟随；手动切过之后以你的选择为准。首屏不会闪白/闪黑。
- **可访问性**：联想列表有 `listbox`/`option` 语义，支持 `aria-activedescendant`；键盘可以走完整个流程；按 `Tab` 第一个能拿到「跳到搜索框」的 skip link（获得焦点时才出现在页面顶部）；焦点轮廓和 `prefers-reduced-motion` 都处理了。
- **页脚**：从左到右是「联网联想：开 / 关闭」「夜间模式 / 白天模式」「关于」三个控件，390px 窄屏下也在同一行、不溢出。
- **站点图标**：每个站点按钮前都有 24×24 的内联 SVG 图标，颜色跟随主题文字色，**不新增任何图片请求**；没配图标的站点自动显示首字符。原理和取舍见「技术说明 · 站点图标」。

### 键盘操作

| 按键 | 作用 |
|---|---|
| `/` | 聚焦搜索框（在输入框里打 `/` 不受影响） |
| `↑` / `↓` | 在联想列表里上下移动（输入框里非空时） |
| `Enter` | 有高亮联想项时采用它；没有高亮时就是普通提交，用 Bing 搜索 |
| `Esc` | 关闭联想列表 |
| `Tab` | 移出搜索框，联想列表自动收起 |
| `Ctrl` / `⌘` / `Alt` + 点击站点按钮 | 在新标签页打开，不覆盖当前页 |

## 加载速度

因为整个页面内容和功能都相当简单，所以加载速度是非常快的。

2023 年在原项目上测过：使用 GitHub Pages 的在线版测试的加载完成时间是 **656 毫秒**；本地版（直接双击打开文件）的加载时间更是只要 **3 毫秒**。

v2 / v2.1 之后仍然是**纯静态 + 零依赖**：核心页面与功能不依赖任何第三方资源，没有框架、网络字体或统计脚本；单页静态资源合计大约 86 KB（未压缩），**gzip 传输后约 31 KB**——GitHub Pages 默认走 gzip，所以真实下载量接近后者。本地打开依旧是「点一下就到」的 3 毫秒级体验。（如果开着联网联想，输入关键词会额外发一次百度请求，但那发生在页面加载之后，不影响首屏；v2.2 的站点图标是内联 SVG sprite，也不会多出任何图片请求。）需要说明的是，v2 没有在相同网络条件下重新做一次 656ms/3ms 的计时，所以这里不编新数字——在线时间主要取决于你的网络和 GitHub Pages，本地时间基本只看磁盘。

v2.2 加了站点图标和分类 chip 之后，未压缩体积从 77 KB 涨到 86 KB，但 **gzip 后只从 28.6 KB 涨到 30.7 KB：真实传输只多约 2.1 KB**。多出来的主要是内联图标 sprite（3.0 KB 未压缩、gzip 仅 0.75 KB）和分类 chip 行，没有新增任何图片请求。

## 自定义网站

v2 把站点列表收拢到了**一处**：`assets/js/sites.js` 里的 `SS.sites` 数组。`npm run build` 会从这一份数据生成三个产物：唯一真实页面 `index.html`，以及两个 0 秒跳转的重定向壳 `SimpleSearch-Light.html` / `SimpleSearch-Dark.html`。**不用再去 HTML 里手改，也不存在「三个地方都要填一遍」的问题**。

### 新增一个网站

1. 打开 `assets/js/sites.js`，在 `SS.sites` 数组里加一条（顺序就是按钮顺序）：

   ```js
   {
     id: 'example',                                   // 唯一、小写、只含 [a-z0-9-]
     label: '示例站点',                                // 按钮上显示的文字
     home: 'https://example.com',                     // 空关键词时直接打开
     search: 'https://example.com/search?q={q}',      // 站内搜索地址，必须有 {q}
     keywords: ['示例', 'demo'],                       // 可选，用于关键词联想
     group: 'tech',                                   // 必填：所属分类，见 SS.siteGroups
   },
   ```

   完整示例（复制粘贴到数组里就能跑）：

   ```js
   // assets/js/sites.js
   SS.sites = [
     // ...原有的站点保持不动...
     {
       id: 'example',
       label: '示例站点',
       home: 'https://example.com',
       search: 'https://example.com/search?q={q}',
       keywords: ['示例', 'demo'],
       group: 'tech',
     },
   ]
   ```

2. 重新生成三个产物（`index.html` + 两个重定向壳）：

   ```bash
   npm run build
   ```

3. 可选：跑一下测试和静态校验，确认没把别的东西改坏：

   ```bash
   npm test           # 单元测试
   npm run validate   # 静态检查 + 生成产物是否最新
   ```

4. 打开 `index.html` 验证效果（也可以点那两个老链接，它们会跳到首页）：留空点按钮应该打开 `home`，输入关键词点按钮应该跳到站内搜索结果。

### 分类与图标（v2.2）

- **分类必填**：每个站点要带 `group`，取值来自 `assets/js/sites.js` 里的 `SS.siteGroups`。目前有 5 个：`tech`（技术开发）、`community`（社区问答）、`media`（影音游戏）、`shopping`（购物）、`content`（素材资讯）；chip 的顺序就是 `SS.siteGroups` 数组的顺序。
- **加新分类**：在 `SS.siteGroups` 里追加 `{ id: 'xxx', label: '显示名' }`，再把相关站点的 `group` 指过去。站点缺 `group` 或 `group` 不在表里时 `npm run build` 会失败；分类暂时没有站点时 build 会给警告（建议别留空分类）。
- **图标可选**：不配图标就自动显示站点名的首字符（monogram），零额外成本；想配图标只需在 `scripts/icons.mjs` 里加一条（键是站点 `id`），再 `npm run build`。图标是 dev-time 数据，不会变成图片请求。

### 删除网站

把对应对象从 `SS.sites` 里删掉，再 `npm run build` 一次就行。生成页和运行时数据都只认这个数组。

### 几条注意事项

- `search` 里的 `{q}` **原样写**，编码交给代码（`assets/js/search.js` 会做 `encodeURIComponent`）。不要自己写 `%20` 或 `+`，否则中文和特殊符号会断链。
- `home` 和 `search` 必须是 `https://` 开头；`search` 必须包含 `{q}`，否则 `npm run build` 会直接报错。
- 只改了 `sites.js` 却忘了跑 `npm run build`，提交上去的 HTML 会和数据对不上——CI 的产物漂移检查会拦住这种提交，本地 `npm run validate` 也能发现。
- 新增站点必须给 `group`（取值见 `SS.siteGroups`）；`group` 缺失或不在表里 `npm run build` 会失败，分类暂时没有站点时 build 会警告（建议别留空分类）。
- 图标可选：不配就 monogram；配图标只改 `scripts/icons.mjs`（dev-time），不要引外部图标库或 CDN。
- 字段含义、更多站点的搜索地址模板、图标与分类的完整说明，见 [docs/custom-sites.md](docs/custom-sites.md)。
- 默认内置 11 个常用站点，其中**内置站点的 id 和它们之间的相对顺序**由 `tests/sites.test.mjs` 固定。**新增站点不会让测试变红**（测试只要求内置站点都在、且相对顺序不变）；只有删掉内置站点时 `npm test` 才会提示你恢复。自己用的话随便增删，跑一次 `npm run build` 就行。

## 目录结构

```
SimpleSearch/
├─ assets/
│  ├─ css/                  # tokens.css（配色变量）/ base.css（页面骨架）/ input.css（输入区）
│  ├─ img/                  # favicon.svg
│  └─ js/                   # 8 个经典脚本：sites / search / suggest / history / theme / remote / input / app
├─ docs/
│  ├─ contract.md           # 接口契约（开发前先读）
│  ├─ custom-sites.md       # 自定义网站完整说明
│  └─ CHANGELOG.md          # 更新日志
├─ scripts/
│  ├─ build.mjs             # 由模板 + SS.sites + scripts/icons.mjs 生成 index.html 与两个重定向壳
│  ├─ icons.mjs             # 站点图标数据（dev-time，只在构建时读取，不进运行时）
│  ├─ validate.mjs          # 静态校验 + 产物一致性检查
│  ├─ serve.mjs             # 零依赖本地静态服务器
│  └─ e2e.mjs               # 可选的真实浏览器端到端检查
├─ templates/
│  ├─ page.html             # 唯一真实页面的模板（含分类 chip 区与图标 sprite 占位）
│  └─ redirect.html         # 两个重定向壳的模板
├─ tests/                   # node:test 单元测试
├─ .github/workflows/ci.yml # GitHub Actions
├─ index.html               # 唯一真实页面，由 npm run build 生成，请勿手改
├─ SimpleSearch-Light.html  # ↓ 两个 0 秒重定向壳，由 npm run build 生成，请勿手改
├─ SimpleSearch-Dark.html   #   Light → index.html?theme=light，Dark → index.html?theme=dark
├─ package.json
├─ README.md / CONTRIBUTING.md / LICENSE / .nojekyll / .gitignore / .gitattributes
```

## 本地开发

需要 Node.js 21+（开发和 CI 实际用的是 22；`npm test` 的 glob 参数需要 Node ≥ 21）。**不需要 `npm install`**——`package.json` 里没有任何依赖，克隆下来直接跑。

| 命令 | 作用 |
|---|---|
| `npm run build` | 由模板 + `assets/js/sites.js` 生成 `index.html` 与两个重定向壳（**改完站点或模板后必须跑**） |
| `npm test` | 跑全部单元测试（Node 内置 `node:test`） |
| `npm run validate` | 静态检查 + 生成产物是否最新 |
| `npm run check` | 构建 + 测试 + 校验，提交前/CI 都用这个 |
| `npm run serve` | 本地静态服务器，默认 <http://127.0.0.1:8080/> |
| `npm run e2e` | 可选：用本机 Edge/Chrome 跑真实浏览器检查（没装浏览器会跳过，CI 不跑），截图输出到已 gitignore 的 `artifacts/` |

```bash
npm run serve
# 打开 http://127.0.0.1:8080/
```

当前测试基线：`npm test` **129 例**、`npm run validate` **15 项**、`npm run e2e` **72 项**全绿。`e2e` 是可选的真实浏览器检查（本机 Edge/Chrome，CI 不跑），覆盖单页主题解析、旧链接 0 秒跳转、联网联想开关与真实百度联调、分类 chip 筛选、图标 sprite（无额外图片请求）、移动端布局和 `file://` 打开。

## 技术说明

- **线上零构建、零运行时依赖**：开发时 `scripts/build.mjs` 在本地生成三个静态 HTML 并提交入库；部署后浏览器拿到的就是纯 HTML/CSS/JS，没有框架、没有包管理器、没有构建步骤。
- **经典脚本（classic script，无模块化）**：`assets/js/*.js` 全部是 IIFE + `globalThis` 的普通脚本（ES2015+ 语法，不用 `import` / `export`、不用 `type="module"`），不需要打包。所以既能被浏览器直接加载，也能被 Node 直接 `import()` 做单元测试。
- **单页主题**：`index.html` 的 `<html data-theme-default="auto">`，首屏内联脚本按 `?theme=` → `localStorage['ss.theme']` → `prefers-color-scheme` → 浅色 决定主题，避免闪烁；`?theme=` 会被持久化并用 `history.replaceState` 从地址栏去掉，分享出去的链接不会固定死主题。
- **`file://` 双击可用**：下载仓库后直接双击 `index.html` 就能用，不需要起服务器（这也是本地 3 毫秒的来源）；两个老 HTML 文件也能双击，会跳到 `index.html`。
- **单一数据源**：站点只写在 `assets/js/sites.js` 一处；页面只有一份（`index.html`），明暗两套只是 `assets/css/tokens.css` 里的两套 CSS 变量，不会再出现「浅色页有、夜间页没有」的漂移。
- **第三方请求**：核心页面与核心功能零第三方资源——字体用系统字体栈，没有 CDN、没有统计、没有追踪、没有网络字体。唯一的例外是默认开启的**联网联想**：输入关键词时会向 `suggestion.baidu.com` 发一次 JSONP 请求；页脚关掉后**零第三方请求**，联想只剩本地数据，完全离线可用。目前只接了百度一个源；`SS.remote.provider` 是可插拔的，但实测 Google / DuckDuckGo 的联想接口不一定可达、Bing 的 `osjson` 没有 CORS 头，所以没有接更多源（想接的话见 [CONTRIBUTING.md](CONTRIBUTING.md)）。
- **状态只存本地**：`localStorage` 里只有 `ss.theme`（明暗选择）、`ss.history`（最近 10 条搜索词）、`ss.remote`（联网联想开关）三个键；隐私模式/禁用存储时会自动降级，不报错、不影响核心功能。
- **体积**：单页静态资源合计约 86 KB（未压缩；**gzip 后约 31 KB**，预算 90 KB），其中内联图标 sprite 约 3.0 KB（gzip 约 0.75 KB）、`remote.js` 约 10 KB。所有资源都是仓库里的本地文件，没有第三方运行时、没有框架。

### 设计风格

界面观感参考 **MDUI 1 / Material Design 1**：indigo 主色（`#3f51b5`）、2px 圆角、2/4/8dp 三档 elevation 阴影、点击涟漪反馈、下划线输入框、主色 raised 搜索按钮、MD1 菜单式联想下拉。深浅两套配色都按 MD1 的文本不透明度体系单独调过。

这些**全部是自研手写 CSS**（变量集中在 `assets/css/tokens.css`）：项目没有引入 MDUI 库，也没有 CDN、网络字体或任何第三方资源。说「MDUI 1 风格」指的是视觉语言，不是依赖。

### 站点图标：内联 SVG sprite，不新增请求

v2.2 给每个站点按钮加了图标，但**没有新增任何图片请求**：

- 图标在构建时全部内联进 `index.html`：一个隐藏的 `<svg class="icon-sprite">` 里放一组 `<symbol id="i-<站点id>">`，按钮里用 `<use href="#i-<站点id>">` 引用。浏览器只解析当前 HTML，不会去下载图片。
- 图标是 24×24、`fill="none"` + `stroke="currentColor"` 的线条，颜色自动跟随主题文字色，深浅色不用各存一套。
- 图标数据在 `scripts/icons.mjs`，是 **dev-time 资产**：只在 `npm run build` 时被 Node 读取，运行时不加载、不增加任何请求。
- 没有配图标的站点（比如你自己加的）会退化成首字符 monogram（`<span class="button-icon-text">首</span>`），零额外成本。
- 体积：sprite 约 **3.0 KB**（未压缩），gzip 后约 **0.75 KB**；全站静态资源约 **86 KB** 未压缩 / gzip 约 **31 KB**。加图标 + 分类后，**真实传输量只比 v2.1 多约 2.1 KB（gzip）**——未压缩数字看着多了 9 KB，但 SVG sprite 压缩率很高。

#### 为什么不用更省事的做法

| 做法 | 代价 |
|---|---|
| 外链 favicon 服务（DuckDuckGo / Google 的 favicon API） | 每张图标一个跨域请求，还要额外做 DNS + TLS 建连；服务挂掉或断网就空白；还会把你访问的站点清单暴露给第三方 |
| 自托管 11 张 png / webp | 11 个额外请求，还要处理缓存、离线包和不同 DPR 的尺寸 |
| emoji 当图标 | 零字节，但风格不统一、跨系统字形差异大，跟 MD1 观感也不搭 |
| **内联 SVG sprite（本项目）** | 零额外请求、零额外文件；代价只是首屏 HTML 变大一点点（gzip 后约 1 KB 内） |

图标是自绘的通用几何符号（不是把别家商标原样抄进来）。想加 / 换图标只要在 `scripts/icons.mjs` 里加一条（`body` 里写 path），再 `npm run build`。

## 隐私

- 不接入任何统计、追踪、广告或指纹脚本。
- **联网联想默认开启**：输入时会把关键词发给百度（`suggestion.baidu.com` 的 JSONP 联想接口）。不需要的话点页脚「联网联想：开」把它关掉，之后**不会发出任何第三方请求**，完全离线可用。
- 浏览器本地只存三个键，且不会上传、不含账号或身份信息：

  | 键 | 内容 |
  |---|---|
  | `ss.theme` | 明暗主题选择（`light` / `dark`） |
  | `ss.history` | 最近 10 条搜索词 |
  | `ss.remote` | 联网联想开关（`on` / `off`） |

  清理站点数据即可全部删除。
- 搜索本身是浏览器原生表单提交到 Bing 或目标站点，不经过任何中间服务器。

## 路线图

v1 里一直想加但没做的 4 个功能，v2 都做掉了：

- [x] 关键词联想功能
- [x] 清除输入内容按钮
- [x] 搜索按钮
- [x] 黑夜/白天模式切换

v2.1 又补上的：

- [x] 明暗合并到单页（两个老链接自动跳转到首页并应用对应主题）
- [x] 联网联想（百度 JSONP，可一键关闭、失败自动降级）

v2.2 又补上的：

- [x] 站点分类筛选（MD1 chip，不记忆、刷新回「全部」）
- [x] 站点图标（内联 SVG sprite，零额外图片请求，monogram 兜底）

还可以做（**以下都还没实现**）：

- [ ] PWA / Service Worker，支持离线安装
- [ ] 站点列表的可视化编辑，不用直接改 JS
- [ ] 多搜索引擎切换（现在固定 Bing）
- [ ] 自选/自建更多联想源（现在只接了百度）
- [ ] 联想列表里的单条历史删除、导入/导出站点配置

## 灵感来源

灵感来自于 AnywhereAnything 网站，以及 via 作者写的 viayoo。这两个聚合搜索网站有个我非常喜欢的功能：输入关键词，然后点网站，即在那个网站里搜索；而不输入关键词直接点击网站就是直接打开。

但是非常可惜的是 viayoo 现在改成了 via 浏览器的介绍页面，现在没办法使用了。而 AnywhereAnything 只能在桌面端使用，并且加载速度慢。

我其实一直都很想要一个能满足上面提到的功能，并且速度足够快的聚合搜索网站。估计是我这个需求太过小众且简单，在网络上一直没有找到有其他类似的网站。刚好最近想测试一下 Bing 的能力如何。于是将我的需求描述了一下，然后就有了现在这个项目。

v2 重构把站点收拢到一处、补上了当年想加的几个小功能，v2.1 又把明暗切换合进单页、加了可关闭的联网联想，v2.2 再补上分类和图标，但上面这些初衷没变。

## License

[MIT](LICENSE) © 2023 breathiness

界面设计语言参考 [MDUI](https://www.mdui.org/) / Material Design 1，仅参考视觉规范，未引入其库或任何第三方资源。
