/**
 * 弹出面板窗口：站点列表、历史、书签、UA/缩放这些小面板。
 *
 * 刻意做成独立的子窗口，而不是 chrome 视图里的一块 DOM：
 * chrome 视图要覆盖整个窗口并保持中部透明，把面板塞进去会让
 * 命中区域与透明区域的计算复杂化。独立窗口更简单也更可靠。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BrowserWindow, screen } from 'electron'
import type { OpenPopoverRequest } from '@shared/ipc'
import type { Rect } from '@shared/types'
import type { WindowRegistry } from './windowRegistry'
import { rendererUrl } from './rendererUrl'
import { log } from './logger'

const POPOVER_W = 320
const POPOVER_H = 420
const GAP = 6

export class PopoverWindowService {
  private win: BrowserWindow | null = null
  private currentKind: OpenPopoverRequest['kind'] | null = null

  constructor(
    private readonly registry: WindowRegistry,
    private readonly preloadPath: string,
    private readonly getParentBounds: () => Rect | null
  ) {}

  getKind(): OpenPopoverRequest['kind'] | null {
    return this.currentKind
  }

  open(req: OpenPopoverRequest): void {
    const parentBounds = this.getParentBounds()
    if (!parentBounds) return

    // 同一个面板再次点击视为收起
    if (this.currentKind === req.kind && this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.close()
      return
    }

    this.close()

    const { x, y } = this.place(parentBounds, req.anchorRect)

    const win = new BrowserWindow({
      x,
      y,
      width: POPOVER_W,
      height: POPOVER_H,
      // 不用 parent 选项：摸鱼窗口是 BaseWindow，而非 BrowserWindow。
      // 置顶与显式关闭已足够保证层级与生命周期。
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.win = win
    this.currentKind = req.kind

    // 面板打开期间必须挂起自动隐藏，否则用户一移开光标主体就藏了，
    // 面板会孤零零飘在桌面上。
    this.registry.add(win, {
      interactiveScreenRects: () => null,
      blocksAutoHide: true
    })

    win.on('blur', () => this.close())
    win.on('closed', () => {
      this.registry.remove(win.id)
      if (this.win === win) this.win = null
      this.currentKind = null
    })

    win.once('ready-to-show', () => win.showInactive())

    const url = `${rendererUrl('popover')}?kind=${encodeURIComponent(req.kind)}`
    win.loadURL(url).catch((err) => log.error('加载弹出面板失败', err))
  }

  close(): void {
    const win = this.win
    this.win = null
    this.currentKind = null
    if (win && !win.isDestroyed()) {
      this.registry.remove(win.id)
      win.close()
    }
  }

  /** 依据锚点与屏幕可用区域决定面板摆在哪一侧 */
  private place(parentBounds: Rect, anchor: Rect): { x: number; y: number } {
    const anchorScreenX = parentBounds.x + anchor.x
    const anchorScreenY = parentBounds.y + anchor.y

    const display = screen.getDisplayNearestPoint({ x: anchorScreenX, y: anchorScreenY })
    const area = display.workArea

    let x = anchorScreenX
    if (x + POPOVER_W > area.x + area.width) x = area.x + area.width - POPOVER_W
    if (x < area.x) x = area.x

    // 优先摆在锚点上方（底部工具栏通常贴着屏幕下沿），放不下再摆到下方
    let y = anchorScreenY - POPOVER_H - GAP
    if (y < area.y) y = anchorScreenY + anchor.height + GAP
    if (y + POPOVER_H > area.y + area.height) y = area.y + area.height - POPOVER_H
    if (y < area.y) y = area.y

    return { x: Math.round(x), y: Math.round(y) }
  }
}
