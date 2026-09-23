/**
 * 预览与主进程之间的假桥。
 *
 * 它顶替真实的 preload：真实的 preload 要连主进程的 IPC 才活得下去，
 * 而这里只想把一个界面单独渲染出来看一眼，主进程的窗口、标签页、
 * 站点库一概不参与。
 *
 * 假数据要跟着 src/shared/types.ts 走：这份桥要是落后于真实接口，
 * 预览就会在一个已经不存在的数据形状上渲染，看了也白看。
 *
 * 顺带把渲染进程上报的悬浮球矩形转给主进程打印出来——那是「收起时
 * 窗口落到哪」的唯一依据，值得单独验一遍。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { contextBridge, ipcRenderer } = require('electron')

const opts = ipcRenderer.sendSync('preview:options')
const mode = opts.mode
const topBarOpen = mode !== 'no-topbar'

/**
 * 一枚内联图标，充作 favicon。
 *
 * 不用真实站点的图标地址：无头窗口不联网，取不到就是一条加载失败的破图，
 * 而这里要看的是「有图标时画图标」这条路本身。
 */
const FAVICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<rect width="16" height="16" rx="4" fill="#1e80ff"/>' +
      '<path d="M4 12V6l2.5 3L9 6v6" stroke="#fff" stroke-width="1.4" fill="none"/>' +
      '<path d="M11 6v6" stroke="#fff" stroke-width="1.4"/>' +
      '</svg>'
  )

/**
 * 标签页。默认 6 个、标题都很长，正好试标签条的让位与下拉按钮的截断。
 *
 * 给其中一个配一枚 favicon：标签条上确实是「有图标画图标、没有画个点」，
 * 两条路都得看得见。其余留空——「还没有图标」本身也是线上最常见的状态。
 *
 * --tabs N 只取前 N 个：标签条放得下与否由宽度算出来，得能拿少几张标签
 * 试出「放得下」那一态，否则永远只看得到它让位。
 */
const ALL_TABS = [
  ['起始页', 'moyu://home'],
  ['Claude Code 官方文档 · 快速开始与环境配置', 'https://docs.claude.com/en/docs/claude-code'],
  ['掘金 - 代码不止，掘金不停', 'https://juejin.cn/'],
  ['知乎 - 有问题，就会有答案', 'https://www.zhihu.com/'],
  ['哔哩哔哩 (゜-゜)つロ 干杯~-bilibili', 'https://www.bilibili.com/'],
  ['GitHub - m4xlmum/moyu-reader', 'https://github.com/m4xlmum/moyu-reader']
].map(([title, url], i) => ({
  id: `t${i}`,
  url,
  title,
  faviconUrl: i === 2 ? FAVICON : undefined,
  isLoading: false,
  canGoBack: i > 0,
  canGoForward: false,
  isActive: i === 1,
  uaMode: 'desktop',
  zoom: 1,
  muted: false
}))

const TABS = opts.tabs > 0 ? ALL_TABS.slice(0, opts.tabs) : ALL_TABS

/** 当前选中的那一格。点标签、关标签都要真的改掉它，见下面的 tabs 桥 */
let activeTabId = 't1'
const tabListeners = new Set()

const config = {
  version: 8,
  window: {
    x: null,
    y: null,
    width: 960,
    height: 540,
    opacity: 1,
    alwaysOnTop: true,
    showInTaskbar: false
  },
  ui: { topBarOpen, railOpen: true, homeTheme: opts.theme },
  stealth: {
    autoCollapse: false,
    hideDelayMs: 700,
    muteMediaOnCollapse: true,
    contentProtection: false
  },
  hotkeys: { bossMinimize: 'Alt+Z', bossHideToTray: 'Alt+X' },
  browser: {
    defaultUaMode: 'desktop',
    defaultZoom: 1,
    hideScrollbars: true,
    searchTemplate: 'https://www.bing.com/search?q=%s',
    newWindowAsTab: true
  },
  lastSession: { openUrls: [], activeIndex: 0 }
}

/** 起始页的磁贴来自「自己固定的 → 常访问的 → 预置的」，三样都给一点 */
const SITES = [
  {
    id: 's1',
    title: '微信读书',
    url: 'https://weread.qq.com/',
    order: 0,
    pinned: true,
    uaMode: null,
    zoom: null,
    createdAt: 0,
    updatedAt: 0
  },
  {
    id: 's2',
    title: '起点中文网',
    url: 'https://www.qidian.com/',
    order: 1,
    pinned: true,
    uaMode: null,
    zoom: null,
    createdAt: 0,
    updatedAt: 0
  }
]

const HISTORY = [
  ['如何在 Electron 里做无边框透明窗口', 'https://www.zhihu.com/question/123456789', 9],
  ['CSS 扫描线与文字发光效果', 'https://juejin.cn/post/7123456789', 6],
  ['摸鱼阅读 · 项目主页', 'https://github.com/m4xlmum/moyu-reader', 4],
  ['Claude Code 官方文档', 'https://docs.claude.com/en/docs/claude-code', 3]
].map(([title, url, visitCount], i) => ({
  id: `h${i}`,
  url,
  title,
  // 最近读的那一条带图标：起始页第一行是「继续上次」，它也该画那个站的图标
  faviconUrl: i === 0 ? FAVICON : undefined,
  visitedAt: Date.now() - i * 60000,
  visitCount
}))

const BOOKMARKS = [
  {
    id: 'b1',
    title: '少数派',
    url: 'https://sspai.com/',
    order: 0,
    createdAt: 0
  }
]

const state = {
  mode: mode === 'collapsed' ? 'collapsed' : 'expanded',
  opacity: 1,
  addressOpen: false,
  topBarOpen,
  // 顶栏藏起来时右栏必须保留——悬浮球停在那里
  railVisible: true
}

const noop = () => () => {}
const ok = () => Promise.resolve()
const list = () => Promise.resolve([])

/** 标签页的对外快照。isActive 跟着当前那一格算，不另存一份，免得两处说法对不上 */
function tabsState() {
  return {
    tabs: TABS.map((t) => ({ ...t, isActive: t.id === activeTabId })),
    activeTabId
  }
}

function emitTabs() {
  const payload = tabsState()
  for (const listener of tabListeners) listener(payload)
}


/**
 * 配置桥要真的会改、真的会广播。
 *
 * 换主题这一步走的是「界面 → patch → 广播 → 重新渲染」这条路，
 * 假桥要是只把 patch 当空操作吞掉，就永远只能看到启动时那一套主题，
 * 「主题决定形态」这件事根本没被验证到。因此这里存下来并通知订阅者。
 */
const configListeners = new Set()

function patchConfig(input) {
  Object.assign(config, input)
  if (input.ui) config.ui = { ...config.ui, ...input.ui }
  for (const listener of configListeners) listener(config)
  return Promise.resolve(config)
}

contextBridge.exposeInMainWorld('moyu', {
  config: {
    get: () => Promise.resolve(config),
    patch: patchConfig,
    onChanged: (listener) => {
      configListeners.add(listener)
      return () => configListeners.delete(listener)
    }
  },
  sites: { list: () => Promise.resolve(SITES), add: list, update: list, remove: list, reorder: list, presets: list },
  history: { list: () => Promise.resolve(HISTORY), clear: ok },
  bookmarks: { list: () => Promise.resolve(BOOKMARKS), remove: list, update: list },
  tabs: {
    create: () => Promise.resolve({ tabId: 't9' }),
    home: () => Promise.resolve({ tabId: 't0' }),
    /*
     * 切换与关闭要真的改掉这张表并广播出去。
     *
     * 标签条是「点了就该有反应」的东西，假桥要是把这两步当空操作吞掉，
     * 预览里点一下什么动静都没有，也就验不出点中的是不是那一格。
     */
    close: (input) => {
      const at = TABS.findIndex((t) => t.id === input.tabId)
      if (at >= 0) TABS.splice(at, 1)
      if (activeTabId === input.tabId) activeTabId = TABS[0]?.id ?? null
      emitTabs()
      return Promise.resolve()
    },
    activate: (input) => {
      activeTabId = input.tabId
      emitTabs()
      return Promise.resolve()
    },
    reorder: ok,
    list: () => Promise.resolve(tabsState()),
    onState: (listener) => {
      tabListeners.add(listener)
      return () => tabListeners.delete(listener)
    }
  },
  nav: { goto: ok, back: ok, forward: ok, reload: ok, stop: ok },
  page: { setZoom: () => Promise.resolve(1), setUa: () => Promise.resolve('desktop') },
  win: {
    setOpacity: ok,
    collapse: ok,
    expand: ok,
    dragStart: () => {},
    dragEnd: () => {},
    setAddressOpen: () => {},
    setChrome: () => {},
    setBallRect: (rect) => ipcRenderer.send('preview:ballRect', rect),
    openBallMenu: ok,
    setSize: ok,
    minimize: ok,
    hideToTray: ok,
    reassert: ok,
    close: ok,
    getState: () => Promise.resolve(state),
    onState: noop
  },
  ui: { openPopover: ok, closePopover: ok, openSettings: ok },
  hotkey: {
    list: () =>
      Promise.resolve({
        bossMinimize: { accelerator: 'Alt+Z', registered: true },
        bossHideToTray: { accelerator: 'Alt+X', registered: true }
      }),
    set: () => Promise.resolve({ ok: true, accelerator: 'Alt+Z' })
  },
  app: { quit: ok }
})
