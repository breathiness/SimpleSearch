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
├─ scripts/           # build.mjs / serve.mjs / validate.mjs / e2e.mjs
├─ templates/         # page.html（真实页）/ redirect.html（两个重定向壳）
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
- **视觉风格参考 MDUI 1 / Material Design 1**（主色、2px 圆角、elevation 阴影、涟漪、下划线输入框、raised button），但**全部是自研手写 CSS**：不引入 MDUI 库、不引入任何 CDN 或第三方资源。改样式时沿用 `tokens.css` 里的变量，别硬编码颜色。
- 不引入 `!important`；保留可见的 `:focus-visible` 焦点轮廓；动画要尊重 `prefers-reduced-motion: reduce`。
- **不新增第三方依赖、CDN、字体或追踪脚本**；所有核心功能必须断网可用。唯一的网络请求是**可关闭**的联网联想（见下）。
- 读写 `localStorage`、`window.open` 等可能失败的调用要放在 `try/catch` 或做能力判断里（隐私模式不能报错）。
- DOM 契约（`#search-input`、`#suggest-list`、`#theme-toggle`、`#suggest-source-toggle`、`#buttons-container .button[data-site]` 等 id/class）由 `docs/contract.md` 规定，改动前先确认没有别的模块依赖。

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
- 自测：关掉页脚「联网联想」后，浏览器 Network 面板里不应出现 `suggestion.*` 请求；断网时联想列表仍只有本地数据、搜索照常。

## 新增或删除网站

只改 `assets/js/sites.js` 的 `SS.sites` 一处，然后 `npm run build` 重新生成三个产物（`index.html` + 两个重定向壳）。字段含义、`{q}` 占位规则与完整示例见 [docs/custom-sites.md](docs/custom-sites.md)。

```js
{
  id: 'example',
  label: '示例站点',
  home: 'https://example.com',
  search: 'https://example.com/search?q={q}',
  keywords: ['示例', 'demo'],
},
```

- `id` 只能是小写字母/数字/连字符且全表唯一；`home`、`search` 必须是 `https://`；`search` 必须含 `{q}`。
- **不要自己编码关键词**（不要手写 `%20`），`{q}` 交给代码替换。
- 新增站点不会影响 `npm test`；如果删掉了默认内置的站点，测试会失败并提示恢复（内置站点是契约的一部分）。
- 改完记得把三个生成的 HTML 一起提交。

## 测试与 CI

- 单元测试用 Node 内置的 `node:test`，放在 `tests/`，文件名以 `.test.mjs` 结尾，`npm test` 用 `node --test "tests/**/*.test.mjs"` 的 glob 自动发现，不用额外登记。
- `tests/sites.test.mjs` 要求默认内置的 11 个站点都存在、且相对顺序一致；**新增站点不会让测试变红**，删除内置站点才会失败并提示恢复。
- 提交/开 PR 前必须本地跑通 `npm run check`（构建 + 测试 + 静态校验/产物一致性）。
- 当前测试基线：`npm test` **117 例**、`npm run validate` **11 项**、`npm run e2e` **63 项**全绿。
- `npm run e2e` 用本机 Edge/Chrome（CDP）跑真实浏览器检查：单页主题解析（`?theme=` → 存储 → 系统 → 浅色）、两个旧链接的 0 秒跳转与地址栏清理、联网联想开关 / 超时降级 / 真实百度联调、移动端 390px、`file://` 打开。CI 不跑它（需要浏览器）。
- GitHub Actions（`.github/workflows/ci.yml`）在 `push` 和 `pull_request` 时用 Node 22 跑 `npm run check`，并检查三个生成产物是否与 `sites.js` / 模板漂移。
- 本项目零依赖，CI 里**不需要 `npm ci` / `npm install`**。
- 只改文档或样式时也请跑一次 `npm run check`，确认没有把生成页改漂。

## PR 检查清单

- [ ] `npm run check` 本地全绿
- [ ] 改动范围内没有手工编辑三个生成 HTML（它们由 `npm run build` 产出，且已随源码一起提交）
- [ ] 新增/修改的功能在浅色与夜间两套主题下都正常，键盘可操作
- [ ] 单页主题解析正确：`?theme=` → 上次选择 → 系统偏好 → 浅色；两个老 URL 能跳到首页并应用对应主题
- [ ] 关闭「联网联想」后无第三方请求、断网可用；开启时请求失败/超时不阻塞搜索
- [ ] 直接双击 `index.html`（`file://`）无报错
- [ ] `README.md` / `docs/custom-sites.md` / `docs/CHANGELOG.md` 等受影响的文档已同步
- [ ] PR 描述里写清楚改动内容、验证方式和截图（如涉及视觉变化）

## 有疑问？

开一个 [Issue](https://github.com/breathiness/SimpleSearch/issues) 说明你的想法或复现步骤，比直接大改更容易被接受。
