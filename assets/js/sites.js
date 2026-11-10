// 站点注册表：v2 的唯一数据源。页面按钮与分组 chip 都由 scripts/build.mjs 从这里生成。
// 经典脚本（无 import/export）：浏览器挂到 window，Node 里 import 后读 globalThis.SimpleSearch。
;(function (root) {
  'use strict'

  const SS = (root.SimpleSearch = root.SimpleSearch || {})

  // 顺序即按钮渲染顺序，两个主题完全一致（原项目 Dark 缺 Unsplash，v2 已修复）
  // 字段：id 唯一 id / group 分类 id / label 按钮文字 / home 空词直达 /
  //       search 站内搜索（必须含 {q}）/ keywords 联想关键词
  SS.sites = [
    {
      id: 'github',
      group: 'tech',
      label: 'GitHub',
      home: 'https://github.com',
      search: 'https://github.com/search?q={q}',
      keywords: ['gh', 'git', '代码', '开源'],
    },
    {
      id: 'unsplash',
      group: 'content',
      label: 'Unsplash',
      home: 'https://unsplash.com/',
      // 原 search?q= 已失效，v2 改用 /s/photos/ 路径
      search: 'https://unsplash.com/s/photos/{q}',
      keywords: ['图片', '壁纸', '摄影', 'photo', 'wallpaper'],
    },
    {
      id: 'bilibili',
      group: 'media',
      label: '哔哩哔哩',
      home: 'https://www.bilibili.com',
      search: 'https://search.bilibili.com/all?keyword={q}',
      keywords: ['b站', '哔哩', '视频', '弹幕', 'bilibili'],
    },
    {
      id: 'sspai',
      group: 'content',
      label: '少数派',
      home: 'https://sspai.com',
      search: 'https://sspai.com/search/post/{q}',
      keywords: ['少数派', '效率', '数码', 'sspai'],
    },
    {
      id: 'moegirl',
      group: 'media',
      label: '萌娘百科',
      home: 'https://zh.moegirl.org.cn',
      search: 'https://zh.moegirl.org.cn/index.php?search={q}',
      keywords: ['萌娘', '百科', '二次元', 'moe', 'acg'],
    },
    {
      id: 'zhihu',
      group: 'community',
      label: '知乎',
      home: 'https://www.zhihu.com',
      search: 'https://www.zhihu.com/search?type=content&q={q}',
      keywords: ['知乎', '问答', 'zhihu', 'qa'],
    },
    {
      id: 'tieba',
      group: 'community',
      label: '百度贴吧',
      home: 'https://tieba.baidu.com',
      search: 'https://tieba.baidu.com/f/search/res?qw={q}',
      keywords: ['贴吧', '百度', 'tieba', 'forum'],
    },
    {
      id: 'taobao',
      group: 'shopping',
      label: '淘宝',
      home: 'https://www.taobao.com',
      search: 'https://s.taobao.com/search?q={q}',
      keywords: ['淘宝', '购物', 'taobao', 'shop'],
    },
    {
      id: 'jd',
      group: 'shopping',
      label: '京东',
      home: 'https://www.jd.com',
      search: 'https://search.jd.com/Search?keyword={q}',
      keywords: ['京东', '购物', 'jd', 'jd.com'],
    },
    {
      id: 'steam',
      group: 'media',
      label: 'Steam',
      home: 'https://store.steampowered.com',
      search: 'https://store.steampowered.com/search/?term={q}',
      keywords: ['steam', '蒸汽', '游戏', 'game'],
    },
    {
      id: 'archwiki',
      group: 'tech',
      label: 'ArchWiki',
      home: 'https://wiki.archlinux.org',
      search: 'https://wiki.archlinux.org/index.php?search={q}',
      keywords: ['arch', 'linux', 'wiki', '文档'],
    },
  ]

  // 分组表：顺序即 chip 渲染顺序；site.group 必须存在于本表，且每个分组至少有一个站点
  SS.siteGroups = [
    { id: 'tech', label: '技术开发' },
    { id: 'community', label: '社区问答' },
    { id: 'media', label: '影音游戏' },
    { id: 'shopping', label: '购物' },
    { id: 'content', label: '素材资讯' },
  ]

  // 默认搜索引擎：SS.search.resolveDefault 使用；表单无 JS 时的回退也是 Bing
  SS.engines = {
    bing: {
      id: 'bing',
      label: 'Bing',
      search: 'https://www.bing.com/search?q={q}',
    },
  }

  SS.defaultEngine = 'bing'
})(typeof globalThis !== 'undefined' ? globalThis : this)
