/**
 * 全局常量。主进程、预加载与渲染进程共享。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/** 顶部菜单栏高度（DIP） */
export const TOP_BAR_H = 36
/** 底部工具栏高度（DIP） */
export const BOTTOM_BAR_H = 40
/** 隐藏后仍可交互、用于显形与拖动的条带高度（DIP） */
export const REVEAL_STRIP_H = 6

/** 主进程鼠标位置轮询间隔（毫秒） */
export const POLL_MS = 50
/** 光标离开后多久才隐藏主体（毫秒）。隐藏慢、显形快，避免误触 */
export const HIDE_DELAY_MS = 400
/** 淡入淡出时长（毫秒） */
export const FADE_MS = 200
/** 淡入淡出的计时器步长（毫秒） */
export const FADE_TICK_MS = 16

/** 透明度下限。0 会让窗口不可见却仍可交互，形成自我锁定，故不允许 */
export const OPACITY_MIN = 0.05
export const OPACITY_MAX = 1

/** 窗口尺寸预设（DIP） */
export const SIZE_PRESETS = {
  mini: { width: 280, height: 500 },
  small: { width: 420, height: 640 },
  medium: { width: 560, height: 800 },
  large: { width: 760, height: 900 }
} as const

export type SizePreset = keyof typeof SIZE_PRESETS

/** 默认老板键。Alt+Z 最小化/恢复，Alt+X 藏进托盘 */
export const DEFAULT_BOSS_MINIMIZE = 'Alt+Z'
export const DEFAULT_BOSS_HIDE = 'Alt+X'

/** 配置文件版本，用于迁移 */
export const CONFIG_VERSION = 1

/** 历史记录上限 */
export const HISTORY_LIMIT = 2000

/** 默认搜索引擎 */
export const DEFAULT_SEARCH_TEMPLATE = 'https://www.bing.com/search?q=%s'

/** 标签页状态广播去抖（毫秒） */
export const TABS_BROADCAST_DEBOUNCE_MS = 60

/** 持久化写入去抖（毫秒） */
export const PERSIST_DEBOUNCE_MS = 300
