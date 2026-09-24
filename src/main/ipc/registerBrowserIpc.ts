/**
 * 浏览器类 IPC：标签页、导航、缩放、UA。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcMain } from 'electron'
import { INVOKE } from '@shared/ipc'
import type { UaMode } from '@shared/ua'
import type { AppContext } from '../context'

export function registerBrowserIpc(ctx: AppContext): void {
  // 与 index.ts 里那条广播共用同一个快照：界面的初值与后续都是同一份形状
  ipcMain.handle(INVOKE.tabsList, () => ctx.tabs.snapshot())

  ipcMain.handle(INVOKE.tabsCreate, (_e, input?: { url?: string; activate?: boolean }) => {
    const tabId = ctx.tabs.create(input ?? {})
    return { tabId }
  })

  ipcMain.handle(INVOKE.tabsClose, (_e, input: { tabId: string }) => {
    ctx.tabs.close(input.tabId)
  })

  ipcMain.handle(INVOKE.tabsActivate, (_e, input: { tabId: string }) => {
    ctx.tabs.activate(input.tabId)
    // 切标签是明确的交互意图，顺带把主体显示出来
    ctx.controller.show()
  })

  ipcMain.handle(INVOKE.tabsReorder, (_e, input: { tabId: string; toIndex: number }) => {
    ctx.tabs.reorder(input.tabId, input.toIndex)
  })

  // tabId 为 null 是「正文区此刻不在任何一张网页上」（停在起始页 / 设置上），
  // 那一侧会另开一张标签页，见 TabManager.goto
  ipcMain.handle(INVOKE.navGoto, (_e, input: { tabId: string | null; input: string }) => {
    ctx.tabs.goto(input.tabId, input.input)
  })
  ipcMain.handle(INVOKE.navBack, (_e, input: { tabId: string }) => ctx.tabs.back(input.tabId))
  ipcMain.handle(INVOKE.navForward, (_e, input: { tabId: string }) => ctx.tabs.forward(input.tabId))
  ipcMain.handle(INVOKE.navReload, (_e, input: { tabId: string }) => ctx.tabs.reload(input.tabId))
  ipcMain.handle(INVOKE.navStop, (_e, input: { tabId: string }) => ctx.tabs.stop(input.tabId))

  ipcMain.handle(
    INVOKE.pageSetZoom,
    (_e, input: { tabId: string; op: 'in' | 'out' | 'reset' | 'set'; value?: number }) =>
      ctx.tabs.setZoom(input.tabId, input.op, input.value)
  )

  ipcMain.handle(INVOKE.pageSetUa, (_e, input: { tabId: string; mode: UaMode }) =>
    ctx.tabs.setUa(input.tabId, input.mode)
  )
}
