/**
 * 全局常量。主进程、预加载与渲染进程共享。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/** 顶部菜单栏高度（DIP） */
export const TOP_BAR_H = 38

/**
 * 地址栏展开时占用的高度（DIP）。
 *
 * 地址栏默认折叠。横屏下纵向空间最紧张，而起始页本身就是一个搜索入口，
 * 常驻一行地址栏是白占地方。折叠时这一行高度归零，正文直接顶到顶栏下沿。
 */
export const ADDRESS_H = 34

/**
 * 右侧功能栏宽度（DIP）。
 *
 * 站点、历史、书签、缩放、透明度、设置这些原本摊在底栏的功能都收在这条竖栏里。
 * 底栏要横跨整个窗口宽度，而竖栏只吃掉 48px：在 960 宽的窗口里是 5%，
 * 而 44px 高的底栏在 540 高的窗口里要占掉 8%。横屏下后者才是更贵的那条。
 */
export const RAIL_W = 48

/**
 * 窗口保持 16:9 横屏比例。
 *
 * 横屏下窗口更宽更矮，纵向空间宝贵，因此两条工具栏的高度按
 * 540 高度下的占比定，不能再沿用竖屏时代的比例。
 */
export const ASPECT_RATIO = 16 / 9

/**
 * 悬浮球直径（DIP）。
 *
 * 球是顶栏里的一个按钮，因此直径是个版面常量，不再是可调项：
 * 它比同排的图标按钮略大一圈，落在 38px 高的顶栏里上下各余 5px。
 * 顶栏藏起来时球改停在右侧栏顶端（RAIL_W = 48 = 直径 + 两侧留白）。
 */
export const BALL_SIZE = 28

/**
 * 顶栏藏起来之后，悬浮球距窗口边缘的留白。
 *
 * 球平时就排在顶栏里，不需要留白；只有顶栏被隐藏、球孤零零地浮在
 * 右上角时才用得上这个值。渲染进程的 CSS 与主进程的兜底矩形共用它。
 */
export const BALL_MARGIN = 10

/** 主进程鼠标位置轮询间隔（毫秒） */
export const POLL_MS = 50
/** 拖动窗口时跟踪光标的间隔（毫秒）。比普通轮询快得多，拖动才跟手 */
export const DRAG_TICK_MS = 16
/** 光标离开后多久才收起成球（毫秒）。收起慢、展开靠点击，避免误触 */
export const HIDE_DELAY_MS = 700
/** 淡入淡出时长（毫秒） */
export const FADE_MS = 200
/** 淡入淡出的计时器步长（毫秒） */
export const FADE_TICK_MS = 16
/**
 * 窗口停止移动多久后才落盘位置、重放表面状态（毫秒）。
 *
 * 顶栏是 `-webkit-app-region: drag`，用系统拖动窗口时每帧都会发一次 move，
 * 约 8ms 一次。若每次都写配置并重放整套窗口属性，就是持续闪烁加持续落盘。
 * 位置本身立即记在内存里，只有这两件有副作用的事要等它停下来。
 */
export const MOVE_SETTLE_MS = 200

/** 透明度下限。0 会让窗口不可见却仍可交互，形成自我锁定，故不允许 */
export const OPACITY_MIN = 0.05
export const OPACITY_MAX = 1

/** 窗口尺寸预设（DIP）。除迷你外均严格 16:9 */
export const SIZE_PRESETS = {
  mini: { width: 480, height: 270 },
  small: { width: 800, height: 450 },
  medium: { width: 960, height: 540 },
  large: { width: 1280, height: 720 }
} as const

export type SizePreset = keyof typeof SIZE_PRESETS

/** 默认老板键。Alt+Z 最小化/恢复，Alt+X 藏进托盘 */
export const DEFAULT_BOSS_MINIMIZE = 'Alt+Z'
export const DEFAULT_BOSS_HIDE = 'Alt+X'

/**
 * 配置文件版本，用于迁移。
 *
 * 2：窗口由竖屏改为 16:9 横屏，旧的竖屏尺寸不再适用。
 * 3：隐藏策略改为收起成悬浮球，旧的按区域隐藏设置整体作废。
 * 4：悬浮球改为窗口内的常驻元素，且自动收起默认关闭。
 * 5：底栏取消，功能移入右侧栏，悬浮球不再有「左下」这个停靠位。
 * 6：悬浮球移入顶栏并成为其中的一个按钮，停靠位置与大小不再可调；
 *    顶栏与右侧栏改为可各自隐藏（ui.topBarOpen / ui.railOpen）。
 */
export const CONFIG_VERSION = 6

/** 1 版时代的竖屏尺寸；命中这些值说明是「没改过尺寸」的旧配置，迁移时重置 */
export const LEGACY_PORTRAIT_SIZES: ReadonlyArray<{ width: number; height: number }> = [
  { width: 280, height: 500 },
  { width: 420, height: 640 },
  { width: 560, height: 800 },
  { width: 760, height: 900 }
]

/** 历史记录上限 */
export const HISTORY_LIMIT = 2000

/** 默认搜索引擎 */
export const DEFAULT_SEARCH_TEMPLATE = 'https://www.bing.com/search?q=%s'

/**
 * 首页在标签条上的伪地址。
 *
 * 首页是「自家页面」，需要 preload 才能读到站点与历史；
 * 而访客页面刻意不注入任何 preload。两者因此是不同类型的标签页，
 * 由 TabManager 的 kind 区分，绝不共用同一个视图。
 */
export const HOME_URL = 'moyu://home'
export const HOME_TITLE = '起始页'

/** 标签页状态广播去抖（毫秒） */
export const TABS_BROADCAST_DEBOUNCE_MS = 60

/** 持久化写入去抖（毫秒） */
export const PERSIST_DEBOUNCE_MS = 300
