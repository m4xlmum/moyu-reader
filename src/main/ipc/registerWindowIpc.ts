/**
 * 窗口类 IPC：透明度、分区显隐、尺寸、老板键、退出。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcMain } from 'electron'
import { INVOKE, type OpenPopoverRequest } from '@shared/ipc'
import type { SizePreset } from '@shared/constants'
import type { BallCorner } from '@shared/types'
import type { AppContext } from '../context'

export function registerWindowIpc(ctx: AppContext): void {
  ipcMain.handle(INVOKE.winGetState, () => ctx.controller.getRuntime())

  ipcMain.handle(INVOKE.winSetOpacity, (_e, input: { value: number }) => {
    ctx.controller.setOpacity(input.value)
  })

  ipcMain.handle(INVOKE.winCollapse, () => {
    ctx.controller.collapse()
  })

  ipcMain.handle(INVOKE.winExpand, () => {
    ctx.controller.expand()
  })

  ipcMain.handle(INVOKE.winSetBallCorner, (_e, input: { corner: BallCorner }) => {
    ctx.controller.setBallCorner(input.corner)
  })

  ipcMain.handle(INVOKE.winSetSize, (_e, input: { preset: SizePreset } | { width: number; height: number }) => {
    ctx.controller.setSize(input)
  })

  ipcMain.handle(INVOKE.winToggleMini, (_e, input: { enabled: boolean }) => {
    ctx.controller.setMiniMode(input.enabled)
  })

  ipcMain.handle(INVOKE.winMinimize, () => {
    ctx.controller.minimize()
  })

  ipcMain.handle(INVOKE.winHideToTray, async () => {
    await ctx.controller.hideToTray()
  })

  ipcMain.handle(INVOKE.winReassert, () => {
    ctx.controller.reassert()
  })

  ipcMain.handle(INVOKE.winClose, async () => {
    // 关闭按钮的行为是藏进托盘而不是退出——退出走托盘菜单，避免误关
    await ctx.controller.hideToTray()
  })

  // ---------------------------------------------------------------- 界面
  ipcMain.handle(INVOKE.uiOpenPopover, (_e, req: OpenPopoverRequest) => {
    ctx.openPopover(req)
  })

  ipcMain.handle(INVOKE.uiClosePopover, () => {
    ctx.closePopover()
  })

  ipcMain.handle(INVOKE.uiOpenSettings, (_e, input?: { section?: string }) => {
    ctx.openSettings(input?.section)
  })

  // ---------------------------------------------------------------- 老板键
  ipcMain.handle(INVOKE.hotkeyList, () => ctx.bossKeys.list())

  ipcMain.handle(
    INVOKE.hotkeySet,
    (_e, input: { which: 'bossMinimize' | 'bossHideToTray'; accelerator: string }) => {
      const handler =
        input.which === 'bossMinimize' ? () => toggleMinimize(ctx) : () => void ctx.controller.hideToTray()

      const result = ctx.bossKeys.register(input.which, input.accelerator, handler)
      if (result.ok) {
        ctx.config.set((cfg) => ({
          ...cfg,
          hotkeys: { ...cfg.hotkeys, [input.which]: input.accelerator }
        }))
      }
      return {
        ok: result.ok,
        accelerator: input.accelerator,
        reason: result.reason
      }
    }
  )

  // ---------------------------------------------------------------- 应用
  ipcMain.handle(INVOKE.appQuit, () => {
    ctx.quit()
  })
}

/** 老板键 1：最小化与恢复之间切换。已最小化时按一下应恢复，否则用户会以为它丢了。 */
function toggleMinimize(ctx: AppContext): void {
  const win = ctx.controller.getWindow()
  if (!win) return
  if (ctx.controller.getMode() === 'minimized' || win.isMinimized()) {
    ctx.controller.show()
  } else {
    ctx.controller.minimize()
  }
}
