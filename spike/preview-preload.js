/**
 * 预览与主进程之间的假桥。
 *
 * 它顶替真实的 preload：真实的 preload 要连主进程的 IPC 才活得下去，
 * 而这里只想把 chrome 界面单独渲染出来看一眼，主进程的窗口、标签页、
 * 站点库一概不参与。
 *
 * 顺带把渲染进程上报的悬浮球矩形转给主进程打印出来——那是「收起时
 * 窗口落到哪」的唯一依据，值得单独验一遍。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { contextBridge, ipcRenderer } = require('electron')

const mode = ipcRenderer.sendSync('preview:mode')
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
  version: 6,
  window: {
    x: null,
    y: null,
    width: 960,
    height: 540,
    lastNormalSize: { width: 960, height: 540 },
    miniMode: false,
    opacity: 1,
    alwaysOnTop: true,
    showInTaskbar: false
  },
  ui: { topBarOpen, railOpen: true },
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
  sites: { list, add: list, update: list, remove: list, reorder: list, presets: list },
  history: { list: list, clear: ok },
  bookmarks: { list, add: list, remove: list, update: list },
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
    toggleMini: ok,
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
