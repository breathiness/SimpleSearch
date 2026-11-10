// 站点图标（dev-time 资产，不进运行时、不被页面加载）。
//
// 用法：scripts/build.mjs import 本文件，把用到的图标渲染成页面内联的
// <svg class="icon-sprite"><symbol id="i-<siteId>">…</symbol></svg>。
// 这样图标**不产生任何网络请求**，也不依赖外部 favicon 服务。
//
// 约定：
// - viewBox 统一 24×24；symbol 上由 build 统一加 fill="none" stroke="currentColor"
//   stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"，所以这里
//   只写几何形状；需要实心的小圆点单独加 fill="currentColor" stroke="none"。
// - 图形是**通用几何符号**（括号、相机、电视、闪电、书、气泡、包、包裹、手柄、终端），
//   不是任何公司商标的复制品。
// - 想给某个站点加图标：在这里加一条 `<siteId>: { body: '<path …/>' }`，再 npm run build。
//   没配图标的站点会自动退化成首字符 monogram（零额外成本）。
export const SITE_ICONS = {
  // 开发：代码括号
  github: {
    body: '<path d="M8.5 6.5 3.8 12l4.7 5.5"/><path d="M15.5 6.5l4.7 5.5-4.7 5.5"/><path d="M6 20h12"/>',
  },
  // 素材：相机
  unsplash: {
    body: '<path d="M4 8.5h3.4L9 6.5h6l1.6 2H20v10H4z"/><circle cx="12" cy="13.5" r="3"/>',
  },
  // 影音：电视 + 播放
  bilibili: {
    body: '<rect x="3.5" y="7.5" width="17" height="11" rx="2.5"/><path d="M8.5 4.5 11 7.5M15.5 4.5 13 7.5"/><path d="M10.5 11v4l3.5-2z"/>',
  },
  // 资讯：闪电
  sspai: {
    body: '<path d="M13.6 3.5 6.4 14.1h4.6l-1 6.4 7.6-10.9h-4.6z"/>',
  },
  // 社区：翻开的书
  moegirl: {
    body: '<path d="M12 7c-1.8-1.5-4.2-1.9-7.5-1.6V18c3.3-.3 5.7.1 7.5 1.6 1.8-1.5 4.2-1.9 7.5-1.6V5.4C16.2 5.1 13.8 5.5 12 7z"/><path d="M12 7v12.6"/>',
  },
  // 社区：对话气泡
  zhihu: {
    body: '<path d="M4 5.5h16v10.5H10L5.5 19v-3H4z"/><circle cx="9" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10.8" r="1" fill="currentColor" stroke="none"/>',
  },
  // 社区：双层气泡
  tieba: {
    body: '<path d="M3.5 5.5h11v7.5H9.2L6.4 15.6V13H3.5z"/><path d="M8.7 9.8h11.8v7.4h-2.3v2.6l-2.9-2.6H8.7z"/>',
  },
  // 购物：手提袋
  taobao: {
    body: '<path d="M5.6 8h12.8l-1.2 11.5H6.8z"/><path d="M9 8V6.4a3 3 0 0 1 6 0V8"/>',
  },
  // 购物：包裹
  jd: {
    body: '<path d="M12 4 20 8v8l-8 4-8-4V8z"/><path d="M4 8l8 4.2L20 8"/><path d="M12 12.2V20"/>',
  },
  // 影音：游戏手柄
  steam: {
    body: '<rect x="3.5" y="9" width="17" height="8.6" rx="4.3"/><path d="M8.4 11.8v3.2M6.8 13.4h3.2"/><circle cx="15.6" cy="13.4" r="1" fill="currentColor" stroke="none"/>',
  },
  // 技术：终端
  archwiki: {
    body: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7 9.5l3 2.8-3 2.8"/><path d="M12.5 16h4"/>',
  },
}

// UI 图标（顶栏/设置面板用；同样内联进 sprite，零请求）
export const UI_ICONS = {
  menu: { body: '<path d="M4 7h16M4 12h16M4 17h16"/>' },
  settings: {
    body: '<path d="M4 7h9M19 7h1M4 12h3M13 12h7M4 17h7M17 17h3"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="17" r="2"/>',
  },
  close: { body: '<path d="M6 6l12 12M18 6 6 18"/>' },
}

// v2.4：顶栏 logo + 分类导航小图标（同样内联进 sprite，零请求）
Object.assign(UI_ICONS, {
  logo: {
    body: '<circle cx="12" cy="12" r="9"/><circle cx="10.6" cy="10.6" r="3.6"/><path d="M13.4 13.4 16.6 16.6"/>',
  },
  'cat-all': {
    body: '<rect x="4" y="4" width="6.4" height="6.4" rx="1"/><rect x="13.6" y="4" width="6.4" height="6.4" rx="1"/><rect x="4" y="13.6" width="6.4" height="6.4" rx="1"/><rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1"/>',
  },
  'cat-tech': {
    body: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7 9.5l3 2.8-3 2.8"/><path d="M12.5 16h4"/>',
  },
  'cat-community': {
    body: '<path d="M3.5 5.5h11v7.5H9.2L6.4 15.6V13H3.5z"/><path d="M8.7 9.8h11.8v7.4h-2.3v2.6l-2.9-2.6H8.7z"/>',
  },
  'cat-media': {
    body: '<rect x="3.5" y="7.5" width="17" height="11" rx="2.5"/><path d="M8.5 4.5 11 7.5M15.5 4.5 13 7.5"/><path d="M10.5 11v4l3.5-2z"/>',
  },
  'cat-shopping': {
    body: '<path d="M5.6 8h12.8l-1.2 11.5H6.8z"/><path d="M9 8V6.4a3 3 0 0 1 6 0V8"/>',
  },
  'cat-content': {
    body: '<path d="M4 8.5h3.4L9 6.5h6l1.6 2H20v10H4z"/><circle cx="12" cy="13.5" r="3"/>',
  },
})
