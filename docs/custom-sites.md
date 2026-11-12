# 自定义网站

SimpleSearch 的站点按钮来自**唯一的数据源**：`assets/js/sites.js` 里的 `SS.sites` 数组。
`scripts/build.mjs` 会从这份数据生成五个产物：唯一真实页面 `index.html`、单文件便携版 `SimpleSearch.html`、两个 0 秒跳转的重定向壳 `SimpleSearch-Light.html` / `SimpleSearch-Dark.html`，以及 PWA 的 `sw.js`。**不需要、也不应该再去手工改 HTML**。

加站点有两种方式：**设置里可视化添加**（推荐，只影响你自己的浏览器，见 §2）或**改 `sites.js` 进仓库内置**（需要重新构建，所有访问者都能看到，见 §3 起）。

## 1. 数据源

打开 `assets/js/sites.js`，找到 `SS.sites`：

```js
SS.sites = [
  {
    id: 'github',
    label: 'GitHub',
    home: 'https://github.com',
    search: 'https://github.com/search?q={q}',
    keywords: ['gh', 'git', '代码', '开源'],
    group: 'tech',
  },
  // ...
]
```

分组表在同一文件里（顺序就是左侧分类导航条目的顺序）：

```js
SS.siteGroups = [
  { id: 'tech', label: '技术开发' },
  { id: 'community', label: '社区问答' },
  { id: 'media', label: '影音游戏' },
  { id: 'shopping', label: '购物' },
  { id: 'content', label: '素材资讯' },
]
```

## 2. 用界面添加（推荐）

不用改代码、不用构建：右上角设置 → **我的站点** → 管理 → **新增站点**。

- 填表：名称、首页网址、搜索模板（用 `{q}` 表示关键词）、分类（技术开发 / 社区问答 / 影音游戏 / 购物 / 素材资讯）、关键词（空格分隔，可选）、是否放进「常用」。
- 校验：首页 / 搜索模板必须 `https://`，搜索模板必须含 `{q}`，分类必须是内置 5 类之一；不合法会提示原因，不会写入。
- 保存后按钮**立刻**出现在对应分类；勾了「常用」就同时进常用视图。自定义站点的 id 自动生成（`custom-…`），id 和关键词自动成为 `!bang` token。
- 数据存在浏览器本地 `ss.customSites`（最多 100 个），刷新或重开页面仍在；列表里可以继续编辑、删除。界面添加的站点不选图标，默认显示首字母 monogram。
- **常用排序**：设置里「常用排序 → 调整」，用 ↑ / ↓ / 置顶改常用视图顺序，存 `ss.order`。
- **配置备份 / 迁移**：设置里「导出配置」会下载 `simplesearch-config.json`（包含自定义站点、常用顺序、主题模式 / 主题色 / 搜索引擎 / 联网联想开关）；「导入配置」会校验格式，非法整包拒绝并提示。导入只做 JSON 解析 + 校验，不执行任何代码。
- 想让站点成为**所有访问者都能看到的内置站点**，才需要走下面的 `sites.js` 流程并重新构建。

## 3. 字段逐项说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | 站点唯一标识，只能是小写字母、数字和连字符：`/^[a-z0-9-]+$/`。会写进按钮的 `data-site` 属性，也用于测试和图标查找，**全表不可重复**。 |
| `label` | `string` | 是 | 按钮上显示的文字，可以是中文、空格、大小写字母（构建时会做 HTML 转义）。 |
| `home` | `string` | 是 | 输入框为空时点击按钮直接打开的地址，**必须**以 `https://` 开头。 |
| `search` | `string` | 是 | 站内搜索地址模板，**必须**以 `https://` 开头且**必须**包含 `{q}` 占位符；不满足时 `npm run build` 会报错退出。 |
| `keywords` | `string[]` | 否 | 用于本地关键词联想的别名/关键词（如 `['gh', 'git', '代码', '开源']`），可为空数组。构建时会被写进按钮的 `data-keywords` 属性；只影响联想排序，不影响跳转。 |
| `group` | `string` | 是 | 所属分类，取值必须是 `SS.siteGroups` 里某个 `id`（当前为 `tech` / `community` / `media` / `shopping` / `content`）。决定它出现在左侧分类导航的哪个分类下。 |
| `icon` | `string` | 否 | 可选图标：复用分类图标写 `cat-<group>`（如 `cat-tech`），或写 sprite 里已有的 symbol 名；不写则显示首字母 monogram。 |
| `featured` | `boolean` | 否 | `true` 才进默认的「常用」视图；不写则只在对应分类里出现。内置的 11 个站点都带这个标记。 |

其他规则：

- **数组顺序 = 按钮渲染顺序**；`SS.siteGroups` 的顺序 = 左侧分类导航条目的顺序。
- 站点缺 `group` 或 `group` 不在 `SS.siteGroups` 里时，`npm run build` 会失败；某个分组暂时没有站点时只会警告（建议别留空分组）。
- 新站点的 `id` / `keywords` 会自动成为 `!bang` token，不需要额外注册。
- 图标解析顺序：站点专属图标 `SITE_ICONS[site.id]` → `icon` 指向的 symbol（如 `cat-tech`）→ 首字母 monogram。
- **新增站点默认只在对应分类里出现**，不会进「常用」视图；想让它出现在常用视图就加 `featured: true`（内置 11 站都有）。无 JS 时构建给非 featured 按钮加 `hidden`，默认只显示 11 个常用站。
- 缩进用 2 个空格、字符串用单引号、对象末尾保留逗号，和文件里现有条目保持一致。
- `id` 一旦发布就尽量别改名，改名等于换了一个站点（测试与用户书签都可能引用它）。

## 4. `{q}` 占位规则

- `{q}` 在运行时会被替换成**编码后的关键词**（`encodeURIComponent`，见 `assets/js/search.js` 的 `buildUrl`）。
- 关键词会先做规范化：去掉首尾空白，把连续空白折叠成一个空格；空关键词不会拼搜索地址，而是走 `home`。
- **不要自己写 `%20`、`+` 或 `encodeURIComponent`**：`{q}` 原样写，编码由代码负责。自己再编码一次会导致中文、空格、`&`、`#`、`+` 全部断链。
- 搜索地址的查询参数名因站而异（`q`、`keyword`、`term`、`qw`、`search`…），照抄目标站点真实搜索结果的地址即可，只有 `{q}` 的位置由我们决定。
- `{q}` 也可以出现在路径里，例如 Unsplash 的 `https://unsplash.com/s/photos/{q}`。

## 5. 常见站点搜索 URL 模板示例

| 站点 | `home` | `search` 模板 |
|---|---|---|
| Bing | `https://www.bing.com` | `https://www.bing.com/search?q={q}` |
| GitHub | `https://github.com` | `https://github.com/search?q={q}` |
| Unsplash | `https://unsplash.com/` | `https://unsplash.com/s/photos/{q}` |
| 哔哩哔哩 | `https://www.bilibili.com` | `https://search.bilibili.com/all?keyword={q}` |
| 少数派 | `https://sspai.com` | `https://sspai.com/search/post/{q}` |
| 萌娘百科 | `https://zh.moegirl.org.cn` | `https://zh.moegirl.org.cn/index.php?search={q}` |
| 知乎 | `https://www.zhihu.com` | `https://www.zhihu.com/search?type=content&q={q}` |
| 百度贴吧 | `https://tieba.baidu.com` | `https://tieba.baidu.com/f/search/res?qw={q}` |
| 淘宝 | `https://www.taobao.com` | `https://s.taobao.com/search?q={q}` |
| 京东 | `https://www.jd.com` | `https://search.jd.com/Search?keyword={q}` |
| Steam | `https://store.steampowered.com` | `https://store.steampowered.com/search/?term={q}` |
| ArchWiki | `https://wiki.archlinux.org` | `https://wiki.archlinux.org/index.php?search={q}` |

> 站点改版可能让旧的搜索地址失效（v2 就修正了 Unsplash 的 `search?q=`）。发现点按钮后搜索词丢了，先手动在目标站搜一次，把浏览器地址栏里的真实搜索地址抄回来替换即可。

## 6. `!bang` 快捷搜索

站点的 `id` 和 `keywords` 会自动变成 `!bang` 的 token，不需要额外注册：

- 加了 `id: 'example'`、`keywords: ['示例', 'demo']` 的站点后，输入 `!example 词`、`!示例 词`、`!demo 词` 都会在它里面搜；不带词（如 `!example`）直接打开它的 `home`。
- 匹配规则：token 大小写不敏感、与 `id` 或某个 keyword **完全相等**才算命中；允许中文；**只认第一个 token**（`!nope !gh x` 不会命中 GitHub）；未知 token 当普通搜索。
- 注意：keywords 是全表共享的匹配空间，两个站点用了同一个 keyword 时，命中的是注册表里靠前的那个站点——起别名时尽量别撞车。

## 7. 分类（`group`）

- 分类写在 `assets/js/sites.js` 的 `SS.siteGroups` 里，每个站点用 `group` 字段指过去。
- 页面左侧的分类导航是「常用 + 每个分组」，**顺序跟 `SS.siteGroups` 数组一致**；点「常用」只显示 11 个常用站，点某个分类显示该分类全部站点。宽屏（≥960px）导航常驻 240px；窄屏（<960px）变成左侧抽屉，用顶栏汉堡按钮打开，点遮罩 / 按 `Esc` / 选中分类后自动收起。
- 筛选**不记忆、不写 URL**（点分类时同步 `?cat=` 方便分享），刷新或重新打开都回到「常用」。
- 新增分类：在 `SS.siteGroups` 里追加 `{ id: 'xxx', label: '显示名' }`（`id` 用小写 `[a-z0-9-]`，不能重复），把相关站点的 `group` 改成 `xxx`，再 `npm run build`。**导航图标按 `cat-<分组 id>` 取名**：内置 5 个分类已有图标；新分类还要在 `scripts/icons.mjs` 的 `UI_ICONS` 里加一条 `'cat-xxx'`，否则导航项的图标引用不到目标，`npm run validate` 会报错。
- 删除分类：先把该分类下的站点挪到别的分类（或一起删掉），再从 `SS.siteGroups` 移除。空分组 build 只会警告，但站点 `group` 指向不存在的分类会让 build 失败。

## 8. 图标（可选）

图标是加分项，不是必填。构建时的解析顺序是：**站点专属图标 → `icon` 指向的 symbol → 首字符 monogram**。

- 不配图标的站点会**自动退化为首字符 monogram**（例如 `示例站点` 显示「示」），由构建生成，零额外成本。
- **复用分类图标**：在站点对象里写 `icon: 'cat-tech'`（或 `cat-community` / `cat-media` / `cat-shopping` / `cat-content`），就不用单独画图标。
- 想配专属图标：在 `scripts/icons.mjs` 的 `SITE_ICONS` 里加一条，键就是站点 `id`：

  ```js
  export const SITE_ICONS = {
    example: {
      body: '<path d="M4 12h16" />',
    },
  }
  ```

  （`viewBox` 可省略，默认就是 `0 0 24 24`。）

- 图标会被 `npm run build` **内联进 `index.html` 的 SVG sprite**（`<symbol id="i-example">` + `<use>`），不新增任何图片请求，也不会生成独立图片文件。
- 画图标守则：24×24 viewBox、`fill="none"`、`stroke="currentColor"`、线宽 1.8、圆头；颜色跟随主题文字色，所以不需要为深浅色各画一套。
- 请画**通用几何符号**，不要精确复制他人商标；整个 sprite 的 HTML 增量要控制在 **12 KB** 内（未压缩）。
- 不要用外链 favicon 服务、外部图标库/CDN 或 emoji 来替代——前者会新增请求，后者跨平台风格不统一。

## 9. 新增 / 删除网站

新增：

1. 在 `SS.sites` 末尾（或你想让它出现的位置）加一个对象，参考上一节模板；**别忘了 `group`**。想进「常用」视图的话再加 `featured: true`，否则它只出现在对应分类里。
2. 运行 `npm run build`，重新生成五个产物（`index.html` + `SimpleSearch.html` + 两个重定向壳 + `sw.js`，其中 sw.js 的 precache 列表会自动带上 `assets/css` / `assets/js` 下的全部文件）。
3. 可选：`npm test` 跑单元测试，`npm run validate` 做静态检查与产物一致性检查。
4. 本地打开 `index.html` 验证（或点两个老链接，它们会跳到首页）：空输入点按钮应打开 `home`，输入关键词点按钮应跳到站内搜索结果；左侧分类导航里应该能看到它。也可以试试深链 `?cat=<新分类>`、`?site=<新站点id>`：只预选 / 聚焦，不会自动跳转。
5. 可选（需要网络）：`npm run check:sites` 会逐个请求各站点的 `home` / `search`，输出 OK / WARN / FAIL 表格；WARN 多为反爬 401/403 或跨域跳转（不阻断），`--strict` 时只有 FAIL 才退出 1。它**不进 CI**。
6. 新站点的 `id` / `keywords` 会自动成为 `!bang` token，可以输入 `!<新站点id> 测试` 看看是否直达（不带词则打开 `home`）。

删除：把对应对象从数组里删掉，再 `npm run build`。

> **内置站点与测试**：`tests/sites.test.mjs` 要求内置站点都在、且它们之间的相对顺序与契约一致（防止再出现不同页面/主题之间的漂移；最早内置的 11 个老站点顺序固定，站点库现为 33 个），但**允许你随意追加新站点**。所以只加站点的话 `npm test` 不会红；只有删掉内置站点时它才会失败并提示恢复。`npm run validate` 里的「站点渲染与注册表一致」始终按实际注册表比对，也不受追加影响。

```js
// 新增一个示例（顺序即按钮顺序）：
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

> 如果只改了 `sites.js` 却忘了跑 `npm run build`，CI 的产物漂移检查会失败——因为提交的 HTML 和注册表对不上。报错时跑一次 `npm run build` 把生成结果一起提交即可。

## 10. 为什么只改一处就够

- 开发时，`scripts/build.mjs` 用 Node 直接 `import` 这个经典脚本，读 `globalThis.SimpleSearch.sites` / `SS.siteGroups`，按 `templates/page.html` 里的占位符生成唯一真实页面 `index.html`（含顶栏、左侧分类导航、卡片按钮墙和图标 sprite），再由 `templates/redirect.html` 生成两个指向它的重定向壳，用 `templates/sw.js` 生成带版本号与 precache 列表的 `sw.js`，最后把 `index.html` 内联成单文件便携版 `SimpleSearch.html`。
- 图标数据来自 `scripts/icons.mjs`，它同样是 **dev-time 资产**：只在构建时被 Node 读取，不会被页面加载、不会增加请求。
- Service Worker 的 precache 列表由构建扫描生成：`assets/css` / `assets/js` 下的文件会自动加入；如果你在其它目录新增了本地资源，需要在 `scripts/build.mjs` 的 `buildPrecacheList` 里补一行。
- 线上仍然是纯静态文件：浏览器只加载已经生成好的 HTML，不需要在运行时读取注册表，也不需要任何构建工具或依赖。
- 想确认产物和模板/注册表是否一致：运行 `node scripts/build.mjs --check`（`npm run validate` 里也包含这个检查）。

