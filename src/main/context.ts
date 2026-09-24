/**
 * 应用级依赖的聚合。所有服务在此汇合，供 IPC 层引用。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { OpenPopoverRequest } from '@shared/ipc'
import type { BallIconStore } from './services/ballIconStore'
import type { BookmarkStore } from './services/bookmarkStore'
import type { BossKeyService } from './services/bossKeyService'
import type { ConfigStore } from './services/configStore'
import type { HistoryStore } from './services/historyStore'
import type { SiteStore } from './services/siteStore'
import type { TabManager } from './services/tabManager'
import type { TrayService } from './services/trayService'
import type { WindowController } from './services/windowController'
import type { WindowRegistry } from './services/windowRegistry'

export interface AppContext {
  userDataDir: string
  config: ConfigStore
  registry: WindowRegistry
  sites: SiteStore
  history: HistoryStore
  bookmarks: BookmarkStore
  /** 用户上传的悬浮球图标。单独一个文件、单独一组通道，见 ballIconStore.ts */
  ballIcon: BallIconStore
  controller: WindowController
  tabs: TabManager
  bossKeys: BossKeyService
  tray: TrayService
  /** 向所有界面窗口广播 */
  broadcast: (channel: string, payload: unknown) => void
  openSettings: () => void
  openPopover: (req: OpenPopoverRequest) => void
  closePopover: () => void
  quit: () => void
}
