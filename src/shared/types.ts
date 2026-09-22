/**
 * 主进程、预加载与渲染进程共享的类型定义。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { SizePreset } from './constants'

export type { SizePreset }

// ---------------------------------------------------------------- 配置

export interface WindowConfig {
  x: number | null
  y: number | null
  width: number
  height: number
  /** 最后一次非迷你模式的尺寸，退出迷你模式时恢复 */
  lastNormalSize: { width: number; height: number }
  miniMode: boolean
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
  /** 光标移出后自动隐藏顶部菜单栏 */
  autoHideTop: boolean
  /** 光标移出后自动隐藏主体（网页区域） */
  autoHideBody: boolean
  /** 光标移出后自动隐藏底部工具栏 */
  autoHideBottom: boolean
  /** 隐藏前的延迟，毫秒。隐藏慢、显形快，避免误触 */
  hideDelayMs: number
  /** 隐藏主体后仍可交互、用于显形与拖动的条带高度 */
  revealStripHeight: number
  /** 隐藏主体时暂停网页音视频 */
  muteMediaOnHide: boolean
  /** 从屏幕捕获中排除窗口（SetWindowDisplayAffinity） */
  contentProtection: boolean
  /**
   * 命中区域策略。
   * 'shape'  —— win.setShape()，无轮询竞态，为首选
   * 'ignoreMouse' —— setIgnoreMouseEvents() 轮询切换，降级用
   * 'auto' —— 启动时探测
   */
  hitTestStrategy: 'auto' | 'shape' | 'ignoreMouse'
  /** 'windowOpacity' 为首选（见 docs/spike-findings.md），'css' 为备选 */
  fadeStrategy: 'windowOpacity' | 'css'
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
 * 窗口状态。所有窗口级 surface 属性只在 windowSurface.applySurface 中依此表变更。
 */
export type WindowMode =
  /** 主体可见，正常交互 */
  | 'normal'
  /** 主体隐藏（点击穿透），栏位与显形条带仍可见 */
  | 'bodyHidden'
  /** 藏进托盘 */
  | 'trayHidden'
  /** 最小化 */
  | 'minimized'
  /** 正在退出 */
  | 'quitting'

export type ZoneVisibility = 'shown' | 'hidden'

export interface ZoneState {
  top: ZoneVisibility
  body: ZoneVisibility
  bottom: ZoneVisibility
}

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
  zones: ZoneState
  opacity: number
  /** 自动隐藏被临时挂起（如弹出面板打开、拖动中） */
  suspended: boolean
  hitTestStrategy: 'shape' | 'ignoreMouse'
  fadeStrategy: 'windowOpacity' | 'css'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface HotkeyInfo {
  accelerator: string
  registered: boolean
}

export const IPC_ERROR = {
  /** globalShortcut.register 返回 false 时抛出，调用方需提示用户更换组合键 */
  HOTKEY_TAKEN: 'HOTKEY_TAKEN'
} as const
