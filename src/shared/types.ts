/**
 * 主进程、预加载与渲染进程共享的类型定义。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { BallCustomFit, BallIconChoice, HomeTheme } from './constants'

export type { BallCustomFit, BallIcon, BallIconChoice, HomeTheme, SizePreset } from './constants'

// ---------------------------------------------------------------- 配置

export interface WindowConfig {
  x: number | null
  y: number | null
  width: number
  height: number
  /** 无极透明度，0.05 ~ 1 */
  opacity: number
  alwaysOnTop: boolean
  /**
   * 显示在任务栏。默认 false。
   * 注意：skipTaskbar 同时把窗口移出 Alt+Tab，因此开启此项会显著降低隐蔽性。
   */
  showInTaskbar: boolean
}

export interface StealthConfig {
  /** 光标移出后自动收起成悬浮球 */
  autoCollapse: boolean
  /** 收起前的延迟，毫秒。收起慢、展开靠点击，避免误触 */
  hideDelayMs: number
  /**
   * 隐藏时暂停网页音视频：收起成球、藏进托盘、最小化这三种「没露出来」的状态，
   * 都算隐藏。
   *
   * 暂停的是**正在播的**那一些，并且只恢复由我们按下去的那些——用户自己按了
   * 暂停的视频，回到展开态时不该被我们放起来。字段名沿用下来（原先只做静音），
   * 现在一并把媒体真正暂停，静音仍然保留（见 tabManager 里的两个脚本）。
   */
  muteMediaOnCollapse: boolean
  /** 从屏幕捕获中排除窗口（SetWindowDisplayAffinity） */
  contentProtection: boolean
}

/**
 * 界面分区显隐。
 *
 * 悬浮球是顶栏里的一员，顶栏藏起来之后它改停在右上角，
 * 因此这两项都会牵动原生正文视图的版面，状态由主进程持有并落盘。
 */
export interface UiConfig {
  /** 显示顶部功能栏 */
  topBarOpen: boolean
  /** 显示右侧功能栏。顶栏隐藏时这一栏会被强制保留，见 WindowRuntime.railVisible */
  railOpen: boolean
  /** 起始页主题。只在起始页生效，不影响阅读网页时的观感 */
  homeTheme: HomeTheme
  /**
   * 界面底板透明度 0–1。
   *
   * 与 window.opacity（整扇窗连带网页一起变淡）不同，这只影响界面自己画的底板：
   * 顶栏、地址栏、右侧栏与弹出面板。字与图标始终不透明，因此拉到 0
   * 也只是「底板没了，按钮浮在桌面上」，不会把自己锁在外面。
   * 网页与自家页面不受影响。
   */
  backgroundOpacity: number
  /**
   * 悬浮球画哪个图标。
   *
   * 内置的几个画在代码里（`chrome/BallGlyph.vue`），`'custom'` 指的是
   * 用户上传的那一张——它不在配置里，存在 userData/ball-icon.json，
   * 由 ballIcon 那组 IPC 单独读写。分开的理由是体积：配置一变就全量广播，
   * 而这张图有几 KB，透明度滑块每动一格都会把它推一遍。
   */
  ballIcon: BallIconChoice
  /** 自定义图标落进球里的方式。只在 ballIcon 为 'custom' 时有意义 */
  ballCustomFit: BallCustomFit
}

export interface HotkeyConfig {
  /** 老板键 1：最小化 / 恢复 */
  bossMinimize: string
  /** 老板键 2：藏进托盘 */
  bossHideToTray: string
}

export interface BrowserConfig {
  defaultUaMode: 'desktop' | 'mobile'
  defaultZoom: number
  /** 默认隐藏滚动条，避免长滚动条暴露阅读行为 */
  hideScrollbars: boolean
  searchTemplate: string
  /** target=_blank 转为新标签页，而非弹出新窗口 */
  newWindowAsTab: boolean
}

export interface AppConfig {
  version: number
  window: WindowConfig
  ui: UiConfig
  stealth: StealthConfig
  hotkeys: HotkeyConfig
  browser: BrowserConfig
  lastSession: { openUrls: string[]; activeIndex: number }
}

// ---------------------------------------------------------------- 数据

export interface SiteRecord {
  id: string
  title: string
  url: string
  iconUrl?: string
  order: number
  pinned: boolean
  /** null 表示跟随全局默认 */
  uaMode: 'desktop' | 'mobile' | null
  zoom: number | null
  createdAt: number
  updatedAt: number
}

export interface PresetSite {
  id: string
  title: string
  url: string
  category: string
}

export interface Bookmark {
  id: string
  title: string
  url: string
  faviconUrl?: string
  order: number
  createdAt: number
}

export interface HistoryEntry {
  id: string
  url: string
  title: string
  faviconUrl?: string
  visitedAt: number
  visitCount: number
}

// ---------------------------------------------------------------- 运行时（不持久化）

/**
 * 窗口状态。
 *
 * 只有两个主状态：展开与收起成球。
 * 收起时窗口本身缩小到一颗球——屏幕上没有「看不见却仍占着」的区域，
 * 因此不需要再靠裁剪命中区域来实现点击穿透。
 */
export type WindowMode =
  /** 完整界面：顶栏 + 地址栏 + 正文 + 右侧功能栏 */
  | 'expanded'
  /** 缩成悬浮球 */
  | 'collapsed'
  /** 藏进托盘 */
  | 'trayHidden'
  /** 最小化 */
  | 'minimized'
  /** 正在退出 */
  | 'quitting'

export interface TabState {
  id: string
  url: string
  title: string
  faviconUrl?: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isActive: boolean
  uaMode: 'desktop' | 'mobile'
  zoom: number
  muted: boolean
}

export interface WindowRuntime {
  mode: WindowMode
  opacity: number
  /**
   * 地址栏是否展开。
   *
   * 状态由主进程持有，而不是渲染进程自己记：地址栏一展开正文就要往下让一行，
   * 而正文是原生视图。若让渲染进程先改再通知主进程，两者在时序上必然错开，
   * 网页就会有一瞬间压在地址栏上。
   */
  addressOpen: boolean
  /** 顶栏是否显示（用户的选择） */
  topBarOpen: boolean
  /**
   * 右侧栏**实际**是否占位并绘制。
   *
   * 与 ui.railOpen 不一定相同：顶栏藏起来之后悬浮球就停在右栏顶端，
   * 那一栏是它唯一的落脚处，因此这时无论如何都要保留。
   * 版面与界面都按这个值走，省得两处各自推导。
   */
  railVisible: boolean
  /**
   * 是否已最大化（铺满当前显示器的整个工作区，不保 16:9）。
   *
   * 它是一个**临时的窗口状态**，不进配置：配置里存的是还原回去的那块 16:9
   * 矩形（见 windowController 的 restoreBounds）。因此「最大化着退出程序」
   * 下次启动仍是一个 16:9 的窗口。
   *
   * 界面按它做三件事：两栏与地址栏一起让位、不画那圈缩放手柄、
   * 只在右上角浮出「还原键 + 悬浮球」那一小块（退出最大化就靠那一枚）。
   * 三处都读同一个值，不各自从窗口尺寸反推——反推出来的「宽度等于屏幕宽度」
   * 在 16:9 显示器上恰好也是最大化的样子，分不清。
   *
   * 注意「顶栏那枚最大化键」不在其中：最大化之后整条顶栏都不画了，
   * 它跟着消失，图标不存在切换一说。还原键是另一枚，画在右上角那一小块里。
   */
  maximized: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 被拖动的边或角：`n` 上边、`s` 下边、`e` 右边、`w` 左边、`ne` 右上角……
 *
 * 放在 shared 里而不是算它的 geometry.ts 里：界面在按下手柄时要把「拖的是哪条边」
 * 发给主进程（算缩放需要屏幕坐标，只有主进程读得到），因此它是跨进程的词汇。
 * 真正算矩形的那一步仍然只有 geometry.ts 一处（见 resizeRect）。
 */
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface HotkeyInfo {
  accelerator: string
  registered: boolean
}

export const IPC_ERROR = {
  /** globalShortcut.register 返回 false 时抛出，调用方需提示用户更换组合键 */
  HOTKEY_TAKEN: 'HOTKEY_TAKEN'
} as const
