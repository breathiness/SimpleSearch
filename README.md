<div align="center">

<img src="assets/img/favicon.svg" width="72" height="72" alt="简单搜索图标">

# SimpleSearch - 简单搜索

一款超简单的聚合搜索网站

输入关键词，然后点击网站按钮，就在那个网站里搜索；不输入关键词直接点，就打开那个网站。

**纯静态 · 零依赖 · 本地打开 3 毫秒**

</div>

## 这是什么

就是一个搜索框加一排常用网站按钮。

- 输入关键词按回车：用当前选择的搜索引擎搜（默认 Bing）。
- 什么都不输入，点下面的按钮：直接打开那个网站。
- 输入关键词再点按钮：在**那个网站里**搜这个词。

页面本身没有框架、没有构建运行时，就是一张纯静态 HTML：核心功能全部在本地完成，唯一可能外发的请求是**可以一键关掉的联网联想**（开启时把输入的关键词发给百度）。双击本地文件就能用，扔到 GitHub Pages 上也能用。

## 在线地址

- [https://breathiness.github.io/SimpleSearch/](https://breathiness.github.io/SimpleSearch/) —— 现在只有这一个页面。打开后会自动跟随系统的深浅色偏好，右上角的设置里也可以手动切换。

v1 的两个老地址保留，但现在是 **0 秒立即跳转**的壳：`<meta http-equiv="refresh" content="0; url=index.html?theme=light">` + `location.replace`，跳到首页并应用对应主题（老书签不会失效）。落地后主题已经存进 `localStorage`，地址栏里的 `?theme=` 会被 `history.replaceState` 清掉，所以你看到的是一条干净地址。

- [白天模式（跳转到首页）](https://breathiness.github.io/SimpleSearch/SimpleSearch-Light.html)
- [夜间模式（跳转到首页）](https://breathiness.github.io/SimpleSearch/SimpleSearch-Dark.html)

### 装到桌面 / 离线可用（PWA）

Chrome / Edge 打开首页后，地址栏右侧可以「安装」简单搜索，装完是一个独立窗口。装过一次之后**断网刷新也能打开**——Service Worker 会预缓存首页的全部本地资源。

- Service Worker 只在 http(s) 下注册；`file://` 双击打开时不会注册，本地照旧可用。
- 跨域请求（联网联想的百度接口、点站点后的跳转）不缓存、直接放行。
- 升级版本后旧缓存会自动清理，不会出现页面和缓存版本对不上。
- `sw.js` 是后台注册的，不计入首屏；`manifest.webmanifest` 只在安装时用。浏览器可能按 `apple-touch-icon` 惯例额外抓取一次 PWA 图标，属预期（见下面「加载速度」）。

### 单文件便携版（SimpleSearch.html）

仓库根目录的 `SimpleSearch.html` 是**单文件便携版**：CSS、JS、图标全部内联，双击就能用，也可以只把这一个文件发给别人。

- 体积 **196.6 KB（201,332 B）/ gzip 48.0 KB**，**零外部请求**——没有 CSS/JS/图片文件要加载，favicon 是 data URI，连 `assets/` 都不引用。
- 没有 PWA 安装 / 离线缓存（Service Worker 必须是独立文件），也移除了 manifest 和 apple-touch-icon。
- 单文件版改一个字，整个文件都要重新下载；体积上也比分文件版略大（重复内容无法跨文件缓存）。

| 版本 | 适合 | PWA 安装 / 离线 | 体积 |
|---|---|---|---|
| `index.html`（多文件，线上） | 日常使用、要装到桌面 | ✅ manifest + `sw.js` | 首屏约 196 KB 未压缩 / gzip 约 56 KB（预算 200 KB） |
| `SimpleSearch.html`（单文件） | 下载 / 双击 / 单文件分享 | ❌ 无 SW、无缓存 | 196.6 KB 未压缩 / gzip 48.0 KB，零外部请求（上限 260 KB） |

## 使用说明

### 基本操作

- **直接搜索**：在输入框里输入内容，按回车（或点「搜索」），用当前选择的搜索引擎（默认 Bing）搜索。
- **进入常用网站**：输入框留空，直接点下方任意按钮，打开对应网站首页。
- **使用对应网站的搜索引擎**：先输入关键词，再点某个按钮，就会跳到那个网站的搜索结果页。

### `!bang` 站点快捷搜索

在输入框里用 `!` 开头可以直接在某个站点里搜，不用先点按钮：

| 输入 | 效果 |
|---|---|
| `!gh rust` | 在 GitHub 里搜 rust |
| `!so rust` | 在 StackOverflow 里搜 rust |
| `!youtube cats` | 在 YouTube 里搜 cats |
| `!b站 视频` | 在哔哩哔哩里搜「视频」（token 可以是中文关键词） |
| `!淘宝 键盘` | 在淘宝里搜「键盘」 |
| `!gh` | 不带搜索词：直接打开 GitHub 首页 |
| `!nope 东西` | 不是已知站点：当成普通搜索，用当前搜索引擎 |

- 语法是 `!<token> [搜索词]`；`<token>` 匹配**站点 id** 或该站的 **keywords**（大小写不敏感，支持中文）。
- 只认第一个 token；未知 token 一律当普通搜索。
- keyword 是全表共享的，重复时按注册表顺序命中靠前的内置站点——比如 `!购物` → 淘宝、`!视频` → 哔哩哔哩。
- 输入合法 bang 时，联想列表第一项会变成「在 GitHub 搜索：rust」，选中即可直达。

### 页面布局（v2.3）

页面骨架照着 MDUI 1 文档站做的：

- **顶部主色应用栏**：左侧是汉堡按钮（只在小屏出现）+ 圆形 logo，中间是标题「简单搜索」，右侧是设置图标。
- **左侧分类导航**：宽屏常驻，240px 宽；小屏（<960px）收成左侧抽屉，用汉堡按钮打开。
- **内容区两张卡片**：「搜索」和站点卡片（标题随视图变化：常用 →「常用网站」，分类 → 分类名）。
- **没有页脚**：设置都收在右上角图标打开的**右侧设置抽屉**里。

### 分类导航

左侧导航的组标题是「站点分类」，下面是竖排的分类项：「常用」「技术开发」「社区问答」「影音游戏」「购物」「素材资讯」。每个条目前面还有一个小图标：常用是九宫格、技术开发是终端、社区问答是对话气泡、影音游戏是播放电视、购物是手提袋、素材资讯是相机。选中项有底色、主色文字和左侧主色条。

- **常用**（默认视图）：只显示最初内置的 11 个常用站点。
- **点某个分类**：显示该分类的**全部**站点——技术开发 7 个、社区问答 6 个、影音游戏 8 个、购物 6 个、素材资讯 6 个。33 个站点不会一次性平铺，找新站就点对应分类。
- 内容区卡片标题会跟着变：常用视图是「常用网站」，分类视图显示分类名（如「技术开发」）。

点分类时地址栏会同步成 `?cat=<id>`（回到「常用」时去掉这个参数），所以某个分类视图可以直接收藏或分享；刷新时以 URL 为准，不做本地记忆。非 JS 环境下构建只输出 11 个常用站点可见（其余按钮初始 `hidden`），不会出现「按钮铺满但点不动」的尴尬。

小屏（<960px）时导航变成左侧抽屉：点汉堡打开，点遮罩、按 `Esc`、或选中一个分类后会自动收起。

### 内置站点（33 个）

| 分类 | 站点 |
|---|---|
| 技术开发（7） | GitHub、ArchWiki、StackOverflow、MDN、Gitee、npm、掘金 |
| 社区问答（6） | 知乎、百度贴吧、豆瓣、微博、V2EX、Reddit |
| 影音游戏（8） | 哔哩哔哩、Steam、萌娘百科、YouTube、抖音、爱奇艺、腾讯视频、Twitch |
| 购物（6） | 淘宝、京东、天猫、拼多多、闲鱼、亚马逊 |
| 素材资讯（6） | Unsplash、少数派、Pexels、Pixabay、36氪、站酷 |

「常用」视图只显示 11 个常用站（最早内置的那批）；其余站点都在对应分类里，点分类就能看到。每个新站点的 `id` / `keywords` 也自动成为 `!bang` token。除了这 33 个内置站点，你还可以在设置「我的站点」里加自己的站点（存在本地，最多 100 个），同样自动进分类和 `!bang`。

### 深链（可收藏 / 分享）

页面支持几个 URL 参数，**只做预填和预选，不会自动跳转或提交**：

- `?cat=tech`：进入就展开「技术开发」分类（该分类全部 7 个站点），等价于点一下左侧那个分类项；分类会自动同步到地址栏。
- `?cat=all`（或不带 `cat`）：常用视图，只显示 11 个常用站。
- `?q=rust`：进入就把 `rust` 填进搜索框并聚焦（**不会自动搜索**，确认后再按回车）。
- `?site=bilibili`：选中哔哩哔哩所属的分类，并把焦点移到它的按钮上（**不会打开网站**）。
- 可以组合，比如 `?cat=tech&q=rust`；处理顺序是 cat → site → q，保证最后焦点落在搜索框。

明确一点：本项目**不做**「把本站设为浏览器默认搜索引擎」的 `?q=%s` 自动提交——这是有意排除的需求，搜索始终由你按回车或点按钮触发。

### 书签小工具（把选中文字带到搜索框）

在任意网页选中一段文字，点一下书签，就能打开 SimpleSearch 并把这段文字预填进搜索框（**只预填，不自动搜索**，你确认后再按回车）。

添加方法（Chrome / Edge 通用）：

1. 打开「书签管理器」（Windows/Linux `Ctrl+Shift+O`，macOS `⌘+Option+B`）；
2. 新建一个书签，名称随意（例如「搜一下」）；
3. 「网址 / URL」填下面整段代码（是一行，直接复制）：

   ```text
   javascript:(function(){var s=String(window.getSelection());if(s)window.open('https://breathiness.github.io/SimpleSearch/?q='+encodeURIComponent(s.trim()),'_blank')})()
   ```

4. 保存后，在任意网页选中文字，点这个书签即可。

小提示：

- 如果浏览器把 `javascript:` 前缀过滤掉了，手动把开头的 `javascript:` 补回去再保存。
- 这段代码只是拼一个 `?q=<选中文字>` 的链接并在新标签页打开，**不会自动提交搜索**。
- 它和「不做 `?q=%s` 默认搜索引擎自动提交」不冲突：书签是你在网页上主动点击触发的，`?q=` 仍然只预填；自动提交那条路径依然没有实现。

### 设置面板

右上角的设置图标会从右侧滑出一个设置抽屉，里面是：

- **主题模式**：分段控件「跟随系统 / 浅色 / 深色」。选「跟随系统」会把 `ss.theme` 删掉（不会写 `auto`）、并实时跟着系统深浅色变化；选「浅色 / 深色」才写 `ss.theme` 记住。原来那个「夜间模式」开关已经移除了。
- **搜索引擎**：Bing / Google / DuckDuckGo / 百度 四选一，默认 Bing，选择会记住（`ss.engine`）。切换后回车或点「搜索」立刻用新引擎，表单的提交地址和参数名也会自动适配（百度用 `wd`）；联想首项文案也会跟着变成「用 Google 搜索：…」。
- **联网联想**开关（默认开启）。
- **搜索历史**：显示当前条数（例如「搜索历史 3 条」），后面是「清空」按钮，0 条时按钮是禁用状态。
- **我的站点**：右边「管理」按钮会打开「我的站点」对话框，可以可视化新增 / 编辑 / 删除自己的站点（名称、首页、搜索模板、分类、关键词、是否放进常用），存在浏览器本地（`ss.customSites`），**不改代码、不用重新构建**。自定义站点的 id 和关键词会自动成为 `!bang` token；刷新或重开页面都还在，最多 100 个。
- **常用排序**：右边「调整」按钮打开排序对话框，用 ↑ / ↓ / 置顶调整「常用」视图里的站点顺序（存 `ss.order`）。
- **配置导入 / 导出**：导出会下载一个 `simplesearch-config.json`，里面包含自定义站点、常用顺序和主题模式 / 主题色 / 搜索引擎 / 联网联想开关；导入时会校验格式，非法配置整包拒绝并提示。适合备份、迁移或分享自己的配置。
- **键盘快捷键**：右边有「查看」按钮，点开就是快捷键说明对话框（按 `?` 也能打开，见下方键盘操作）。
- Github 仓库链接。
- 底部显示当前版本，例如「简单搜索 v2.10.0」（构建时从 `package.json` 注入）。

点关闭按钮、点遮罩或按 `Esc` 都能收起；打开时焦点会进入面板，关闭后回到设置按钮。分类抽屉、设置抽屉、快捷键说明和「我的站点 / 常用排序」对话框共用一层遮罩，同一时刻只会开一个。

历史还能单条删：联想列表里每条历史右侧都有一个小删除按钮（`✕`），点它就能删；键盘高亮历史项时按 `Delete` 也能删。

下面还有一行**主题色**：19 个 MDUI 主色色块（红 / 粉 / 紫 / 深紫 / 靛蓝 / 蓝 / 浅蓝 / 青 / 蓝绿 / 绿 / 浅绿 / 黄绿 / 黄 / 琥珀 / 橙 / 深橙 / 棕 / 灰 / 蓝灰），点一下整站主色立刻切换——顶栏、选中的分类、搜索按钮、开关和焦点环都会跟着变。默认是靛蓝，选择会被记住（`ss.color`）。

浅色主题用各色的 700 深色档、深色主题用 200 浅色档来保证对比度；黄、黄绿、浅绿、琥珀、青、灰这类浅色系主色，顶栏和按钮上的文字会自动换成深色。主题色只是改 CSS 变量，**切换不产生任何网络请求**。

首屏也不会先闪一下默认色：页面静态就带 `data-color="indigo"`，样式表生效前会用你保存的颜色覆盖。

### v2 新增的小功能

- **清除按钮**：输入框里有内容时右侧出现 `✕`，点一下清空并保持输入状态（不用全选删除）。
- **搜索按钮**：除了回车，也可以直接点「搜索」。输入为空时不会提交一个空查询。
- **关键词联想**：输入时下方出现建议列表，最多 8 条。本地部分（「用 <当前引擎> 搜索：xxx」、匹配到的站点、以前搜过的词）永远可用，断网也在；开启联网联想后，百度返回的词会排在本地站点匹配之后，并在右侧标注「百度」。
- **联网联想（默认开启）**：输入时会把关键词发给百度联想接口（`suggestion.baidu.com`，JSONP），700ms 超时或请求失败会自动退回本地联想，不影响搜索，也不会阻塞键盘操作。在右上角的设置里用「联网联想」开关可以随时关闭，**关闭后不再有任何第三方请求，完全离线**。点击一条百度建议会用它再搜一次。
- **搜索历史**：最近 10 条搜索词，新的在前、自动去重。历史不会单独展示，而是作为联想项出现；联想列表里点历史项会用当前搜索引擎再搜一次。历史可以在设置里看条数、一键清空，也可以在联想列表里单条删除——每条历史右侧有一个小 `✕` 删除按钮，键盘高亮历史项后按 `Delete` 也能删。
- **主题三态（v2.5）**：设置里的「主题模式」可以选「跟随系统 / 浅色 / 深色」。跟随系统时不写存储、系统切换深浅色会实时跟上；选浅色 / 深色会记住（`ss.theme`）。打开时按「`?theme=` 老参数 → 显式选择 → 系统偏好 → 浅色」决定主题，首屏不会闪白/闪黑。
- **可访问性**：联想列表有 `listbox`/`option` 语义，支持 `aria-activedescendant`；键盘可以走完整个流程；按 `Tab` 第一个能拿到「跳到搜索框」的 skip link（获得焦点时才出现在页面顶部）；焦点轮廓和 `prefers-reduced-motion` 都处理了。
- **文档站式布局（v2.3）**：顶部主色应用栏 + 左侧分类导航 + 内容卡片 + 右侧设置抽屉，原来的页脚已移除。
- **主题色可选（v2.4）**：设置里有 19 个 MDUI 主色色块，点一下整站主色切换并记住；实现只是 CSS 变量，零请求。
- **顶栏 logo 与分类图标（v2.4）**：标题左侧加了圆形 logo，左侧分类导航的每个条目也配了小图标，全部内联 SVG、零图片请求。
- **深链（v2.5）**：`?cat=` / `?q=` / `?site=` 只预填、预选，不自动跳转也不自动提交，见「使用说明 · 深链」。
- **版本号（v2.5）**：设置面板底部显示当前版本，构建时从 `package.json` 注入，不用手工改。
- **PWA / 离线（v2.6.0）**：可安装到桌面、独立窗口打开；装过之后断网刷新仍可用（Service Worker 预缓存首页静态资源），升级版本旧缓存自动清理。单文件便携版没有 PWA。
- **`!bang` 快捷搜索（v2.6.0）**：`!` 开头直接在某个站内搜，token 支持站点 id 和中文关键词，比如 `!gh rust`、`!b站 视频`。
- **搜索引擎切换（v2.6.0）**：设置里四选一（Bing / Google / DuckDuckGo / 百度），选择会记住，表单参数自动适配。
- **快捷键说明对话框（v2.6.0）**：按 `?`（焦点不在输入框时）或设置里的「查看」打开，列了 9 条常用快捷键；`Esc` / 关闭按钮 / 点遮罩关闭并把焦点还给触发元素。
- **单文件便携版（v2.6.0）**：`SimpleSearch.html` 一个文件包含全部 CSS/JS/图标，双击即用、零外部请求，方便下载或分享。
- **站点库扩充（v2.7.0）**：内置站点从 11 个扩到 **33 个**，每个分类都补齐；新站点的 `!bang` token 自动可用，图标支持专属图标 / 复用分类图标 / monogram 三级兜底。
- **常用 / 分类视图（v2.8.0）**：默认「常用」只显示 11 个常用站，点分类展开该分类全部站点（卡片标题跟着变）；新增站点默认只在分类里，加 `featured: true` 才进常用视图。
- **可视化自定义站点（v2.9.0）**：设置里「我的站点 → 管理」可以增删改自己的站点（存本地，不改代码、不重新构建），自定义站点的 id / 关键词自动成为 `!bang` token；「常用排序」可置顶；配置可导出 / 导入 `simplesearch-config.json`。
- **站点图标**：每个站点按钮前都有 24×24 的内联 SVG 图标，颜色跟随主题文字色，**不新增任何图片请求**；没配图标的站点自动显示首字符。原理和取舍见「技术说明 · 站点图标」。

### 键盘操作

| 按键 | 作用 |
|---|---|
| `/` | 聚焦搜索框（在输入框里打 `/` 不受影响） |
| `↑` / `↓` | 在联想列表里上下移动（输入框里非空时） |
| `Enter` | 有高亮联想项时采用它；没有高亮时就是普通提交，用当前搜索引擎搜索 |
| `Esc` | 关闭联想列表、分类抽屉或设置面板 |
| `Delete` | 高亮的历史联想项：删除这条历史 |
| `Tab` | 移出搜索框，联想列表自动收起 |
| `?` | 打开键盘快捷键说明（焦点不在输入框时；等价于 Shift + `/`） |
| `Ctrl` / `⌘` / `Alt` + 点击站点按钮 | 在新标签页打开，不覆盖当前页 |

另外支持 `?cat=` / `?q=` / `?site=` 深链（见上文「使用说明 · 深链」），它们只预填 / 预选，不会替你跳转。

## 加载速度

因为整个页面内容和功能都相当简单，所以加载速度是非常快的。

2023 年在原项目上测过：使用 GitHub Pages 的在线版测试的加载完成时间是 **656 毫秒**；本地版（直接双击打开文件）的加载时间更是只要 **3 毫秒**。

v2 / v2.1 之后仍然是**纯静态 + 零依赖**：核心页面与功能不依赖任何第三方资源，没有框架、网络字体或统计脚本；单页静态资源合计大约 196 KB（未压缩），**gzip 传输后约 56 KB**——GitHub Pages 默认走 gzip，所以真实下载量接近后者。本地打开依旧是「点一下就到」的 3 毫秒级体验。（如果开着联网联想，输入关键词会额外发一次百度请求，但那发生在页面加载之后，不影响首屏；站点图标、logo、分类图标都是内联 SVG，也不会多出任何图片请求。）需要说明的是，v2 没有在相同网络条件下重新做一次 656ms/3ms 的计时，所以这里不编新数字——在线时间主要取决于你的网络和 GitHub Pages，本地时间基本只看磁盘。

首屏实测：**16 个请求、零第三方**，其中没有一张站点图片——HTML 一个、CSS 三个、JS 十个、favicon 一个，外加浏览器按 `apple-touch-icon` 惯例抓取的一次 PWA 图标（属预期）。单文件便携版 `SimpleSearch.html` 则是 1 个请求、196.6 KB / gzip 48.0 KB。

PWA 的 `sw.js`（约 2.4 KB）、`manifest.webmanifest`（665 B）和两个 PWA 图标（共约 21 KB）**不计入首屏**：SW 是后台注册的，manifest/图标只在安装时用；体积预算由 `validate` 按磁盘产物校验（**200 KB**），`e2e` 只断言首屏请求数 ≤16、零第三方，不校验体积（SW 接管后传输字节会记 0，不可靠）。单文件便携版另有 260 KB 上限。

解答一下「加图标对速度影响大吗」：v2.2 加站点图标和分类那一轮，未压缩体积从 77 KB 涨到 86 KB，但 **gzip 后只从 28.6 KB 涨到 30.7 KB：真实传输只多约 2.1 KB**，多出来的主要是内联图标 sprite（gzip 后不到 1 KB）和分类导航，没有新增任何图片请求。之后又陆续加了文档站骨架、主题色、logo、分类图标、深链、设置项、PWA、`!bang`、33 个站点库、「常用/分类」视图、自定义站点与配置导入导出，整体约 196 KB / gzip 约 56 KB（预算 200 KB），增长都来自 HTML/CSS/JS 与内联 sprite，依然没有图片请求。

## 自定义网站

自己加站点有两种方式：**设置里可视化添加**（推荐，只影响你自己的浏览器，不改代码）或**改 `assets/js/sites.js` 进仓库内置**（需要重新构建，所有访问者都能看到）。下面先说界面版，再说仓库版。

### 用界面添加（推荐）

1. 右上角设置 → **我的站点** → 管理 → **新增站点**。
2. 填表：名称、首页网址、搜索模板（用 `{q}` 表示关键词，例如 `https://example.com/search?q={q}`）、分类（技术开发 / 社区问答 / 影音游戏 / 购物 / 素材资讯，五选一）、关键词（空格分隔，可选）、是否放进「常用」。
3. 保存后按钮**立刻**出现在对应分类里（勾了「常用」就同时进常用视图），不用 `npm run build`；刷新或重开页面都还在。
4. 列表里可以继续编辑 / 删除；站点 id 会自动生成（`custom-…`），它的 id 和关键词会自动成为 `!bang` token。
5. 校验规则：首页和搜索模板必须是 `https://`，搜索模板必须含 `{q}`，分类必须在上面 5 个里，最多 100 个自定义站点；不合法会提示原因、不会写入。

自定义站点和常用顺序都存在浏览器本地（`ss.customSites` / `ss.order`），不会上传；设置里的**配置导出 / 导入**可以把它们和主题、搜索引擎等一起备份成 `simplesearch-config.json`，换电脑时导入即可。

### 写进仓库：改 sites.js（内置站点）

如果想让站点成为**所有访问者**都能看到的默认内置站点，才需要改 `assets/js/sites.js` 并重新构建。`npm run build` 会从这一份数据生成五个产物：唯一真实页面 `index.html`、单文件便携版 `SimpleSearch.html`、两个 0 秒跳转的重定向壳 `SimpleSearch-Light.html` / `SimpleSearch-Dark.html`，以及 PWA 用的 `sw.js`。**不用再去 HTML 里手改**。

1. 打开 `assets/js/sites.js`，在 `SS.sites` 数组里加一条（顺序就是按钮顺序）：

   ```js
   {
     id: 'example',                                   // 唯一、小写、只含 [a-z0-9-]
     label: '示例站点',                                // 按钮上显示的文字
     home: 'https://example.com',                     // 空关键词时直接打开
     search: 'https://example.com/search?q={q}',      // 站内搜索地址，必须有 {q}
     keywords: ['示例', 'demo'],                       // 可选，用于关键词联想和 !bang token
     group: 'tech',                                   // 必填：所属分类，见 SS.siteGroups
     icon: 'cat-tech',                                // 可选：复用分类图标；也可写专属图标 symbol 名
     featured: true,                                  // 可选：true 才进「常用」视图（默认只在分类里）
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
       icon: 'cat-tech',
       featured: true,
     },
   ]
   ```

2. 重新生成五个产物（`index.html` + `SimpleSearch.html` + 两个重定向壳 + `sw.js`）：

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

- **分类必填**：每个站点要带 `group`，取值来自 `assets/js/sites.js` 里的 `SS.siteGroups`。目前有 5 个：`tech`（技术开发）、`community`（社区问答）、`media`（影音游戏）、`shopping`（购物）、`content`（素材资讯）；左侧导航条目的顺序就是 `SS.siteGroups` 数组的顺序。
- **加新分类**：在 `SS.siteGroups` 里追加 `{ id: 'xxx', label: '显示名' }`，再把相关站点的 `group` 指过去。站点缺 `group` 或 `group` 不在表里时 `npm run build` 会失败；分类暂时没有站点时 build 会给警告（建议别留空分类）。
- **图标可选**：不配图标就自动显示站点名的首字符（monogram）；想复用分类图标可以写 `icon: 'cat-tech'`（或 `cat-community` / `cat-media` / `cat-shopping` / `cat-content`）；想要专属图标就在 `scripts/icons.mjs` 里加一条（键是站点 `id`），再 `npm run build`。构建时按「站点专属 symbol → `icon` 指定的 symbol → 首字符 monogram」的顺序解析，图标是 dev-time 数据，不会变成图片请求。
- **常用标记可选**：新增站点**默认只出现在对应分类里**；想让它出现在「常用」视图（默认视图）就加 `featured: true`。内置的 11 个站点都带这个标记。

### 删除网站

把对应对象从 `SS.sites` 里删掉，再 `npm run build` 一次就行。生成页和运行时数据都只认这个数组。

### 几条注意事项

- `search` 里的 `{q}` **原样写**，编码交给代码（`assets/js/search.js` 会做 `encodeURIComponent`）。不要自己写 `%20` 或 `+`，否则中文和特殊符号会断链。
- `home` 和 `search` 必须是 `https://` 开头；`search` 必须包含 `{q}`，否则 `npm run build` 会直接报错。
- 只改了 `sites.js` 却忘了跑 `npm run build`，提交上去的 HTML 会和数据对不上——CI 的产物漂移检查会拦住这种提交，本地 `npm run validate` 也能发现。
- 新增站点必须给 `group`（取值见 `SS.siteGroups`）；`group` 缺失或不在表里 `npm run build` 会失败，分类暂时没有站点时 build 会警告（建议别留空分类）。
- 图标可选：不配就 monogram；想复用分类图标写 `icon: 'cat-<group>'`；专属图标只改 `scripts/icons.mjs`（dev-time），不要引外部图标库或 CDN。
- 想要进「常用」视图就加 `featured: true`（不加则只在分类视图里出现；内置 11 站都有）。
- 新站点的 `id` 和 `keywords` 会自动成为 `!bang` token（例如 id 为 `example` 时 `!example 词` 可用），不需要额外注册。
- 字段含义、更多站点的搜索地址模板、图标与分类的完整说明，见 [docs/custom-sites.md](docs/custom-sites.md)。
- 默认内置 33 个常用站点，其中**内置站点的 id 和它们之间的相对顺序**由 `tests/sites.test.mjs` 固定。**新增站点不会让测试变红**（测试只要求内置站点都在、且相对顺序不变）；只有删掉内置站点时 `npm test` 才会提示你恢复。自己用的话随便增删，跑一次 `npm run build` 就行。
- 如果只是自己用，**优先用设置里的「我的站点」界面添加**：存本地、不构建、刷新还在；改 `sites.js` 只适合想提交进仓库当内置站点的情况。

## 目录结构

```
SimpleSearch/
├─ assets/
│  ├─ css/                  # tokens.css（配色变量）/ base.css（页面骨架）/ input.css（输入区）
│  ├─ img/                  # favicon.svg + PWA 图标 icon-192.png / icon-512.png
│  └─ js/                   # 10 个经典脚本：sites / search / suggest / history / theme / remote / input / sites-store / sites-admin / app
├─ docs/
│  ├─ contract.md           # 接口契约（开发前先读）
│  ├─ custom-sites.md       # 自定义网站完整说明
│  └─ CHANGELOG.md          # 更新日志
├─ scripts/
│  ├─ build.mjs             # 由模板 + SS.sites + scripts/icons.mjs 生成 index.html、两个壳和 sw.js
│  ├─ icons.mjs             # 站点 / UI / logo / 分类图标数据（dev-time，只在构建时读取，不进运行时）
│  ├─ validate.mjs          # 静态校验 + 产物一致性检查
│  ├─ check-sites.mjs       # 可选的站点健康自检（需网络；--json 供巡检 workflow 用）
│  ├─ site-health-report.mjs # 巡检 JSON → Markdown 报告（workflow 用，输出 fail/warn 到 GITHUB_OUTPUT）
│  ├─ visual.mjs            # 本地视觉回归：截图、与 tests/visual 基线对比、--update 更新基线
│  ├─ serve.mjs             # 零依赖本地静态服务器
│  └─ e2e.mjs               # 可选的真实浏览器端到端检查
├─ templates/
│  ├─ page.html             # 唯一真实页面的模板（顶栏 / 分类导航 / 卡片 / 设置抽屉 / 快捷键对话框 + 图标 sprite 占位）
│  ├─ redirect.html         # 两个重定向壳的模板
│  └─ sw.js                 # Service Worker 模板（build 注入版本号与 precache 列表）
├─ tests/                   # node:test 单元测试
├─ .github/workflows/
│  ├─ ci.yml               # push / PR：构建、测试、静态校验
│  └─ site-health.yml      # 每周一 01:00 UTC 站点巡检；有 WARN/FAIL 时开/评论 tracking issue
├─ manifest.webmanifest     # PWA manifest（手写，install/standalone/图标）
├─ sw.js                    # Service Worker，由 npm run build 生成，请勿手改
├─ index.html               # 唯一真实页面（多文件 + PWA），由 npm run build 生成，请勿手改
├─ SimpleSearch.html        # 单文件便携版（CSS/JS/图标全内联、零外部请求），由 npm run build 生成，请勿手改
├─ SimpleSearch-Light.html  # ↓ 两个 0 秒重定向壳，由 npm run build 生成，请勿手改
├─ SimpleSearch-Dark.html   #   Light → index.html?theme=light，Dark → index.html?theme=dark
├─ package.json
├─ README.md / CONTRIBUTING.md / LICENSE / .nojekyll / .gitignore / .gitattributes
```

## 本地开发

需要 Node.js 21+（开发和 CI 实际用的是 22；`npm test` 的 glob 参数需要 Node ≥ 21）。**不需要 `npm install`**——`package.json` 里没有任何依赖，克隆下来直接跑。

| 命令 | 作用 |
|---|---|
| `npm run build` | 由模板 + `assets/js/sites.js` + `scripts/icons.mjs` 生成 5 个产物：`index.html`、`SimpleSearch.html`、两个重定向壳、`sw.js`（**改完站点或模板后必须跑**） |
| `npm test` | 跑全部单元测试（Node 内置 `node:test`） |
| `npm run validate` | 静态检查 + 生成产物是否最新 |
| `npm run check` | 构建 + 测试 + 校验，提交前/CI 都用这个 |
| `npm run serve` | 本地静态服务器，默认 <http://127.0.0.1:8080/> |
| `npm run e2e` | 可选：用本机 Edge/Chrome 跑真实浏览器检查（没装浏览器会跳过，CI 不跑），截图输出到已 gitignore 的 `artifacts/` |
| `npm run coverage` | 可选：用 Node 内置测试覆盖率跑一遍，阈值 90% 行 / 75% 分支 / 80% 函数，低于阈值会失败；**不进 CI 必跑**，零依赖 |
| `npm run check:sites` | 可选：逐个请求各站点的 `home` / 搜索地址，报告 OK / WARN / FAIL（WARN 多为反爬 401/403 或跨域跳转；**需要网络、不进普通 CI**）。加 `--strict` 时只有 FAIL 才退出 1；加 `--json` 时 stdout 只输出一个 JSON（诊断写 stderr） |
| `npm run visual` | 可选：本地视觉回归，和 `tests/visual/` 基线逐像素比较 4 个固定状态（无基线时会提示先 `visual:update` 并跳过；**不进 CI**） |
| `npm run visual:update` | 更新视觉回归基线（改完 UI 后先在本地跑、人工确认新截图，再把 `tests/visual/*.png` 一起提交） |

```bash
npm run serve
# 打开 http://127.0.0.1:8080/
```

当前测试基线：`npm test` **207 例**、`npm run validate` **29 项**、`npm run e2e` **172 项**全绿；`npm run coverage` 行覆盖 **96.04%** / 分支 **80.3%** / 函数 **87.17%**（阈值 90/75/80）。`e2e` 是可选的真实浏览器检查（本机 Edge/Chrome，CI 不跑），覆盖单页主题解析、主题三态与主题色、深链、`!bang`、搜索引擎切换、快捷键对话框、PWA 注册与断网刷新、单文件便携版（零外部资源/内联样式脚本）、常用/分类视图与卡片标题、33 站点渲染与图标、自定义站点增删改与配置导入导出、联网联想开关与真实百度联调、分类导航与抽屉、设置面板、搜索历史管理、版本号、图标 sprite（无额外图片请求）、960px 断点与移动端布局和 `file://` 打开。

## 维护与回归

### 维护：站点巡检（每周自动）

- **自动跑**：`.github/workflows/site-health.yml` 每周一 **01:00 UTC（北京时间 09:00）** 检查全部内置站点的 `home` / `search`，也可以手动触发（Actions → 站点巡检 → Run workflow，或 `gh workflow run site-health`）。
- **有 WARN / FAIL 时**：workflow 会确保仓库里有 `site-health` 标签，然后找**已打开的** `site-health` issue 评论追加报告；没有就新建一个，标题固定「站点巡检：需要人工确认的链接」。报告同时生成在 `site-health-report.md`。
- **本地手动**：`npm run check:sites`（人读表格）、`npm run check:sites -- --strict`（有 FAIL 时退出 1）、`npm run check:sites -- --json`（stdout 纯 JSON，便于脚本处理）。
- 401 / 403 / 429 / 跨域跳转 / 超时这类 WARN 多为反爬或地区限制，**不一定是坏链**，点开浏览器确认一下再决定要不要改。
- workflow 只用官方 `actions/checkout`、`actions/setup-node` 和 runner 预装的 `gh`，**不跑 `npm install`、没有第三方 action**。

### 维护：视觉回归（本地按需，不进 CI）

- `npm run visual`：启动本地服务器 + 本机 headless Edge/Chrome，截 4 个固定状态（`common-light-1200`、`common-dark-1200`、`mobile-light-390`、`settings-open-1200`），与 `tests/visual/` 里的基线逐像素比较（单通道容差 8，差异像素比例 > 0.3% 判失败）；新截图和 diff 图写到 `artifacts/visual/`。
- 改完 UI 且确认新样子没问题后，用 `npm run visual:update` 更新 `tests/visual/*.png` 基线，并把基线一起提交；平时 `npm run visual` 用来发现「无意中改坏了布局」。
- **不进 CI**：不同系统/浏览器的字体渲染差异大，硬比较容易误报，所以只在本地按需跑。

### 维护：体积硬门禁

- `npm run validate`（以及 CI 的 `npm run check`）会把体积当**硬失败**：多文件版 `index.html` 首屏资源超过 **200 KB**、或单文件版 `SimpleSearch.html` 超过 **260 KB**，命令直接退出 1、CI 变红。
- gzip 数字只作为信息输出（真实成本口径），不单独卡；当前实测约 196.4 KB / gzip 55.7 KB，离 200 KB 余量不大，加东西前先想一下。
- 超限了要么优化体积，要么**显式提高预算并写清理由**（见 [CONTRIBUTING.md](CONTRIBUTING.md)「体积硬门禁」），不要悄悄改大数字。

## 技术说明

- **线上零构建、零运行时依赖**：开发时 `scripts/build.mjs` 在本地生成 `index.html`、`SimpleSearch.html`（单文件便携版）、`sw.js` 和两个重定向壳并提交入库；部署后浏览器拿到的就是纯 HTML/CSS/JS，没有框架、没有包管理器、没有构建步骤。
- **PWA / 离线（v2.6.0）**：`manifest.webmanifest` 提供安装信息（`standalone`、192/512 图标）；`sw.js` 由构建从 `templates/sw.js` 生成，注入版本号（当前 2.10.0）和 16 项 precache 列表——`install` 预缓存、`activate` 清掉旧版本缓存并 `claim`、`fetch` 只处理同源 GET（导航请求回退缓存的首页，跨域请求直接放行不缓存）。`file://` 下不注册；换版本后旧缓存自动清理。
- **单文件便携版（v2.6.0）**：`SimpleSearch.html` 由 `index.html` 内联生成——3 个 `<style>`、10 个经典脚本 + 防闪烁脚本 + `window.__SS_SINGLE_FILE` 标记；favicon 转成 data URI，移除 manifest / apple-touch-icon；`app.js` 看到 `__SS_SINGLE_FILE` 就不注册 SW。因此它**零外部请求**、双击即用，但没有 PWA 安装/离线缓存，且任何改动都要整页重下。
- **`!bang`（v2.6.0）**：`SS.search.resolveBang` 是纯函数，`!<token> [词]` 的 token 按注册表顺序先比 `site.id` 再比 `keywords`（小写精确匹配、支持中文），只认第一个 token；命中后 `url/kind` 复用 `resolveSite`，无词就是站点首页。未知 token / `!` 后接空白 / `!!x` 一律返回 `null`，当普通搜索。
- **搜索引擎（v2.6.0）**：`SS.engines` 有 Bing / Google / DuckDuckGo / 百度四个定义（各自带 `search` 模板和 `param`：百度用 `wd`，其余 `q`）；`ss.engine` 记住选择，切换时同步 `SS.defaultEngine`、表单 `action`、输入框 `name`，联想首项文案跟着变。
- **快捷键说明（v2.6.0）**：按 `?`（焦点不在输入框）或设置里的「查看」打开 `#shortcuts-dialog`，列 9 条快捷键；`Esc` / 关闭按钮 / 遮罩关闭，并把焦点还给触发元素。
- **经典脚本（classic script，无模块化）**：`assets/js/*.js` 全部是 IIFE + `globalThis` 的普通脚本（ES2015+ 语法，不用 `import` / `export`、不用 `type="module"`），不需要打包。所以既能被浏览器直接加载，也能被 Node 直接 `import()` 做单元测试。
- **主题三态**：`index.html` 的 `<html data-theme-default="auto">`。首屏内联脚本按 `?theme=` 老参数 → `localStorage['ss.theme']`（只表示「显式选择的浅色 / 深色」）→ `prefers-color-scheme` → 浅色 决定主题，避免闪烁；选「跟随系统」时会删除 `ss.theme`（不会写 `auto`），系统深浅色变化会实时跟随。`?theme=` 会被持久化并用 `history.replaceState` 从地址栏去掉（老链接语义，和可分享的 `?cat=` 不同）。
- **深链（v2.5）**：`?cat=` / `?q=` / `?site=` 在启动时只做「预选分类 / 预填搜索词 / 预选分类并聚焦站点按钮」，**不自动提交、不跳转**；执行顺序 cat → site → q。点分类时用 `history.replaceState` 同步 `?cat=`（`all` 时删掉参数），所以分类视图可收藏。**没有实现 `?q=%s` 默认搜索引擎自动提交**，这是按需求有意排除的。
- **主题色（v2.4）**：19 组 MDUI 主色存在 `assets/css/tokens.css` 里，分「一层色值（`--c-500/700/200`）+ 一层语义变量（`--primary` / `--primary-bg` / `--focus-ring` / `--on-primary`）」。`<html data-color>` 一换，整站主色跟着变，不请求任何资源；首屏内联脚本在设置 `data-theme` 的同时设置 `data-color`，所以不会先闪一下默认色。浅色主题用 700 档、深色主题用 200 档，浅色系颜色的 `--on-primary` 自动用深色文字。
- **文档站式骨架**：主色应用栏（汉堡 / 圆形 logo / 标题 / 设置）+ 240px 左侧分类导航（每项带内联小图标）+ 内容区两张卡片；<960px 时导航变成抽屉。设置项（主题模式、主题色、搜索引擎、联网联想、搜索历史、快捷键、版本号）都收在右侧抽屉里，原来的页脚已移除，没有 `#site-footer`。
- **常用 / 分类视图（v2.8.0）**：`sites.js` 里可选的 `featured: true` 决定站点是否进「常用」；build 给 featured 按钮加 `data-featured="true"`、给非 featured 按钮直接加 `hidden`（无 JS 时默认只看到 11 个常用站）。`app.js` 的 `applyGroupFilter` 同时更新导航 `aria-current`、按钮显隐和卡片标题（常用 →「常用网站」，分类 → 分类名），启动时和深链处理后都会跑一次。
- **自定义站点（v2.9.0）**：`sites-store.js` 负责读写本地自定义站点 / 排序 / 配置导入导出（纯函数 + 注入 storage），`sites-admin.js` 负责两个对话框的增删改与排序。启动时把内置站点与自定义站点合并、按 `ss.order` 排序后再交给联想 / `!bang` / 渲染；`refreshSiteButtons()` 重建按钮时复用 build 写出的 `data-icon`（自定义站点用 `icon` 或 monogram），并重新套用当前视图的 `hidden`。导入只做 `JSON.parse` + schema 校验，不执行任何代码；非法整包拒绝。
- **`file://` 双击可用**：下载仓库后直接双击 `index.html` 就能用，不需要起服务器（这也是本地 3 毫秒的来源）；两个老 HTML 文件也能双击，会跳到 `index.html`；`file://` 下不会注册 Service Worker。
- **单一数据源**：站点只写在 `assets/js/sites.js` 一处；页面只有一份（`index.html`），明暗两套只是 `assets/css/tokens.css` 里的两套 CSS 变量，不会再出现「浅色页有、夜间页没有」的漂移。
- **第三方请求**：核心页面与核心功能零第三方资源——字体用系统字体栈，没有 CDN、没有统计、没有追踪、没有网络字体。唯一的例外是默认开启的**联网联想**：输入关键词时会向 `suggestion.baidu.com` 发一次 JSONP 请求；在设置里关掉后**零第三方请求**，联想只剩本地数据，完全离线可用。目前只接了百度一个源；`SS.remote.provider` 是可插拔的，但实测 Google / DuckDuckGo 的联想接口不一定可达、Bing 的 `osjson` 没有 CORS 头，所以没有接更多源（想接的话见 [CONTRIBUTING.md](CONTRIBUTING.md)）。Service Worker 只缓存同源静态资源，跨域请求一律直接放行、不缓存。
- **状态只存本地**：`localStorage` 里只有 `ss.theme`（显式选择的浅色 / 深色；跟随系统时该键不存在）、`ss.color`（主题色）、`ss.engine`（搜索引擎）、`ss.history`（最近 10 条搜索词）、`ss.remote`（联网联想开关）五个键；隐私模式/禁用存储时会自动降级，不报错、不影响核心功能。深链参数只存在 URL 里，不会额外写入存储。
- **体积**：单页静态资源合计约 196 KB（未压缩；**gzip 后约 56 KB**，预算 200 KB），其中内联图标 sprite 约 8.2 KB（gzip 约 1.34 KB）、`remote.js` 约 10 KB。`sw.js` / `manifest.webmanifest` / PWA 图标不算首屏资源（SW 后台注册、manifest 安装时才用）。所有资源都是仓库里的本地文件，没有第三方运行时、没有框架。

### 设计风格

界面观感参考 **MDUI 1 / Material Design 1**：19 组 MDUI 主色可换（默认靛蓝 `#3f51b5`）、2px 圆角、2/4/8dp 三档 elevation 阴影、点击涟漪反馈、下划线输入框、主色 raised 搜索按钮、MD1 菜单式联想下拉。v2.3 起页面骨架也照 MDUI 1 文档站来：主色顶栏（带圆形 logo）、左侧分组导航（带小图标）、内容卡片、右侧设置抽屉里的 MD1 开关行和色块。深浅两套配色都按 MD1 的文本不透明度体系单独调过。

这些**全部是自研手写 CSS**（变量集中在 `assets/css/tokens.css`）：项目没有引入 MDUI 库，也没有 CDN、网络字体或任何第三方资源。说「MDUI 1 风格」指的是视觉语言，不是依赖。

### 站点图标：内联 SVG sprite，不新增请求

v2.2 给每个站点按钮加了图标，但**没有新增任何图片请求**：

- 图标在构建时全部内联进 `index.html`：一个隐藏的 `<svg class="icon-sprite">` 里放一组 `<symbol id="i-<站点id>">`，按钮里用 `<use href="#i-<站点id>">` 引用。浏览器只解析当前 HTML，不会去下载图片。
- sprite 里现在有 **32 个 symbol**：22 个站点图标（最早 11 个 + 新站点里 11 个画了专属图标的）、3 个 UI 图标（`#i-menu` / `#i-settings` / `#i-close`）、1 个顶栏 logo（`#i-logo`）、6 个分类图标（`#i-cat-all` / `#i-cat-tech` / `#i-cat-community` / `#i-cat-media` / `#i-cat-shopping` / `#i-cat-content`）。另外 11 个新站点用 `icon: 'cat-<group>'` 复用分类图标，不重复占 symbol。全部内联、全部零请求。
- 图标是 24×24、`fill="none"` + `stroke="currentColor"` 的线条，颜色自动跟随主题文字色，深浅色不用各存一套。
- 图标数据在 `scripts/icons.mjs`，是 **dev-time 资产**：只在 `npm run build` 时被 Node 读取，运行时不加载、不增加任何请求。
- 没有配图标的站点（比如你自己加的）会退化成首字符 monogram（`<span class="button-icon-text">首</span>`），零额外成本。
- 新站点不一定要新画图标：站点可以带 `icon` 字段复用分类图标（例如 `icon: 'cat-tech'`），build 的解析顺序是「站点专属 symbol → `icon` 指定的 symbol → 首字符 monogram」。
- 体积：sprite 约 **8.2 KB**（未压缩），gzip 后约 **1.34 KB**；全站静态资源约 **196 KB** 未压缩 / gzip 约 **56 KB**。光看「图标 + 分类」这一轮，**真实传输量只比 v2.1 多约 2.1 KB（gzip）**——未压缩数字看着多了 9 KB，但 SVG sprite 压缩率很高。

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
- **联网联想默认开启**：输入时会把关键词发给百度（`suggestion.baidu.com` 的 JSONP 联想接口）。不需要的话在右上角设置里把「联网联想」开关关掉，之后**不会发出任何第三方请求**，完全离线可用。
- 浏览器本地只存七个键，且不会上传、不含账号或身份信息：

  | 键 | 内容 |
  |---|---|
  | `ss.theme` | 显式选择的浅色 / 深色；选「跟随系统」时不存在 |
  | `ss.color` | 主题色（颜色 id，默认 `indigo`） |
  | `ss.engine` | 搜索引擎（`bing` / `google` / `ddg` / `baidu`，默认 `bing`） |
  | `ss.history` | 最近 10 条搜索词（可清空 / 单条删除） |
  | `ss.remote` | 联网联想开关（`on` / `off`） |
  | `ss.customSites` | 自定义站点（JSON 数组） |
  | `ss.order` | 「常用」视图的站点顺序（站点 id 数组） |

  清理站点数据即可全部删除；「我的站点」里的导出 / 导入只读写本地 JSON 文件。
- Service Worker 只缓存本站的静态文件（页面、CSS、JS、图标、manifest），**不缓存跨域请求**、不向第三方上报任何内容；卸载应用或清理站点数据即可删掉缓存。
- `?cat=` / `?q=` / `?site=` 深链只从 URL 读取，不会把这些状态额外写进本地存储。
- 搜索本身是浏览器原生表单提交到所选搜索引擎或目标站点，不经过任何中间服务器。

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

- [x] 站点分类（左侧导航，小屏变抽屉，不记忆；默认视图自 v2.8 起为「常用」）
- [x] 站点图标（内联 SVG sprite，零额外图片请求，monogram 兜底）

v2.3 又补上的：

- [x] 文档站式骨架（主色顶栏 + 左侧分类导航 + 内容卡片）
- [x] 设置改到右上角、右侧抽屉里的 MD1 开关行（页脚移除）

v2.4 又补上的：

- [x] 主题色可选（19 组 MDUI 主色，选择会记住，零请求）
- [x] 顶栏圆形 logo 与左侧分类小图标（依旧全部内联、零图片请求）

v2.5 又补上的：

- [x] 深链：`?cat=` / `?q=` / `?site=` 只预填 / 预选，不自动跳转
- [x] 主题三态：跟随系统 / 浅色 / 深色
- [x] 搜索历史管理：条数、清空、单条删除（鼠标按钮或 `Delete`）
- [x] 设置里显示版本号、`npm run check:sites` 可选站点健康自检

v2.6.0 又补上的：

- [x] PWA / 离线安装（manifest + Service Worker，断网刷新可用）
- [x] `!bang` 站点快捷搜索（token 支持站点 id 与关键词）
- [x] 搜索引擎切换：Bing / Google / DuckDuckGo / 百度
- [x] 快捷键说明对话框（按 `?` 或设置里「查看」打开）
- [x] `npm run coverage` 覆盖率门槛（90 / 75 / 80）
- [x] 单文件便携版 `SimpleSearch.html`（全部内联、零外部请求、双击即用）

v2.7.0 又补上的：

- [x] 站点库从 11 个扩到 33 个（每个分类补齐 4–5 个）
- [x] 新站点自动可用 `!bang`；图标支持 `icon: 'cat-<group>'` 复用分类图标 + monogram 兜底

v2.8.0 又补上的：

- [x] 导航首项改「常用」，默认只显示 11 个常用站；点分类展开该分类全部站点
- [x] 卡片标题跟随视图；新增站点用 `featured: true` 决定是否进常用
- [x] 无 JS 时默认也只显示 11 个常用站（build 预置 `hidden`）

v2.9.0 又补上的：

- [x] 设置里可视化增删改自定义站点（存本地，不改代码），自动进分类与 `!bang`
- [x] 常用排序 ↑ / ↓ / 置顶，保存顺序
- [x] 配置导出 / 导入 `simplesearch-config.json`（自定义站点 + 排序 + 主题 / 引擎 / 联想设置）
- [x] README 提供「把选中文字带到搜索框」的书签小工具

v2.10.0 又补上的：

- [x] 站点巡检自动化：每周一 workflow 跑 `check:sites`，有 WARN/FAIL 时在 `site-health` tracking issue 评论/新建
- [x] 体积硬门禁：多文件版 >200 KB 或单文件版 >260 KB 时 `validate` / CI 直接失败
- [x] 本地视觉回归：`npm run visual` 对比基线、`npm run visual:update` 更新基线（不进 CI）

**明确不做**：把本站设为浏览器默认搜索引擎（`?q=%s` 自动提交）——这是按需求有意排除的，搜索始终由你触发。

还可以做（**以下都还没实现**）：

- [ ] 自选/自建更多联想源（现在只接了百度）
- [ ] 视觉回归进 CI（跨平台字体渲染差异大，暂时只在本地跑）

## 灵感来源

灵感来自于 AnywhereAnything 网站，以及 via 作者写的 viayoo。这两个聚合搜索网站有个我非常喜欢的功能：输入关键词，然后点网站，即在那个网站里搜索；而不输入关键词直接点击网站就是直接打开。

但是非常可惜的是 viayoo 现在改成了 via 浏览器的介绍页面，现在没办法使用了。而 AnywhereAnything 只能在桌面端使用，并且加载速度慢。

我其实一直都很想要一个能满足上面提到的功能，并且速度足够快的聚合搜索网站。估计是我这个需求太过小众且简单，在网络上一直没有找到有其他类似的网站。刚好最近想测试一下 Bing 的能力如何。于是将我的需求描述了一下，然后就有了现在这个项目。

v2 重构把站点收拢到一处、补上了当年想加的几个小功能，v2.1 把明暗切换合进单页、加了可关闭的联网联想，v2.2 补上分类和图标，v2.3 换成文档站式骨架，v2.4 加了可换的主题色、顶栏 logo 和分类小图标，v2.5 补了深链、主题三态和历史管理，v2.6 加了离线安装、`!bang`、搜索引擎切换、快捷键说明和单文件便携版，v2.7 把站点扩到 33 个，v2.8 把默认视图改成「常用 + 分类展开」，v2.9 让自定义站点、排序和配置导入导出都能在设置里完成，v2.10 又把巡检、体积硬门禁和视觉回归补进工程流程，但上面这些初衷没变。

## License

[MIT](LICENSE) © 2023 breathiness

界面设计语言参考 [MDUI](https://www.mdui.org/) / Material Design 1，仅参考视觉规范，未引入其库或任何第三方资源。

<br>

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

