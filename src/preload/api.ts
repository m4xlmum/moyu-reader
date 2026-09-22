/**
 * 预加载脚本：把一组固定的、类型化的能力暴露给渲染进程。
 *
 * 渲染进程永远拿不到 ipcRenderer 本身，只能调用这里列出的方法。
 * 通道名由 @shared/ipc 统一提供，避免两侧写错字符串而静默失效。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcRenderer } from 'electron'
import { BROADCAST, INVOKE } from '@shared/ipc'
import type {
  ConfigPatch,
  MoyuApi,
  OpenPopoverRequest,
  TabsStatePayload
} from '@shared/ipc'
import type {
  AppConfig,
  Bookmark,
  HistoryEntry,
  HotkeyInfo,
  PresetSite,
  SiteRecord,
  WindowRuntime
} from '@shared/types'
import type { SizePreset } from '@shared/constants'

/** 订阅广播并返回取消订阅函数，避免渲染进程堆积监听器 */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

export const api: MoyuApi = {
  config: {
    get: () => ipcRenderer.invoke(INVOKE.configGet) as Promise<AppConfig>,
    patch: (patch: ConfigPatch) => ipcRenderer.invoke(INVOKE.configPatch, patch) as Promise<AppConfig>,
    onChanged: (cb) => on<AppConfig>(BROADCAST.configChanged, cb)
  },

  sites: {
    list: () => ipcRenderer.invoke(INVOKE.sitesList) as Promise<SiteRecord[]>,
    add: (input) => ipcRenderer.invoke(INVOKE.sitesAdd, input) as Promise<SiteRecord[]>,
    update: (input) => ipcRenderer.invoke(INVOKE.sitesUpdate, input) as Promise<SiteRecord[]>,
    remove: (input) => ipcRenderer.invoke(INVOKE.sitesRemove, input) as Promise<SiteRecord[]>,
    reorder: (input) => ipcRenderer.invoke(INVOKE.sitesReorder, input) as Promise<SiteRecord[]>,
    presets: () => ipcRenderer.invoke(INVOKE.presetsList) as Promise<PresetSite[]>
  },

  history: {
    list: (input) => ipcRenderer.invoke(INVOKE.historyList, input) as Promise<HistoryEntry[]>,
    clear: () => ipcRenderer.invoke(INVOKE.historyClear) as Promise<void>
  },

  bookmarks: {
    list: (input) => ipcRenderer.invoke(INVOKE.bookmarksList, input) as Promise<Bookmark[]>,
    add: (input) => ipcRenderer.invoke(INVOKE.bookmarksAdd, input) as Promise<Bookmark[]>,
    remove: (input) => ipcRenderer.invoke(INVOKE.bookmarksRemove, input) as Promise<Bookmark[]>,
    update: (input) => ipcRenderer.invoke(INVOKE.bookmarksUpdate, input) as Promise<Bookmark[]>
  },

  tabs: {
    create: (input) => ipcRenderer.invoke(INVOKE.tabsCreate, input) as Promise<{ tabId: string }>,
    home: () => ipcRenderer.invoke(INVOKE.tabsHome) as Promise<{ tabId: string }>,
    close: (input) => ipcRenderer.invoke(INVOKE.tabsClose, input) as Promise<void>,
    activate: (input) => ipcRenderer.invoke(INVOKE.tabsActivate, input) as Promise<void>,
    reorder: (input) => ipcRenderer.invoke(INVOKE.tabsReorder, input) as Promise<void>,
    list: () => ipcRenderer.invoke(INVOKE.tabsList) as Promise<TabsStatePayload>,
    onState: (cb) => on<TabsStatePayload>(BROADCAST.tabsState, cb)
  },

  nav: {
    goto: (input) => ipcRenderer.invoke(INVOKE.navGoto, input) as Promise<void>,
    back: (input) => ipcRenderer.invoke(INVOKE.navBack, input) as Promise<void>,
    forward: (input) => ipcRenderer.invoke(INVOKE.navForward, input) as Promise<void>,
    reload: (input) => ipcRenderer.invoke(INVOKE.navReload, input) as Promise<void>,
    stop: (input) => ipcRenderer.invoke(INVOKE.navStop, input) as Promise<void>
  },

  page: {
    setZoom: (input) => ipcRenderer.invoke(INVOKE.pageSetZoom, input) as Promise<number>,
    setUa: (input) => ipcRenderer.invoke(INVOKE.pageSetUa, input) as Promise<string>
  },

  win: {
    setOpacity: (input) => ipcRenderer.invoke(INVOKE.winSetOpacity, input) as Promise<void>,
    collapse: () => ipcRenderer.invoke(INVOKE.winCollapse) as Promise<void>,
    expand: () => ipcRenderer.invoke(INVOKE.winExpand) as Promise<void>,
    setBallCorner: (input) => ipcRenderer.invoke(INVOKE.winSetBallCorner, input) as Promise<void>,
    setSize: (input: { preset: SizePreset } | { width: number; height: number }) =>
      ipcRenderer.invoke(INVOKE.winSetSize, input) as Promise<void>,
    toggleMini: (input) => ipcRenderer.invoke(INVOKE.winToggleMini, input) as Promise<void>,
    minimize: () => ipcRenderer.invoke(INVOKE.winMinimize) as Promise<void>,
    hideToTray: () => ipcRenderer.invoke(INVOKE.winHideToTray) as Promise<void>,
    reassert: () => ipcRenderer.invoke(INVOKE.winReassert) as Promise<void>,
    close: () => ipcRenderer.invoke(INVOKE.winClose) as Promise<void>,
    getState: () => ipcRenderer.invoke(INVOKE.winGetState) as Promise<WindowRuntime>,
    onState: (cb) => on<WindowRuntime>(BROADCAST.windowState, cb)
  },

  ui: {
    openPopover: (req: OpenPopoverRequest) =>
      ipcRenderer.invoke(INVOKE.uiOpenPopover, req) as Promise<void>,
    closePopover: () => ipcRenderer.invoke(INVOKE.uiClosePopover) as Promise<void>,
    openSettings: (input) => ipcRenderer.invoke(INVOKE.uiOpenSettings, input) as Promise<void>
  },

  hotkey: {
    list: () =>
      ipcRenderer.invoke(INVOKE.hotkeyList) as Promise<{
        bossMinimize: HotkeyInfo
        bossHideToTray: HotkeyInfo
      }>,
    set: (input) =>
      ipcRenderer.invoke(INVOKE.hotkeySet, input) as Promise<{
        ok: boolean
        accelerator: string
        reason?: string
      }>
  },

  app: {
    quit: () => ipcRenderer.invoke(INVOKE.appQuit) as Promise<void>
  }
}
