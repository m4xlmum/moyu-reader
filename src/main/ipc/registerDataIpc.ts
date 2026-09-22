/**
 * 数据类 IPC：配置、我的站点、历史、书签。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcMain } from 'electron'
import { INVOKE } from '@shared/ipc'
import type { ConfigPatch } from '@shared/ipc'
import { PRESET_SITES } from '@shared/presets'
import type { AppContext } from '../context'

export function registerDataIpc(ctx: AppContext): void {
  // ---------------------------------------------------------------- 配置
  ipcMain.handle(INVOKE.configGet, () => ctx.config.get())

  ipcMain.handle(INVOKE.configPatch, (_e, patch: ConfigPatch) => {
    const before = ctx.config.get()
    const after = ctx.config.patch(patch)

    // 影响窗口表现的配置变更需要立即生效
    if (after.stealth.contentProtection !== before.stealth.contentProtection) {
      ctx.controller.setContentProtection(after.stealth.contentProtection)
    }
    if (after.stealth.revealStripHeight !== before.stealth.revealStripHeight) {
      ctx.controller.recomputeLayout()
    }
    if (after.stealth.autoHideBody !== before.stealth.autoHideBody && !after.stealth.autoHideBody) {
      // 关掉自动隐藏时，确保主体是显示的，否则用户会以为窗口坏了
      ctx.controller.applyZones({ ...ctx.controller.getZones(), body: 'shown' })
    }

    ctx.broadcast('config:changed', after)
    return after
  })

  // ---------------------------------------------------------------- 我的站点
  ipcMain.handle(INVOKE.sitesList, () => ctx.sites.list())
  ipcMain.handle(INVOKE.sitesAdd, (_e, input: { title?: string; url: string }) => ctx.sites.add(input))
  ipcMain.handle(INVOKE.sitesUpdate, (_e, input: { id: string; patch: Record<string, unknown> }) =>
    ctx.sites.update(input.id, input.patch)
  )
  ipcMain.handle(INVOKE.sitesRemove, (_e, input: { id: string }) => ctx.sites.remove(input.id))
  ipcMain.handle(INVOKE.sitesReorder, (_e, input: { ids: string[] }) => ctx.sites.reorder(input.ids))
  ipcMain.handle(INVOKE.presetsList, () => PRESET_SITES)

  // ---------------------------------------------------------------- 历史
  ipcMain.handle(INVOKE.historyList, (_e, input?: { query?: string; limit?: number; offset?: number }) =>
    ctx.history.query(input ?? {})
  )
  ipcMain.handle(INVOKE.historyClear, () => {
    ctx.history.clear()
  })

  // ---------------------------------------------------------------- 书签
  ipcMain.handle(INVOKE.bookmarksList, (_e, input?: { query?: string }) => ctx.bookmarks.query(input ?? {}))
  ipcMain.handle(INVOKE.bookmarksAdd, (_e, input: { title: string; url: string; faviconUrl?: string }) =>
    ctx.bookmarks.add(input)
  )
  ipcMain.handle(INVOKE.bookmarksRemove, (_e, input: { id: string }) => ctx.bookmarks.remove(input.id))
  ipcMain.handle(INVOKE.bookmarksUpdate, (_e, input: { id: string; patch: Record<string, unknown> }) =>
    ctx.bookmarks.update(input.id, input.patch)
  )
}
