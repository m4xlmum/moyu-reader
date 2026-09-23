/**
 * IPC 通道与载荷契约。渲染进程、预加载与主进程共用这一份定义。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type {
  AppConfig,
  Bookmark,
  HistoryEntry,
  HotkeyInfo,
  PresetSite,
  Rect,
  SiteRecord,
  TabState,
  WindowRuntime
} from './types'

/** 渲染进程 → 主进程的请求通道（invoke/handle） */
export const INVOKE = {
  configGet: 'config:get',
  configPatch: 'config:patch',

  sitesList: 'sites:list',
  sitesAdd: 'sites:add',
  sitesUpdate: 'sites:update',
  sitesRemove: 'sites:remove',
  sitesReorder: 'sites:reorder',
  presetsList: 'presets:list',

  historyList: 'history:list',
  historyClear: 'history:clear',

  bookmarksList: 'bookmarks:list',
  bookmarksRemove: 'bookmarks:remove',
  bookmarksUpdate: 'bookmarks:update',

  tabsCreate: 'tabs:create',
  tabsHome: 'tabs:home',
  tabsClose: 'tabs:close',
  tabsActivate: 'tabs:activate',
  tabsReorder: 'tabs:reorder',
  tabsList: 'tabs:list',

  navGoto: 'nav:goto',
  navBack: 'nav:back',
  navForward: 'nav:forward',
  navReload: 'nav:reload',
  navStop: 'nav:stop',

  pageSetZoom: 'page:setZoom',
  pageSetUa: 'page:setUa',

  winSetOpacity: 'window:setOpacity',
  winCollapse: 'window:collapse',
  winExpand: 'window:expand',
  winOpenBallMenu: 'window:openBallMenu',
  winSetSize: 'window:setSize',
  winMinimize: 'window:minimize',
  winHideToTray: 'window:hideToTray',
  winReassert: 'window:reassert',
  winClose: 'window:close',
  winGetState: 'window:getState',

  uiOpenPopover: 'ui:openPopover',
  uiClosePopover: 'ui:closePopover',
  uiOpenSettings: 'ui:openSettings',

  hotkeyList: 'hotkey:list',
  hotkeySet: 'hotkey:set',

  appQuit: 'app:quit'
} as const

/** 主进程 → 渲染进程的广播通道（send/on） */
export const BROADCAST = {
  configChanged: 'config:changed',
  tabsState: 'tabs:state',
  windowState: 'window:state'
} as const

/**
 * 渲染进程 → 主进程的单向消息。
 *
 * 用于不需要回执的事件。拖动是高频动作，走 invoke/handle 的往返会引入延迟，
 * 而拖动的定位完全由主进程计算，本就不需要返回值。
 */
export const SEND = {
  dragStart: 'window:dragStart',
  dragEnd: 'window:dragEnd',
  /** 展开或折叠地址栏。主进程据此重排版面，再回传最终状态 */
  setAddressOpen: 'window:setAddressOpen',
  /**
   * 顶栏 / 右侧栏的显隐。
   *
   * 与地址栏同理：两者都是版面的一部分，正文是原生视图，必须由主进程
   * 先重排再回传，界面按回传的结果绘制。用户的选择还会落盘。
   */
  setChrome: 'window:setChrome',
  /**
   * 悬浮球的窗口内矩形（DIP）。
   *
   * 球是 DOM 元素，它的位置由 CSS 的排布决定；而收起时主进程要把整扇窗
   * 缩到球身上，因此必须由渲染进程把量到的矩形报上来。在别处重算一遍
   * 球的位置等于把版面规则抄成两份，迟早会差出几个像素。
   */
  setBallRect: 'window:setBallRect'
} as const

export type InvokeChannel = (typeof INVOKE)[keyof typeof INVOKE]
export type BroadcastChannel = (typeof BROADCAST)[keyof typeof BROADCAST]

// ---------------------------------------------------------------- 载荷类型

export type ConfigPatch = {
  [K in keyof AppConfig]?: AppConfig[K] extends object ? Partial<AppConfig[K]> : AppConfig[K]
}

export interface TabsStatePayload {
  tabs: TabState[]
  activeTabId: string | null
}

export interface OpenPopoverRequest {
  kind: 'sites' | 'history' | 'bookmarks' | 'uaZoom' | 'tabs'
  /** 锚点矩形（DIP，相对于摸鱼窗口的客户区），主进程据此摆放面板 */
  anchorRect: Rect
}

/** 顶栏 / 右侧栏的显隐请求。未给的字段保持原样 */
export interface ChromePatch {
  topBar?: boolean
  rail?: boolean
}

/**
 * 预加载暴露给渲染进程的 API 形状。
 * 这是渲染进程能触碰的全部主进程能力，不做任何额外暴露。
 */
export interface MoyuApi {
  config: {
    get(): Promise<AppConfig>
    patch(patch: ConfigPatch): Promise<AppConfig>
    onChanged(cb: (config: AppConfig) => void): () => void
  }
  sites: {
    list(): Promise<SiteRecord[]>
    add(input: { title?: string; url: string }): Promise<SiteRecord[]>
    update(input: { id: string; patch: Partial<SiteRecord> }): Promise<SiteRecord[]>
    remove(input: { id: string }): Promise<SiteRecord[]>
    reorder(input: { ids: string[] }): Promise<SiteRecord[]>
    presets(): Promise<PresetSite[]>
  }
  history: {
    list(input?: { query?: string; limit?: number; offset?: number }): Promise<HistoryEntry[]>
    clear(): Promise<void>
  }
  bookmarks: {
    list(input?: { query?: string }): Promise<Bookmark[]>
    remove(input: { id: string }): Promise<Bookmark[]>
    update(input: { id: string; patch: Partial<Bookmark> }): Promise<Bookmark[]>
  }
  tabs: {
    create(input?: { url?: string; activate?: boolean }): Promise<{ tabId: string }>
    /** 打开首页：已有则切过去，否则新建 */
    home(): Promise<{ tabId: string }>
    close(input: { tabId: string }): Promise<void>
    activate(input: { tabId: string }): Promise<void>
    reorder(input: { tabId: string; toIndex: number }): Promise<void>
    list(): Promise<TabsStatePayload>
    onState(cb: (payload: TabsStatePayload) => void): () => void
  }
  nav: {
    goto(input: { tabId: string; input: string }): Promise<void>
    back(input: { tabId: string }): Promise<void>
    forward(input: { tabId: string }): Promise<void>
    reload(input: { tabId: string }): Promise<void>
    stop(input: { tabId: string }): Promise<void>
  }
  page: {
    setZoom(input: { tabId: string; op: 'in' | 'out' | 'reset' | 'set'; value?: number }): Promise<number>
    setUa(input: { tabId: string; mode: 'desktop' | 'mobile' }): Promise<string>
  }
  win: {
    setOpacity(input: { value: number }): Promise<void>
    /** 整个界面缩成悬浮球 */
    collapse(): Promise<void>
    /** 从悬浮球展开回完整界面 */
    expand(): Promise<void>
    /**
     * 开始拖动窗口。定位由主进程计算——它读得到全局光标位置，
     * 因此即使指针短暂移出窗口也不会丢失跟踪。
     */
    dragStart(): void
    /** 结束拖动 */
    dragEnd(): void
    /**
     * 展开或折叠地址栏。
     *
     * 它是版面的一部分：展开时正文要让出一行，所以状态由主进程持有，
     * 渲染进程只发出意图，界面按回传的状态绘制。因此没有回执。
     */
    setAddressOpen(input: { open: boolean }): void
    /** 显示或隐藏顶栏 / 右侧栏。两者都是版面的一部分，同 setAddressOpen */
    setChrome(input: ChromePatch): void
    /**
     * 上报悬浮球此刻在窗口内的矩形。
     *
     * 球的位置由 CSS 排布决定（排在顶栏里，或顶栏隐藏时浮在右上角），
     * 主进程不重复推导，只按收到的矩形把窗口缩到球身上。
     */
    setBallRect(rect: Rect): void
    /** 在光标处弹出悬浮球菜单（含「隐藏顶部栏」） */
    openBallMenu(): Promise<void>
    setSize(input: { preset: string } | { width: number; height: number }): Promise<void>
    minimize(): Promise<void>
    hideToTray(): Promise<void>
    reassert(): Promise<void>
    close(): Promise<void>
    getState(): Promise<WindowRuntime>
    onState(cb: (state: WindowRuntime) => void): () => void
  }
  ui: {
    openPopover(req: OpenPopoverRequest): Promise<void>
    closePopover(): Promise<void>
    /**
     * 打开个人中心。
     *
     * 它和起始页一样是窗口内的一页，不开独立窗口：独立窗口会出现在任务栏
     * 与 Alt+Tab 里，等于把「我在摸鱼」写在脸上。已有这一页就切过去，
     * 不重复开。
     */
    openSettings(): Promise<void>
  }
  hotkey: {
    list(): Promise<{ bossMinimize: HotkeyInfo; bossHideToTray: HotkeyInfo }>
    set(input: {
      which: 'bossMinimize' | 'bossHideToTray'
      accelerator: string
    }): Promise<{ ok: boolean; accelerator: string; reason?: string }>
  }
  app: {
    quit(): Promise<void>
  }
}
