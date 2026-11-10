# 自定义网站

SimpleSearch 的站点按钮来自**唯一的数据源**：`assets/js/sites.js` 里的 `SS.sites` 数组。
`scripts/build.mjs` 会从这份数据生成三个产物：唯一真实页面 `index.html`，以及两个 0 秒跳转的重定向壳 `SimpleSearch-Light.html` / `SimpleSearch-Dark.html`。**不需要、也不应该再去手工改 HTML**。

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

## 2. 字段逐项说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | 站点唯一标识，只能是小写字母、数字和连字符：`/^[a-z0-9-]+$/`。会写进按钮的 `data-site` 属性，也用于测试和图标查找，**全表不可重复**。 |
| `label` | `string` | 是 | 按钮上显示的文字，可以是中文、空格、大小写字母（构建时会做 HTML 转义）。 |
| `home` | `string` | 是 | 输入框为空时点击按钮直接打开的地址，**必须**以 `https://` 开头。 |
| `search` | `string` | 是 | 站内搜索地址模板，**必须**以 `https://` 开头且**必须**包含 `{q}` 占位符；不满足时 `npm run build` 会报错退出。 |
| `keywords` | `string[]` | 否 | 用于本地关键词联想的别名/关键词（如 `['gh', 'git', '代码', '开源']`），可为空数组。构建时会被写进按钮的 `data-keywords` 属性；只影响联想排序，不影响跳转。 |
| `group` | `string` | 是 | 所属分类，取值必须是 `SS.siteGroups` 里某个 `id`（当前为 `tech` / `community` / `media` / `shopping` / `content`）。决定它出现在左侧分类导航的哪个分类下。 |

其他规则：

- **数组顺序 = 按钮渲染顺序**；`SS.siteGroups` 的顺序 = 左侧分类导航条目的顺序。
- 站点缺 `group` 或 `group` 不在 `SS.siteGroups` 里时，`npm run build` 会失败；某个分组暂时没有站点时只会警告（建议别留空分组）。
- 缩进用 2 个空格、字符串用单引号、对象末尾保留逗号，和文件里现有条目保持一致。
- `id` 一旦发布就尽量别改名，改名等于换了一个站点（测试与用户书签都可能引用它）。

## 3. `{q}` 占位规则

- `{q}` 在运行时会被替换成**编码后的关键词**（`encodeURIComponent`，见 `assets/js/search.js` 的 `buildUrl`）。
- 关键词会先做规范化：去掉首尾空白，把连续空白折叠成一个空格；空关键词不会拼搜索地址，而是走 `home`。
- **不要自己写 `%20`、`+` 或 `encodeURIComponent`**：`{q}` 原样写，编码由代码负责。自己再编码一次会导致中文、空格、`&`、`#`、`+` 全部断链。
- 搜索地址的查询参数名因站而异（`q`、`keyword`、`term`、`qw`、`search`…），照抄目标站点真实搜索结果的地址即可，只有 `{q}` 的位置由我们决定。
- `{q}` 也可以出现在路径里，例如 Unsplash 的 `https://unsplash.com/s/photos/{q}`。

## 4. 常见站点搜索 URL 模板示例

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

## 5. 分类（`group`）

- 分类写在 `assets/js/sites.js` 的 `SS.siteGroups` 里，每个站点用 `group` 字段指过去。
- 页面左侧的分类导航是「全部 + 每个分组」，**顺序跟 `SS.siteGroups` 数组一致**；点某个条目只显示该分组站点，点「全部」恢复。宽屏（≥960px）导航常驻 240px；窄屏（<960px）变成左侧抽屉，用顶栏汉堡按钮打开，点遮罩 / 按 `Esc` / 选中分类后自动收起。
- 筛选**不记忆、不写 URL**，刷新或重新打开都回到「全部」。
- 新增分类：在 `SS.siteGroups` 里追加 `{ id: 'xxx', label: '显示名' }`（`id` 用小写 `[a-z0-9-]`，不能重复），把相关站点的 `group` 改成 `xxx`，再 `npm run build`。**导航图标按 `cat-<分组 id>` 取名**：内置 5 个分类已有图标；新分类还要在 `scripts/icons.mjs` 的 `UI_ICONS` 里加一条 `'cat-xxx'`，否则导航项的图标引用不到目标，`npm run validate` 会报错。
- 删除分类：先把该分类下的站点挪到别的分类（或一起删掉），再从 `SS.siteGroups` 移除。空分组 build 只会警告，但站点 `group` 指向不存在的分类会让 build 失败。

## 6. 图标（可选）

图标是加分项，不是必填：

- 不配图标的站点会**自动退化为首字符 monogram**（例如 `示例站点` 显示「示」），由构建生成，零额外成本。
- 想配图标：在 `scripts/icons.mjs` 的 `SITE_ICONS` 里加一条，键就是站点 `id`：

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
- 请画**通用几何符号**，不要精确复制他人商标；整个 sprite 的 HTML 增量要控制在 4 KB 内（未压缩）。
- 不要用外链 favicon 服务、外部图标库/CDN 或 emoji 来替代——前者会新增请求，后者跨平台风格不统一。

## 7. 新增 / 删除网站

新增：

1. 在 `SS.sites` 末尾（或你想让它出现的位置）加一个对象，参考上一节模板；**别忘了 `group`**。
2. 运行 `npm run build`，重新生成三个产物（`index.html` + 两个重定向壳）。
3. 可选：`npm test` 跑单元测试，`npm run validate` 做静态检查与产物一致性检查。
4. 本地打开 `index.html` 验证（或点两个老链接，它们会跳到首页）：空输入点按钮应打开 `home`，输入关键词点按钮应跳到站内搜索结果；左侧分类导航里应该能看到它。

删除：把对应对象从数组里删掉，再 `npm run build`。

> **内置站点与测试**：`tests/sites.test.mjs` 要求内置的 11 个站点都在、且它们之间的相对顺序与契约一致（防止再出现不同页面/主题之间的漂移），但**允许你随意追加新站点**。所以只加站点的话 `npm test` 不会红；只有删掉内置站点时它才会失败并提示恢复。`npm run validate` 里的「站点渲染与注册表一致」始终按实际注册表比对，也不受追加影响。

```js
// 新增一个示例（顺序即按钮顺序）：
{
  id: 'example',
  label: '示例站点',
  home: 'https://example.com',
  search: 'https://example.com/search?q={q}',
  keywords: ['示例', 'demo'],
  group: 'tech',
},
```

> 如果只改了 `sites.js` 却忘了跑 `npm run build`，CI 的产物漂移检查会失败——因为提交的 HTML 和注册表对不上。报错时跑一次 `npm run build` 把生成结果一起提交即可。

## 8. 为什么只改一处就够

- 开发时，`scripts/build.mjs` 用 Node 直接 `import` 这个经典脚本，读 `globalThis.SimpleSearch.sites` / `SS.siteGroups`，按 `templates/page.html` 里的占位符生成唯一真实页面 `index.html`（含顶栏、左侧分类导航、卡片按钮墙和图标 sprite），再由 `templates/redirect.html` 生成两个指向它的重定向壳。
- 图标数据来自 `scripts/icons.mjs`，它同样是 **dev-time 资产**：只在构建时被 Node 读取，不会被页面加载、不会增加请求。
- 线上仍然是纯静态文件：浏览器只加载已经生成好的 HTML，不需要在运行时读取注册表，也不需要任何构建工具或依赖。
- 想确认产物和模板/注册表是否一致：运行 `node scripts/build.mjs --check`（`npm run validate` 里也包含这个检查）。
