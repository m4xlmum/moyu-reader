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
/**
 * 标签页面板的高度。
 *
 * 它的锚点在顶栏，比其它面板更靠上，矮一点才不会在窗口贴着屏幕上沿时
 * 被挤到屏幕外；一屏能列下的标签页数量也够用了，多出来的自己滚。
 */
const TABS_H = 360
const GAP = 6

/** 面板尺寸按类型给。标签页列表不需要那么高 */
function sizeOf(kind: OpenPopoverRequest['kind']): { width: number; height: number } {
  return { width: POPOVER_W, height: kind === 'tabs' ? TABS_H : POPOVER_H }
}

/**
 * 往锚点**下方**摆的类型。
 *
 * 默认往上摆是因为锚点大多在窗口底部（右栏）；标签页的锚点在顶栏上，
 * 再往上摆就飘到窗口外面去了。
 */
const PREFER_BELOW: ReadonlySet<OpenPopoverRequest['kind']> = new Set(['tabs'])

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

    const size = sizeOf(req.kind)
    const { x, y } = this.place(parentBounds, req.anchorRect, size, PREFER_BELOW.has(req.kind))

    const win = new BrowserWindow({
      x,
      y,
      width: size.width,
      height: size.height,
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

    // 面板打开期间必须挂起自动收起，否则用户一移开光标界面就缩成球，
    // 面板会孤零零飘在桌面上。
    this.registry.add(win, { blocksAutoHide: true })

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
  private place(
    parentBounds: Rect,
    anchor: Rect,
    size: { width: number; height: number },
    preferBelow: boolean
  ): { x: number; y: number } {
    const anchorScreenX = parentBounds.x + anchor.x
    const anchorScreenY = parentBounds.y + anchor.y

    const display = screen.getDisplayNearestPoint({ x: anchorScreenX, y: anchorScreenY })
    const area = display.workArea

    let x = anchorScreenX
    if (x + size.width > area.x + area.width) x = area.x + area.width - size.width
    if (x < area.x) x = area.x

    const below = anchorScreenY + anchor.height + GAP
    const above = anchorScreenY - size.height - GAP

    // 锚点在底部的（右栏）优先往上摆，锚点在顶部的（顶栏）优先往下摆，
    // 两边都放不下时再退到另一侧，最后夹进工作区
    let y = preferBelow ? below : above
    if (y < area.y || y + size.height > area.y + area.height) {
      const fallback = preferBelow ? above : below
      y = Math.min(Math.max(fallback, area.y), area.y + area.height - size.height)
    }
    if (y < area.y) y = area.y

    return { x: Math.round(x), y: Math.round(y) }
  }
}
