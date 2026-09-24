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
 * 是否最大化（铺满工作区）。
 *
 * 与 mode 是两件事：最大化时仍然可以收起成球、也可以展开——真实的主进程
 * 也是这么分的（WindowRuntime 里 mode 与 maximized 各一个字段），
 * 因此这里不把它并进 mode，否则会验出一个真实程序走不到的形状。
 */
const maximized = opts.maximized === true

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
  version: 10,
  window: {
    x: null,
    y: null,
    width: 960,
    height: 540,
    opacity: 1,
    alwaysOnTop: true,
    showInTaskbar: false
  },
  ui: {
    topBarOpen,
    railOpen: true,
    homeTheme: opts.theme,
    backgroundOpacity: opts.bgAlpha ?? 1,
    ballIcon: opts.ballIcon,
    ballCustomFit: opts.ballFit
  },
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

/**
 * 窗口运行状态。真值都在主进程，这里只是把 getState 该回的东西照样摆一份。
 *
 * railVisible 与 topBarOpen 的算法**必须与 windowController 里的同名规则一致**
 * （getRuntime / railVisible 那个模块级函数）：界面按它们决定画不画那两条栏，
 * 假桥要是自己另定一套，预览里就会出现真实程序走不到的形状，看了也白看。
 * 最大化那一态尤其要紧——右侧栏在这一态必须报 false，否则 Rail 会照画，
 * 而真机上它已经让位了。
 */
const state = {
  mode: mode === 'collapsed' ? 'collapsed' : 'expanded',
  opacity: 1,
  addressOpen: false,
  topBarOpen,
  railVisible: !maximized && (config.ui.railOpen || !topBarOpen),
  maximized
}

/**
 * 状态广播要真的发得出去。
 *
 * 「最大化之后点右上角那枚还原键，顶栏与右栏回来」是这一版最要紧的一条往返，
 * 而它全靠「界面发意图 → 主进程改状态 → 广播回来 → 界面重画」这条路。
 * 假桥若把 onState 当空操作吞掉（原先就是），这条路在预览里根本走不通：
 * 点了那枚键什么都不会变，也就验不出往返通没通。
 */
const stateListeners = new Set()

function emitState() {
  const snapshot = { ...state }
  for (const listener of stateListeners) listener(snapshot)
}

/** 最大化 / 还原只改这两个字段，其余照主进程的规则重算一遍 */
function setMaximized(next) {
  if (state.maximized === next) return
  state.maximized = next
  state.railVisible = !next && (config.ui.railOpen || !state.topBarOpen)
  emitState()
}

const ok = () => Promise.resolve()
const list = () => Promise.resolve([])

/**
 * 拖动信号的记账本。
 *
 * 「界面上哪一块能拖窗口」是这一版改动里最容易悄悄坏掉的一环：上一版整条顶栏
 * 都被 no-drag 的子元素盖满，于是只剩悬浮球拖得动，而从代码上看不出来。
 * 探针按一下、读这里的计数，就能问出「这个位置按下去到底起没起拖动」。
 *
 * 缩放（拖边缘改大小）是同一类问题、同一个记法，因此和拖动并排记在一起：
 * 边缘手柄压在顶栏与右栏的留白上，一旦它的盒子比预想的大，就会把按钮的点击
 * 悄悄变成缩放——那种错从截图上完全看不出来。
 *
 * dragLog / resizeLog 只存在于这份假桥里（真实的 preload 没有它们，界面也不需要），
 * 它们是给 spike/preview.js 的 --drag-probe 用的。
 */
let dragStarts = 0
let dragEnds = 0
let resizeStarts = 0
let resizeEnds = 0
/** 每次缩放开始时报上来的边名，按顺序记下来：拖的是不是那一条边，只能这么问 */
const resizeEdges = []

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

/**
 * 自定义悬浮球图标那条桥。
 *
 * 与真实实现一样，图**不进 config**：它有几 KB，跟着每次 config 广播走不合适，
 * 因此这里也单开一份。--ball-image <路径> 就是把一张本地图当作用户上传过的那张
 * （读文件与编码都在主进程那侧做，见 preview.js），于是「铺满球面 / 中央图案」
 * 两种落法、以及「选了自定义却没有图」那条退路，都能在无头预览里各出一张图。
 *
 * set 要真的记住并广播——设置页选图、清除之后球该跟着变，而这件事只有
 * 桥真的动了才算验过。
 */
let ballImage = opts.ballImage ?? null
const ballListeners = new Set()

contextBridge.exposeInMainWorld('moyu', {
  config: {
    get: () => Promise.resolve(config),
    patch: patchConfig,
    onChanged: (listener) => {
      configListeners.add(listener)
      return () => configListeners.delete(listener)
    }
  },
  ballIcon: {
    get: () => Promise.resolve(ballImage),
    set: (input) => {
      ballImage = input?.dataUrl ?? null
      // 存下来的那一份也报给主进程：裁剪弹窗导出的到底是个什么东西，
      // 只有把它捞出来存成文件看一眼才算验过（见 spike/ball-crop.js）
      ipcRenderer.send('preview:ballImage', ballImage)
      for (const listener of ballListeners) listener(ballImage)
      return Promise.resolve(ballImage)
    },
    onChanged: (listener) => {
      ballListeners.add(listener)
      return () => ballListeners.delete(listener)
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
    maximize: () => {
      setMaximized(true)
      return Promise.resolve()
    },
    restore: () => {
      setMaximized(false)
      return Promise.resolve()
    },
    dragStart: () => {
      dragStarts += 1
    },
    dragEnd: () => {
      dragEnds += 1
    },
    dragLog: () => ({ starts: dragStarts, ends: dragEnds }),
    resizeStart: (edge) => {
      resizeStarts += 1
      resizeEdges.push(edge)
    },
    resizeEnd: () => {
      resizeEnds += 1
    },
    resizeLog: () => ({ starts: resizeStarts, ends: resizeEnds, edges: resizeEdges }),
    setAddressOpen: () => {},
    setChrome: () => {},
    setBallRect: (rect) => ipcRenderer.send('preview:ballRect', rect),
    openBallMenu: ok,
    setSize: ok,
    minimize: ok,
    hideToTray: ok,
    reassert: ok,
    close: ok,
    getState: () => Promise.resolve({ ...state }),
    onState: (listener) => {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    }
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
