/**
 * 全局常量。主进程、预加载与渲染进程共享。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/**
 * 顶部功能栏高度（DIP）。
 *
 * 由悬浮球的直径决定：球就排在这一行里，44 = 40 + 上下各 2px 留白。
 */
export const TOP_BAR_H = 44

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
 * 球是顶栏里的一个按钮，也是收起之后整扇窗的内容。
 * 40 不是随手取的：收起时窗口要缩到球身上，而平台不接受过小的窗口
 * （实测下限约 32×39，见 spike/minsize.js）。球若小于这个下限，
 * 窗口就缩不到球那么大，而球是铺满窗口画的，于是被拉成椭圆。
 * 40 是这个下限之上最小的整数直径。
 */
export const BALL_SIZE = 40

/**
 * 球面上图形的边长。
 *
 * 取球径的 0.46（40px 的球上是 18px）：再大图形就顶到球边，再小球心那点
 * 笔画就糊成一团。三处都要这个数——球自己（内置图形与自定义图的「中央图案」
 * 落法）、设置页的那排图标预览、裁剪弹窗里的预览球——因此只能有一份。
 * 那三处必须长得一模一样：设置页里看到的就应当是球面上的样子。
 */
export const BALL_GLYPH_SIZE = Math.round(BALL_SIZE * 0.46)

/**
 * 顶栏藏起来之后，悬浮球距窗口边缘的留白。
 *
 * 由栏宽反推：RAIL_W = 48 = 直径 + 两侧各 4px，球才能正好落在右栏那一列里。
 * 渲染进程的 CSS 与主进程的兜底矩形共用它。
 */
export const BALL_MARGIN = (RAIL_W - BALL_SIZE) / 2

/**
 * 自绘缩放手柄的粗细（DIP）：四条边 4px，四个角 8×8。
 *
 * 为什么是自绘而不是 `resizable: true`：透明窗口开原生缩放会在某些 Windows
 * 版本上失效，而透明是这个程序的全部（见 windowSurface.ts）。
 *
 * 4 这个数不是随手取的——它恰好是顶栏与右侧栏自己的内边距，于是这两条边上的
 * 手柄永远压不到任何一个控件，只是把「栏目与窗口之间那几像素的留白」变成了
 * 可拖的区域。界面与探针读的是同一份数字（探针要去这些位置按一下）。
 */
export const RESIZE_EDGE = 4
export const RESIZE_CORNER = 8

/** 主进程鼠标位置轮询间隔（毫秒） */
export const POLL_MS = 50
/**
 * 拖动窗口时跟踪光标的间隔（毫秒）。
 *
 * 这个值必须**小于** Windows 的系统时钟滴答（约 15.6ms）——不是「越小越流畅」，
 * 而是「不小于它就会翻倍」：定时器间隔会被向上取整到滴答的整数倍。实测
 * （spike/dragTicks.js）请求 16ms 得到的是 p50 30.2ms，也就是两个滴答；
 * 请求 8ms 得到 15.1ms，一个滴答，这已经是 setInterval 在 Windows 上能给到的
 * 最快值。一个被取整成 30ms 的间隔，眼睛看到的就是拖动时画面一顿一顿。
 */
export const DRAG_TICK_MS = 8
/** 光标离开后多久才收起成球（毫秒）。收起慢、展开靠点击，避免误触 */
export const HIDE_DELAY_MS = 700
/** 淡入淡出时长（毫秒） */
export const FADE_MS = 200
/** 淡入淡出的计时器步长（毫秒） */
export const FADE_TICK_MS = 16
/**
 * 窗口停止移动多久后才落盘位置、重放表面状态（毫秒）。
 *
 * 自己实现的拖动每帧都会发一次 move（一个系统滴答一次）。若每次都写配置并重放
 * 整套窗口属性，就是持续闪烁加持续落盘。位置本身立即记在内存里，
 * 只有这两件有副作用的事要等它停下来。
 */
export const MOVE_SETTLE_MS = 200

/** 透明度下限。0 会让窗口不可见却仍可交互，形成自我锁定，故不允许 */
export const OPACITY_MIN = 0.05
export const OPACITY_MAX = 1

/**
 * 界面底板透明度范围。
 *
 * 与窗口透明度（OPACITY_MIN）不同，这里下限可以是 0：它作用的是界面自己画的
 * 底板（顶栏、地址栏、右栏、弹出面板），字与图标始终不透明。于是拉到 0
 * 剩下的是「浮在桌面上的几个按钮」，设置项本身仍然看得见、点得到，
 * 不会把自己锁在外面。网页与自家页面（起始页、系统设置）不受它影响——
 * 网页要给的是可读的纸，透过去的是底板，两者不是一回事。
 */
export const BACKGROUND_OPACITY_MIN = 0
export const BACKGROUND_OPACITY_MAX = 1

/** 窗口尺寸预设（DIP）。四个都严格 16:9，换尺寸不会让版面在两个方向上各自重排 */
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
 * 7：右侧栏去掉迷你与收藏；系统设置由独立窗口改为窗口内的一页（ui.homeTheme 同时加入）。
 * 8：起始页主题由七个收到三个，并且主题开始决定界面形态（卡片 / 命令行）。
 * 9：新增 ui.backgroundOpacity（界面底板透明度），默认 1（与旧行为一致）。
 * 10：新增 ui.ballIcon / ui.ballCustomFit（悬浮球图标）。默认值与旧行为一致，
 *     自定义图标本身另存 userData/ball-icon.json，不在配置里。
 */
export const CONFIG_VERSION = 10

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

/**
 * 系统设置在标签条上的伪地址。
 *
 * 与首页同属「自家页面」：带 preload、能读写配置，但它不再是一扇独立窗口——
 * 那扇窗口会出现在任务栏与 Alt+Tab 里，等于把「我在摸鱼」写在脸上。
 */
export const SETTINGS_URL = 'moyu://settings'
export const SETTINGS_TITLE = '系统设置'

/**
 * 起始页的两套世界。
 *
 * 主题不只是配色，它决定这一页**长成什么形态**：
 * - modern：卡片排版，像一张安静的桌面（纸白、暗夜）
 * - terminal：命令行排版，提示符 + 输出行 + 状态行（磷绿）
 *
 * 一份数据、一套交互，两套渲染。分开的理由是这两种形态对空间的用法根本不同：
 * 卡片要横竖两个方向的余量，命令行只要一行行往下排，在迷你档（正文区
 * 432×232）里反而更从容。
 */
export type HomeWorld = 'modern' | 'terminal'

/**
 * 起始页主题。
 *
 * 三个主题 = 两套世界：现代配色两套，荧光屏一套。
 * 主题只在起始页生效——它是「自己的一页」，换个样子不会影响阅读网页时的观感。
 */
export type HomeTheme = 'paper' | 'night' | 'crt-green'

export const HOME_THEMES: ReadonlyArray<{
  id: HomeTheme
  label: string
  hint: string
  world: HomeWorld
}> = [
  { id: 'paper', label: '纸白', hint: '浅色行式列表，日光灯下最不显眼', world: 'modern' },
  { id: 'night', label: '暗夜', hint: '深色行式列表，不发光，晚上眼睛舒服', world: 'modern' },
  { id: 'crt-green', label: '磷绿', hint: 'P1 单色终端：命令行、扫描线、余辉', world: 'terminal' }
]

export const DEFAULT_HOME_THEME: HomeTheme = 'paper'

/** 主题属于哪套世界。表里没有的（旧配置、写坏的配置）按现代世界处理 */
export function worldOfTheme(id: HomeTheme): HomeWorld {
  return HOME_THEMES.find((t) => t.id === id)?.world ?? 'modern'
}

/**
 * 8 版收掉的主题。
 *
 * 它们全是荧光屏那一类的，所以迁移时落到同属终端世界的磷绿上，
 * 而不是落到纸白——把选过黑底的人扔回白底，比换个荧光色更突兀。
 */
export const LEGACY_HOME_THEMES: readonly string[] = [
  'crt-amber',
  'crt-ice',
  'crt-white',
  'dos'
]

/**
 * 悬浮球可以画什么。
 *
 * 与 HOME_THEMES 一样，这份表是**唯一的一份**：主进程用它校验配置，
 * 渲染进程用它出选择器，球自己按 id 取图形。
 *
 * 挑的都是 40px 的球上还认得出的剪影——球面上只有 18px 画图标，
 * 那点地方放不下任何细节，认得出来靠的是外轮廓，不是笔画。
 */
export type BallIcon =
  | 'book'
  | 'eye'
  | 'fish'
  | 'coffee'
  | 'moon'
  | 'cat'
  | 'code'
  | 'headphones'

export const BALL_ICONS: ReadonlyArray<{ id: BallIcon; label: string }> = [
  { id: 'book', label: '书页' },
  { id: 'eye', label: '眯眼' },
  { id: 'fish', label: '摸鱼' },
  { id: 'coffee', label: '咖啡' },
  { id: 'moon', label: '月亮' },
  { id: 'cat', label: '猫' },
  { id: 'code', label: '代码' },
  { id: 'headphones', label: '耳机' }
]

export const DEFAULT_BALL_ICON: BallIcon = 'book'

/**
 * 自定义图标这一档。
 *
 * 它可以出现在 ballIcon 该出现的一切地方，但不是 BallIcon——内置的那几个
 * 画在代码里，这一个来自用户上传的图，两者的渲染路径完全不同。
 */
export const CUSTOM_BALL_ICON = 'custom'

export type BallIconChoice = BallIcon | typeof CUSTOM_BALL_ICON

/**
 * 自定义图标落进球里的两种方式。
 *
 * 只差一个尺寸：有的图本身就是一个完整的圆（头像、徽标），铺满才好看；
 * 有的是透明底上的一枚小图案，缩在球心才不至于把笔画顶到球边上去。
 *
 * 两种都保留球自己的底色。那一层在铺满时不显眼（图是不透明的就把它整个盖住了），
 * 而在图的透明部分上正好补上底色——否则收起态下球会整颗消失，
 * 而收起态的球就是窗口的全部内容。
 */
export type BallCustomFit = 'cover' | 'glyph'

export const BALL_CUSTOM_FITS: ReadonlyArray<{ id: BallCustomFit; label: string; hint: string }> = [
  { id: 'cover', label: '铺满球面', hint: '图铺满整颗球的边缘，适合本身是圆形的图' },
  { id: 'glyph', label: '中央图案', hint: '图缩在球心，四周留给球的底色' }
]

export const DEFAULT_BALL_CUSTOM_FIT: BallCustomFit = 'cover'

/**
 * 自定义图标的落盘边长（像素）。
 *
 * 球只有 40px，128 已留足 HiDPI 的余量（3 倍屏上是 120）。
 * 裁剪后按这个边长编码，存的就是它实际会被用到的尺寸——
 * 用户上传一张 4000px 的照片，没必要原样留在配置目录里。
 */
export const BALL_IMAGE_SIZE = 128

/**
 * 自定义图标的体积上限（字符数）。
 *
 * base64 之后大约是原始字节的 4/3，512KB 对应约 384KB 的图，
 * 而 128×128 的 WebP 通常在 5–20KB。这个上限只用来挡「显然不该收的东西」，
 * 正常上传碰不到它。
 */
export const BALL_IMAGE_MAX_BYTES = 512 * 1024

/** 标签页状态广播去抖（毫秒） */
export const TABS_BROADCAST_DEBOUNCE_MS = 60

/** 持久化写入去抖（毫秒） */
export const PERSIST_DEBOUNCE_MS = 300
