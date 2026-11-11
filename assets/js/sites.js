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

    // v2.7：分类扩站，22 个新站点追加在内置 11 站之后（数组顺序 = 「全部」视图按钮顺序）
    // icon 为可选字段：sprite 里对应 symbol 名（cat-<group> 复用分类图标）；
    // 没写 icon 的站点由 build 用 scripts/icons.mjs 里的专属图标（按 site.id 匹配），再兜底首字符。
    // ---- tech ----
    {
      id: 'stackoverflow',
      group: 'tech',
      label: 'StackOverflow',
      home: 'https://stackoverflow.com',
      search: 'https://stackoverflow.com/search?q={q}',
      keywords: ['so', 'stack', '问答'],
    },
    {
      id: 'mdn',
      group: 'tech',
      label: 'MDN',
      home: 'https://developer.mozilla.org',
      search: 'https://developer.mozilla.org/zh-CN/search?q={q}',
      keywords: ['mdn', '文档', 'web', '前端'],
      icon: 'cat-tech',
    },
    {
      id: 'gitee',
      group: 'tech',
      label: 'Gitee',
      home: 'https://gitee.com',
      search: 'https://search.gitee.com/?q={q}&type=repository',
      keywords: ['码云', 'gitee', '国内git'],
      icon: 'cat-tech',
    },
    {
      id: 'npm',
      group: 'tech',
      label: 'npm',
      home: 'https://www.npmjs.com',
      search: 'https://www.npmjs.com/search?q={q}',
      keywords: ['npm', '包', 'node'],
    },
    {
      id: 'juejin',
      group: 'tech',
      label: '掘金',
      home: 'https://juejin.cn',
      search: 'https://juejin.cn/search?query={q}',
      keywords: ['掘金', 'juejin', '前端'],
      icon: 'cat-tech',
    },
    // ---- community ----
    {
      id: 'douban',
      group: 'community',
      label: '豆瓣',
      home: 'https://www.douban.com',
      search: 'https://www.douban.com/search?q={q}',
      keywords: ['豆瓣', '电影', '书评'],
    },
    {
      id: 'weibo',
      group: 'community',
      label: '微博',
      home: 'https://weibo.com',
      search: 'https://s.weibo.com/weibo?q={q}',
      keywords: ['微博', '热搜', 'weibo'],
    },
    {
      id: 'v2ex',
      group: 'community',
      label: 'V2EX',
      home: 'https://www.v2ex.com',
      search: 'https://www.v2ex.com/search?q={q}',
      keywords: ['v2ex', '社区', '程序员'],
      icon: 'cat-community',
    },
    {
      id: 'reddit',
      group: 'community',
      label: 'Reddit',
      home: 'https://www.reddit.com',
      search: 'https://www.reddit.com/search/?q={q}',
      keywords: ['reddit', 'forum'],
    },
    // ---- media ----
    {
      id: 'youtube',
      group: 'media',
      label: 'YouTube',
      home: 'https://www.youtube.com',
      search: 'https://www.youtube.com/results?search_query={q}',
      keywords: ['油管', 'youtube', '视频'],
    },
    {
      id: 'douyin',
      group: 'media',
      label: '抖音',
      home: 'https://www.douyin.com',
      search: 'https://www.douyin.com/search/{q}',
      keywords: ['抖音', '短视频', 'tiktok'],
      icon: 'cat-media',
    },
    {
      id: 'iqiyi',
      group: 'media',
      label: '爱奇艺',
      home: 'https://www.iqiyi.com',
      search: 'https://so.iqiyi.com/so/q_{q}',
      keywords: ['爱奇艺', '剧集', 'iqiyi'],
      icon: 'cat-media',
    },
    {
      id: 'vqq',
      group: 'media',
      label: '腾讯视频',
      home: 'https://v.qq.com',
      search: 'https://v.qq.com/x/search/?q={q}',
      keywords: ['腾讯视频', '剧', 'vqq'],
      icon: 'cat-media',
    },
    {
      id: 'twitch',
      group: 'media',
      label: 'Twitch',
      home: 'https://www.twitch.tv',
      search: 'https://www.twitch.tv/search?term={q}',
      keywords: ['twitch', '直播', '游戏'],
    },
    // ---- shopping ----
    {
      id: 'tmall',
      group: 'shopping',
      label: '天猫',
      home: 'https://www.tmall.com',
      search: 'https://list.tmall.com/search_product.htm?q={q}',
      keywords: ['天猫', 'tmall', '购物'],
    },
    {
      id: 'pinduoduo',
      group: 'shopping',
      label: '拼多多',
      home: 'https://www.pinduoduo.com',
      search: 'https://mobile.yangkeduo.com/search_result.html?search_key={q}',
      keywords: ['拼多多', 'pdd', '百亿补贴'],
      icon: 'cat-shopping',
    },
    {
      id: 'goofish',
      group: 'shopping',
      label: '闲鱼',
      home: 'https://www.goofish.com',
      search: 'https://www.goofish.com/search?q={q}',
      keywords: ['闲鱼', '二手', 'goofish'],
      icon: 'cat-shopping',
    },
    {
      id: 'amazon',
      group: 'shopping',
      label: '亚马逊',
      home: 'https://www.amazon.com',
      search: 'https://www.amazon.com/s?k={q}',
      keywords: ['亚马逊', 'amazon', '海淘'],
    },
    // ---- content ----
    {
      id: 'pexels',
      group: 'content',
      label: 'Pexels',
      home: 'https://www.pexels.com',
      search: 'https://www.pexels.com/search/{q}/',
      keywords: ['pexels', '图片', '素材'],
    },
    {
      id: 'pixabay',
      group: 'content',
      label: 'Pixabay',
      home: 'https://pixabay.com',
      search: 'https://pixabay.com/images/search/{q}/',
      keywords: ['pixabay', '图库', '素材'],
    },
    {
      id: '36kr',
      group: 'content',
      label: '36氪',
      home: 'https://36kr.com',
      search: 'https://36kr.com/search/articles/{q}',
      keywords: ['36氪', '科技', '融资'],
      icon: 'cat-content',
    },
    {
      id: 'zcool',
      group: 'content',
      label: '站酷',
      home: 'https://www.zcool.com.cn',
      search: 'https://www.zcool.com.cn/search/content?word={q}',
      keywords: ['站酷', '设计', 'zcool'],
      icon: 'cat-content',
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

  // 搜索引擎表（v3.0 起 4 个）：param 是该引擎查询参数名，app.js 切换引擎时同步
  // 表单 action 与 #search-input 的 name；SS.search.resolveDefault 使用 search 模板。
  SS.engines = {
    bing: {
      id: 'bing',
      label: 'Bing',
      search: 'https://www.bing.com/search?q={q}',
      param: 'q',
    },
    google: {
      id: 'google',
      label: 'Google',
      search: 'https://www.google.com/search?q={q}',
      param: 'q',
    },
    ddg: {
      id: 'ddg',
      label: 'DuckDuckGo',
      search: 'https://duckduckgo.com/?q={q}',
      param: 'q',
    },
    baidu: {
      id: 'baidu',
      label: '百度',
      search: 'https://www.baidu.com/s?wd={q}',
      param: 'wd',
    },
  }

  SS.defaultEngine = 'bing'
})(typeof globalThis !== 'undefined' ? globalThis : this)
