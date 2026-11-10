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

页面本身没有任何框架、没有构建运行时、不请求任何第三方资源，就是一张静态 HTML。双击本地文件就能用，扔到 GitHub Pages 上也能用。

## 在线地址

- [首页（选浅色 / 夜间）](https://breathiness.github.io/SimpleSearch/)
- [白天模式](https://breathiness.github.io/SimpleSearch/SimpleSearch-Light.html)
- [夜间模式](https://breathiness.github.io/SimpleSearch/SimpleSearch-Dark.html)

v1 的两个老地址原样保留，以前收藏的链接不会失效；首页是 v2 新加的落地页，用来选主题。

## 使用说明

### 基本操作

- **直接搜索**：在输入框里输入内容，按回车（或点「搜索」），用 Bing 搜索。
- **进入常用网站**：输入框留空，直接点下方任意按钮，打开对应网站首页。
- **使用对应网站的搜索引擎**：先输入关键词，再点某个按钮，就会跳到那个网站的搜索结果页。

### v2 新增的小功能

- **清除按钮**：输入框里有内容时右侧出现 `✕`，点一下清空并保持输入状态（不用全选删除）。
- **搜索按钮**：除了回车，也可以直接点「搜索」。输入为空时不会提交一个空查询。
- **关键词联想**：输入时下方出现建议列表，最多 8 条，包含「用 Bing 搜索：xxx」、匹配到的站点（按站点名、id、关键词匹配，相关度高的排前面），以及以前搜过的词。**全部是本地数据，不发网络请求**，断网也能用。
- **搜索历史**：最近 10 条搜索词，新的在前、自动去重。历史不会单独展示，而是作为联想项出现；联想列表里点历史项会用 Bing 再搜一次。
- **明暗模式切换**：页面底部可以一键切换浅色/夜间模式。你的选择会被记住，刷新、重新打开都保持；两个入口页各自有一个默认主题，但切过一次之后以你的选择为准。首屏不会闪白/闪黑。
- **可访问性**：联想列表有 `listbox`/`option` 语义，支持 `aria-activedescendant`；键盘可以走完整个流程；按 `Tab` 第一个能拿到「跳到搜索框」的 skip link（获得焦点时才出现在页面顶部）；焦点轮廓和 `prefers-reduced-motion` 都处理了。

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

v2 重构之后仍然是**纯静态 + 零依赖**：没有新增任何外部请求，没有引入框架、字体或统计脚本；单页要加载的 HTML/CSS/JS 加起来大约 57 KB（未压缩），本地打开依旧是「点一下就到」的 3 毫秒级体验。需要说明的是，v2 没有在相同网络条件下重新做一次 656ms/3ms 的计时，所以这里不编新数字——在线时间主要取决于你的网络和 GitHub Pages，本地时间基本只看磁盘。

## 自定义网站

v2 把站点列表收拢到了**一处**：`assets/js/sites.js` 里的 `SS.sites` 数组。两个入口页的按钮都由 `npm run build` 从这一份数据生成，**不用再去 HTML 里手改，也不存在「三个地方都要填一遍」的问题**。

### 新增一个网站

1. 打开 `assets/js/sites.js`，在 `SS.sites` 数组里加一条（顺序就是按钮顺序）：

   ```js
   {
     id: 'example',                                   // 唯一、小写、只含 [a-z0-9-]
     label: '示例站点',                                // 按钮上显示的文字
     home: 'https://example.com',                     // 空关键词时直接打开
     search: 'https://example.com/search?q={q}',      // 站内搜索地址，必须有 {q}
     keywords: ['示例', 'demo'],                       // 可选，用于关键词联想
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
     },
   ]
   ```

2. 重新生成两个页面：

   ```bash
   npm run build
   ```

3. 可选：跑一下测试和静态校验，确认没把别的东西改坏：

   ```bash
   npm test           # 单元测试
   npm run validate   # 静态检查 + 生成产物是否最新
   ```

4. 打开 `SimpleSearch-Light.html` 或 `SimpleSearch-Dark.html` 验证效果：留空点按钮应该打开 `home`，输入关键词点按钮应该跳到站内搜索结果。

### 删除网站

把对应对象从 `SS.sites` 里删掉，再 `npm run build` 一次就行。生成页和运行时数据都只认这个数组。

### 几条注意事项

- `search` 里的 `{q}` **原样写**，编码交给代码（`assets/js/search.js` 会做 `encodeURIComponent`）。不要自己写 `%20` 或 `+`，否则中文和特殊符号会断链。
- `home` 和 `search` 必须是 `https://` 开头；`search` 必须包含 `{q}`，否则 `npm run build` 会直接报错。
- 只改了 `sites.js` 却忘了跑 `npm run build`，提交上去的 HTML 会和数据对不上——CI 的产物漂移检查会拦住这种提交，本地 `npm run validate` 也能发现。
- 字段含义、更多站点的搜索地址模板，见 [docs/custom-sites.md](docs/custom-sites.md)。
- 默认内置 11 个常用站点，其中**内置站点的 id 和它们之间的相对顺序**由 `tests/sites.test.mjs` 固定。**新增站点不会让测试变红**（测试只要求内置站点都在、且相对顺序不变）；只有删掉内置站点时 `npm test` 才会提示你恢复。自己用的话随便增删，跑一次 `npm run build` 就行。

## 目录结构

```
SimpleSearch/
├─ assets/
│  ├─ css/                  # tokens.css（配色变量）/ base.css（页面骨架）/ input.css（输入区）
│  ├─ img/                  # favicon.svg
│  └─ js/                   # 7 个经典脚本：sites / search / suggest / history / theme / input / app
├─ docs/
│  ├─ contract.md           # v2 接口契约（开发前先读）
│  ├─ custom-sites.md       # 自定义网站完整说明
│  └─ CHANGELOG.md          # 更新日志
├─ scripts/
│  ├─ build.mjs             # 由模板 + SS.sites 生成两个入口页
│  ├─ validate.mjs          # 静态校验 + 产物一致性检查
│  ├─ serve.mjs             # 零依赖本地静态服务器
│  └─ e2e.mjs               # 可选的真实浏览器端到端检查
├─ templates/               # page.html：两个入口页的模板
├─ tests/                   # node:test 单元测试
├─ .github/workflows/ci.yml # GitHub Actions
├─ index.html               # 主题选择落地页（手写，不进构建）
├─ SimpleSearch-Light.html  # ↓ 两个入口页由 npm run build 生成，请勿手改
├─ SimpleSearch-Dark.html
├─ package.json
├─ README.md / CONTRIBUTING.md / LICENSE / .nojekyll / .gitignore
```

## 本地开发

需要 Node.js 18+（开发和 CI 实际用的是 22）。**不需要 `npm install`**——`package.json` 里没有任何依赖，克隆下来直接跑。

| 命令 | 作用 |
|---|---|
| `npm run build` | 由 `templates/page.html` + `assets/js/sites.js` 生成两个入口页 |
| `npm test` | 跑全部单元测试（Node 内置 `node:test`） |
| `npm run validate` | 静态检查 + 生成产物是否最新 |
| `npm run check` | 构建 + 测试 + 校验，提交前/CI 都用这个 |
| `npm run serve` | 本地静态服务器，默认 <http://127.0.0.1:8080/> |
| `npm run e2e` | 可选：用本机 Edge/Chrome 跑真实浏览器检查（没装浏览器会跳过，CI 不跑），截图输出到已 gitignore 的 `artifacts/` |

```bash
npm run serve
# 打开 http://127.0.0.1:8080/SimpleSearch-Light.html
```

## 技术说明

- **线上零构建、零运行时依赖**：开发时 `scripts/build.mjs` 在本地生成两个静态 HTML 并提交入库；部署后浏览器拿到的就是纯 HTML/CSS/JS，没有框架、没有包管理器、没有构建步骤。
- **经典脚本（classic script，无模块化）**：`assets/js/*.js` 全部是 IIFE + `globalThis` 的普通脚本（ES2015+ 语法，不用 `import` / `export`、不用 `type="module"`），不需要打包。所以既能被浏览器直接加载，也能被 Node 直接 `import()` 做单元测试。
- **`file://` 双击可用**：下载仓库后直接双击 `SimpleSearch-Light.html` 就能用，不需要起服务器（这也是本地 3 毫秒的来源）。
- **单一数据源**：站点只写在 `assets/js/sites.js` 一处，两个主题共用；v2 起不会再出现「浅色页有 Unsplash、夜间页没有」这种漂移。
- **不请求第三方资源**：字体用系统字体栈，没有 CDN、没有统计、没有追踪、没有网络字体。关键词联想和历史都是本地数据，断网可用。
- **状态只存本地**：`localStorage` 里只有 `ss.theme`（主题选择）和 `ss.history`（最近 10 条搜索词）；隐私模式/禁用存储时会自动降级，不报错、不影响核心功能。
- **体积**：单页加载体积约 57 KB（未压缩，其中 CSS/JS/图标合计约 53 KB）。

### 设计风格

界面观感参考 **MDUI 1 / Material Design 1**：indigo 主色（`#3f51b5`）、2px 圆角、2/4/8dp 三档 elevation 阴影、点击涟漪反馈、下划线输入框、主色 raised 搜索按钮、MD1 菜单式联想下拉。深浅两套配色都按 MD1 的文本不透明度体系单独调过。

这些**全部是自研手写 CSS**（变量集中在 `assets/css/tokens.css`）：项目没有引入 MDUI 库，也没有 CDN、网络字体或任何第三方资源。说「MDUI 1 风格」指的是视觉语言，不是依赖。

## 路线图

v1 里一直想加但没做的 4 个功能，v2 都做掉了：

- [x] 关键词联想功能
- [x] 清除输入内容按钮
- [x] 搜索按钮
- [x] 黑夜/白天模式切换

v2 之后还可以做（**以下都还没实现**）：

- [ ] PWA / Service Worker，支持离线安装
- [ ] 站点列表的可视化编辑，不用直接改 JS
- [ ] 多搜索引擎切换（现在固定 Bing）
- [ ] 联想列表里的单条历史删除、导入/导出站点配置

## 灵感来源

灵感来自于 AnywhereAnything 网站，以及 via 作者写的 viayoo。这两个聚合搜索网站有个我非常喜欢的功能：输入关键词，然后点网站，即在那个网站里搜索；而不输入关键词直接点击网站就是直接打开。

但是非常可惜的是 viayoo 现在改成了 via 浏览器的介绍页面，现在没办法使用了。而 AnywhereAnything 只能在桌面端使用，并且加载速度慢。

我其实一直都很想要一个能满足上面提到的功能，并且速度足够快的聚合搜索网站。估计是我这个需求太过小众且简单，在网络上一直没有找到有其他类似的网站。刚好最近想测试一下 Bing 的能力如何。于是将我的需求描述了一下，然后就有了现在这个项目。

v2 重构把站点收拢到一处、补上了当年想加的几个小功能，但上面这些初衷没变。

## License

[MIT](LICENSE) © 2023 breathiness

界面设计语言参考 [MDUI](https://www.mdui.org/) / Material Design 1，仅参考视觉规范，未引入其库或任何第三方资源。
