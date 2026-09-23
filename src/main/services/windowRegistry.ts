/**
 * 应用内所有可见窗口的登记处。
 *
 * 自动收起的判定不能只看摸鱼窗口自己：弹出面板或设置窗口打开时，
 * 光标离开摸鱼窗口是正常的，此时不该把界面收成球。
 * 把所有窗口收在这里，「光标是否还在本应用内」就成了一条统一规则。
 *
 * 收起成球之后，每个窗口的可交互范围就是它自己的矩形——
 * 不再有「某些区域看不见但仍接收点击」的情况，因此这里只需比矩形。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { BaseWindow } from 'electron'
import type { Rect } from '@shared/types'
import { pointInRect } from './geometry'

interface Entry {
  win: BaseWindow
  /** 为 true 时，只要该窗口可见就挂起摸鱼窗口的自动收起 */
  blocksAutoHide: boolean
}

export class WindowRegistry {
  private entries = new Map<number, Entry>()

  add(win: BaseWindow, opts: { blocksAutoHide: boolean }): void {
    this.entries.set(win.id, { win, ...opts })
  }

  remove(id: number): void {
    this.entries.delete(id)
  }

  /**
   * 光标（屏幕坐标）是否落在任一可见应用窗口内。
   * excludeId 用于排除摸鱼窗口自身，它另有判定。
   */
  cursorInAnyWindow(x: number, y: number, excludeId: number): boolean {
    for (const [id, entry] of this.entries) {
      if (id === excludeId) continue
      const bounds = visibleBounds(entry.win)
      if (bounds && pointInRect(x, y, bounds)) return true
    }
    return false
  }

  /** 是否存在要求挂起自动收起的可见窗口（如设置窗口、弹出面板） */
  hasAutoHideBlocker(excludeId: number): boolean {
    for (const [id, entry] of this.entries) {
      if (id === excludeId) continue
      if (!entry.blocksAutoHide) continue
      if (visibleBounds(entry.win)) return true
    }
    return false
  }

  clear(): void {
    this.entries.clear()
  }
}

/**
 * 窗口可见时的矩形，否则 null。
 *
 * 必须兜住异常：窗口销毁之后 isVisible() 与 getBounds() 都会抛
 * 「Object has been destroyed」。这条路径由 50ms 的收起轮询驱动，
 * 抛出去虽然被轮询自己接住，但会连带把轮询停掉——自动收起就此失效，
 * 而原因只是某个窗口刚被关掉。
 */
function visibleBounds(win: BaseWindow): Rect | null {
  try {
    if (!win.isVisible() || win.isMinimized()) return null
    return win.getBounds()
  } catch {
    return null
  }
}
