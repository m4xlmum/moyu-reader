/**
 * 窗口类 IPC：透明度、分区显隐、尺寸、老板键、退出。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcMain } from 'electron'
import { INVOKE, SEND, type ChromePatch, type OpenPopoverRequest } from '@shared/ipc'
import type { SizePreset } from '@shared/constants'
import type { Rect, ResizeEdge } from '@shared/types'
import type { AppContext } from '../context'
import { popupBallMenu } from '../services/ballMenu'

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

  // 最大化 / 还原：顶栏那枚图标、悬浮球菜单、网页里视频的全屏（第四批）
  // 三条路都走主进程内部同一对入口，结果必然一致
  ipcMain.handle(INVOKE.winMaximize, () => {
    ctx.controller.maximize()
  })

  ipcMain.handle(INVOKE.winRestore, () => {
    ctx.controller.restore()
  })

  // 拖动走单向消息：高频且不需要回执
  ipcMain.on(SEND.dragStart, () => ctx.controller.beginDrag())
  ipcMain.on(SEND.dragEnd, () => ctx.controller.endDrag())

  // 缩放同路：界面只报「拖的是哪条边」，起始矩形与光标都由主进程读
  ipcMain.on(SEND.resizeStart, (_e, edge: ResizeEdge) => {
    ctx.controller.beginResize(edge)
  })
  ipcMain.on(SEND.resizeEnd, () => ctx.controller.endResize())

  // 地址栏折叠同样走单向消息：它只是一次版面切换，状态由主进程持有并回传
  ipcMain.on(SEND.setAddressOpen, (_e, input: { open: boolean }) => {
    ctx.controller.setAddressOpen(input.open)
  })

  // 顶栏 / 右侧栏的显隐与地址栏同类
  ipcMain.on(SEND.setChrome, (_e, input: ChromePatch) => {
    ctx.controller.setChrome(input)
  })

  // 球在窗口内的位置由渲染进程量好上报，收起时按它把窗口缩到球身上
  ipcMain.on(SEND.setBallRect, (_e, rect: Rect) => {
    ctx.controller.setBallRect(rect)
  })

  ipcMain.handle(INVOKE.winOpenBallMenu, () => {
    popupBallMenu({
      getWindow: () => ctx.controller.getWindow(),
      getRuntime: () => ctx.controller.getRuntime(),
      setChrome: (patch) => ctx.controller.setChrome(patch),
      restoreWindow: () => ctx.controller.restore(),
      hideToTray: () => void ctx.controller.hideToTray(),
      openSettings: () => ctx.openSettings(),
      quit: () => ctx.quit()
    })
  })

  ipcMain.handle(INVOKE.winSetSize, (_e, input: { preset: SizePreset } | { width: number; height: number }) => {
    ctx.controller.setSize(input)
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

  ipcMain.handle(INVOKE.uiOpenSettings, () => {
    ctx.openSettings()
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
