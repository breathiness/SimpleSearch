# 更新日志

本项目的对用户可见变化都记录在这里。
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：主版本号在页面结构/使用方式有明显变化时递增。

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
