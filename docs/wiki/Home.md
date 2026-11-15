# 简单搜索 Wiki

**SimpleSearch（简单搜索）** 是一个超简单的聚合搜索网站：输入关键词，然后点击网站按钮，就在那个网站里搜索；不输入关键词直接点，就打开那个网站。

纯静态 · 零依赖 · 双击即用 · 本地打开 3 毫秒级。

- 在线使用：<https://breathiness.github.io/SimpleSearch/>
- 源码仓库：<https://github.com/breathiness/SimpleSearch>
- 单文件便携版：[`SimpleSearch.html`](https://github.com/breathiness/SimpleSearch/raw/main/SimpleSearch.html)（下载后双击即用）

## 快速开始

1. 打开 <https://breathiness.github.io/SimpleSearch/>。
2. 想搜什么就输入关键词，按回车（默认用 Bing）——或者在输入关键词后点某个站点按钮，直接在那个站点里搜。
3. 不输入任何东西直接点站点按钮，就是打开那个网站首页。
4. 右上角齿轮可以换主题、主题色、搜索引擎、管理自己的站点、导入导出配置。

## 文档目录

| 页面 | 内容 |
|---|---|
| [功能详解](功能详解) | 基本操作、`!bang`、分类导航、33 个内置站点、深链、设置面板、书签小工具、键盘操作 |
| [自定义站点](自定义站点) | 在界面里添加自己的站点（不改代码）、或把站点写进仓库 |
| [技术实现](技术实现) | 纯静态架构、构建产物、PWA/离线、单文件版、主题三态、内联图标 sprite、性能与体积 |
| [本地开发与测试](本地开发与测试) | 命令、测试基线、目录结构、视觉回归、体积门禁、每周站点巡检 |
| [常见问题](常见问题) | 为什么不做默认搜索引擎、数据存在哪、断网可用吗、怎么清理数据等 |
| [更新日志](https://github.com/breathiness/SimpleSearch/blob/main/docs/CHANGELOG.md) | 各版本变化（仓库里的 CHANGELOG.md） |

## 版本

当前版本 **v2.10.1**（版本号显示在设置面板底部）。GitHub Releases 里按里程碑打了 `v2.4.0` 起的 tag。

## 隐私一句话

不接入统计、追踪、广告脚本；浏览器本地只存 7 个 `localStorage` 键；唯一可能的外发请求是**默认开启、可一键关掉**的联网联想（关键词发给百度）。
