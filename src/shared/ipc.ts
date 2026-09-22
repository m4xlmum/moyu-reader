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
  WindowRuntime,
  ZoneState
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
  bookmarksAdd: 'bookmarks:add',
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
  winApplyZones: 'window:applyZones',
  winSetSize: 'window:setSize',
  winToggleMini: 'window:toggleMini',
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
  kind: 'sites' | 'history' | 'bookmarks' | 'uaZoom'
  /** 锚点矩形（DIP，相对于摸鱼窗口的客户区），主进程据此摆放面板 */
  anchorRect: Rect
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
    add(input: { title: string; url: string; faviconUrl?: string }): Promise<Bookmark[]>
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
    applyZones(zones: ZoneState): Promise<ZoneState>
    setSize(input: { preset: string } | { width: number; height: number }): Promise<void>
    toggleMini(input: { enabled: boolean }): Promise<void>
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
    openSettings(input?: { section?: string }): Promise<void>
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
