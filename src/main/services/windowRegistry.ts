/**
 * 应用内所有可见窗口的登记处。
 *
 * 自动隐藏的判定不能只看摸鱼窗口自己：弹出面板或设置窗口打开时，
 * 光标离开摸鱼窗口是正常的，此时不该把主体藏起来。
 * 把所有窗口收在这里，「光标是否还在本应用内」就成了一条统一规则。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { BaseWindow } from 'electron'
import type { Rect } from '@shared/types'
import { pointInAnyRect, pointInRect } from './geometry'

interface Entry {
  win: BaseWindow
  /** 返回该窗口当前的可交互矩形（屏幕坐标）；null 表示整窗可交互 */
  interactiveScreenRects: () => Rect[] | null
  /** 为 true 时，只要该窗口可见就挂起摸鱼窗口的自动隐藏 */
  blocksAutoHide: boolean
}

export class WindowRegistry {
  private entries = new Map<number, Entry>()

  add(win: BaseWindow, opts: { interactiveScreenRects: () => Rect[] | null; blocksAutoHide: boolean }): void {
    this.entries.set(win.id, { win, ...opts })
  }

  remove(id: number): void {
    this.entries.delete(id)
  }

  /**
   * 光标（屏幕坐标）是否落在任一可见应用窗口的可交互区域内。
   * excludeId 用于排除摸鱼窗口自身，因为它的判定另有分区逻辑。
   */
  cursorInAnyWindow(x: number, y: number, excludeId: number): boolean {
    for (const [id, entry] of this.entries) {
      if (id === excludeId) continue
      if (!isReallyVisible(entry.win)) continue
      const bounds = entry.win.getBounds()
      if (!pointInRect(x, y, bounds)) continue
      const rects = entry.interactiveScreenRects()
      if (rects === null) return true
      if (pointInAnyRect(x, y, rects)) return true
    }
    return false
  }

  /** 是否存在要求挂起自动隐藏的可见窗口（如设置窗口、弹出面板） */
  hasAutoHideBlocker(excludeId: number): boolean {
    for (const [id, entry] of this.entries) {
      if (id === excludeId) continue
      if (!entry.blocksAutoHide) continue
      if (isReallyVisible(entry.win)) return true
    }
    return false
  }

  clear(): void {
    this.entries.clear()
  }
}

function isReallyVisible(win: BaseWindow): boolean {
  try {
    return win.isVisible() && !win.isMinimized()
  } catch {
    return false
  }
}
