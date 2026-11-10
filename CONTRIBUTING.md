# 贡献指南

感谢你愿意改进 SimpleSearch。这个项目的目标是**足够简单**：纯静态、零运行时依赖、打开就能用。改动请尽量顺着这个方向走，别为了一个功能引入框架、构建链或第三方请求。

## 开发环境

- **Node.js 18+**（CI 用 Node 22；构建与测试脚本使用了 `node:test` 和动态 `import()`）。
- 任意现代浏览器；验证 `file://` 直接双击打开的能力时，用浏览器直接打开 `SimpleSearch-Light.html` 即可。
- 编辑器建议开启 EditorConfig 式的「2 空格缩进、行尾 LF、文件末尾保留换行」。
- **不需要 `npm install`**：`package.json` 里没有 `dependencies` / `devDependencies`，克隆下来就能跑。

```bash
git clone https://github.com/breathiness/SimpleSearch.git
cd SimpleSearch
node -v   # 应为 v18 或更高（CI 用 22）
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 由 `templates/page.html` + `assets/js/sites.js` 生成两个入口页（**改完站点或模板后必须跑**） |
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
│  └─ js/             # 经典脚本（sites / search / suggest / history / theme / input / app）
├─ docs/              # 契约、自定义站点指南、更新日志
├─ scripts/           # build.mjs / serve.mjs / validate.mjs / e2e.mjs
├─ templates/         # page.html（两个入口页的模板）
├─ tests/             # node:test 单元测试
├─ .github/workflows/ # ci.yml（GitHub Actions）
├─ index.html         # 两个主题的选择页（手写，不进构建）
├─ SimpleSearch-Light.html / SimpleSearch-Dark.html  # 生成产物，勿手改
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

- 生成产物（`SimpleSearch-Light.html`、`SimpleSearch-Dark.html`）与源码**在同一个提交里**更新，不要分两次提交，否则 CI 的漂移检查会红。
- 不要提交 `node_modules/`、编辑器/系统临时文件（`.gitignore` 已覆盖）。
- 不要直接改两个生成页的 HTML，所有按钮都来自 `assets/js/sites.js`；页面结构改动改 `templates/page.html`。

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
- 模块文件顶层不要直接操作 DOM；纯逻辑（URL 构建、联想、历史）不读 DOM、不读真实 `localStorage`，由调用方注入，方便单测。
- **视觉风格参考 MDUI 1 / Material Design 1**（主色、2px 圆角、elevation 阴影、涟漪、下划线输入框、raised button），但**全部是自研手写 CSS**：不引入 MDUI 库、不引入任何 CDN 或第三方资源。改样式时沿用 `tokens.css` 里的变量，别硬编码颜色。
- 不引入 `!important`；保留可见的 `:focus-visible` 焦点轮廓；动画要尊重 `prefers-reduced-motion: reduce`。
- **不新增第三方依赖、CDN、字体或追踪脚本**；所有核心功能必须断网可用。
- 读写 `localStorage`、`window.open` 等可能失败的调用要放在 `try/catch` 或做能力判断里（隐私模式不能报错）。
- DOM 契约（`#search-input`、`#suggest-list`、`#theme-toggle`、`#buttons-container .button[data-site]` 等 id/class）由 `docs/contract.md` 规定，改动前先确认没有别的模块依赖。

## 新增或删除网站

只改 `assets/js/sites.js` 的 `SS.sites` 一处，然后 `npm run build` 重新生成两个入口页。字段含义、`{q}` 占位规则与完整示例见 [docs/custom-sites.md](docs/custom-sites.md)。

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
- 改完记得把两个生成的 HTML 一起提交。

## 测试与 CI

- 单元测试用 Node 内置的 `node:test`，放在 `tests/`，文件名以 `.test.mjs` 结尾，`npm test` 用 `node --test "tests/**/*.test.mjs"` 的 glob 自动发现，不用额外登记。
- `tests/sites.test.mjs` 要求默认内置的 11 个站点都存在、且相对顺序一致；**新增站点不会让测试变红**，删除内置站点才会失败并提示恢复。
- 提交/开 PR 前必须本地跑通 `npm run check`（构建 + 测试 + 静态校验/产物一致性）。
- GitHub Actions（`.github/workflows/ci.yml`）在 `push` 和 `pull_request` 时用 Node 22 跑 `npm run check`，并检查生成产物是否与 `sites.js` / 模板漂移。
- 本项目零依赖，CI 里**不需要 `npm ci` / `npm install`**。
- 只改文档或样式时也请跑一次 `npm run check`，确认没有把生成页改漂。

## PR 检查清单

- [ ] `npm run check` 本地全绿
- [ ] 改动范围内没有手工编辑两个生成 HTML（它们由 `npm run build` 产出，且已随源码一起提交）
- [ ] 新增/修改的功能在浅色与夜间两套主题下都正常，键盘可操作
- [ ] 断网（或屏蔽第三方请求）时核心功能仍可用
- [ ] 直接双击 `SimpleSearch-Light.html`（`file://`）无报错
- [ ] `README.md` / `docs/custom-sites.md` / `docs/CHANGELOG.md` 等受影响的文档已同步
- [ ] PR 描述里写清楚改动内容、验证方式和截图（如涉及视觉变化）

## 有疑问？

开一个 [Issue](https://github.com/breathiness/SimpleSearch/issues) 说明你的想法或复现步骤，比直接大改更容易被接受。
