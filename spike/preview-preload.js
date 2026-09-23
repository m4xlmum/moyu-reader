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

/** 6 个标签页、标题都很长：正好试下拉按钮的截断与角标 */
const TABS = [
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
  isLoading: false,
  canGoBack: i > 0,
  canGoForward: false,
  isActive: i === 1,
  uaMode: 'desktop',
  zoom: 1,
  muted: false
}))

const config = {
  version: 7,
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

contextBridge.exposeInMainWorld('moyu', {
  config: { get: () => Promise.resolve(config), patch: () => Promise.resolve(config), onChanged: noop },
  sites: { list: () => Promise.resolve(SITES), add: list, update: list, remove: list, reorder: list, presets: list },
  history: { list: () => Promise.resolve(HISTORY), clear: ok },
  bookmarks: { list: () => Promise.resolve(BOOKMARKS), remove: list, update: list },
  tabs: {
    create: () => Promise.resolve({ tabId: 't9' }),
    home: () => Promise.resolve({ tabId: 't0' }),
    close: ok,
    activate: ok,
    reorder: ok,
    list: () => Promise.resolve({ tabs: TABS, activeTabId: 't1' }),
    onState: noop
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
