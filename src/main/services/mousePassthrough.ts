/**
 * 命中区域策略：谁来决定「窗口的哪一部分接收鼠标」。
 *
 * 两种实现：
 *  - shape       win.setShape()。区域外既不绘制也不接收鼠标事件，事件落到窗口背后。
 *                没有轮询竞态，显形条带天然可悬停、可拖拽。首选。
 *  - ignoreMouse setIgnoreMouseEvents()。会让整个窗口穿透，因此必须靠轮询
 *                按光标位置反复切换；落在切换间隙的点击会被静默丢弃。降级方案。
 *
 * docs/spike-findings.md 的 Q4 实测 setShape 可与 transparent:true 完美共存。
 * 但它是 Experimental API，因此保留降级路径并在运行期探测。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { BaseWindow } from 'electron'
import type { Rect } from '@shared/types'
import { pointInAnyRect } from './geometry'
import { log } from './logger'

export type HitTestStrategy = 'shape' | 'ignoreMouse'

export class HitTester {
  private strategy: HitTestStrategy
  private rects: Rect[] = []
  private ignoring = false

  constructor(
    private readonly win: BaseWindow,
    preference: 'auto' | 'shape' | 'ignoreMouse'
  ) {
    this.strategy = this.resolve(preference)
    log.info(`命中区域策略：${this.strategy}`)
  }

  private resolve(preference: 'auto' | 'shape' | 'ignoreMouse'): HitTestStrategy {
    if (preference !== 'auto') return preference
    try {
      this.win.setShape([])
      return 'shape'
    } catch (err) {
      log.warn('setShape 不可用，回退到 ignoreMouse 策略', err)
      return 'ignoreMouse'
    }
  }

  getStrategy(): HitTestStrategy {
    return this.strategy
  }

  getRects(): Rect[] {
    return this.rects
  }

  /** 区域是否覆盖整个窗口 */
  private isFullWindow(rects: Rect[]): boolean {
    if (rects.length !== 1) return false
    const r = rects[0]
    if (r.x !== 0 || r.y !== 0) return false
    const b = this.win.getBounds()
    return r.width === b.width && r.height === b.height
  }

  /**
   * 应用可交互区域。调用方传入的区域永不为空——
   * 全部显示时是「整个窗口矩形」这一条，而不是空数组。
   */
  applyRects(rects: Rect[]): void {
    this.rects = rects

    if (this.strategy === 'shape') {
      try {
        // 覆盖整窗时清空形状，避免多余的窗口区域计算
        this.win.setShape(this.isFullWindow(rects) ? [] : rects)
        return
      } catch (err) {
        log.error('setShape 调用失败，降级到 ignoreMouse 策略', err)
        this.strategy = 'ignoreMouse'
      }
    }

    // 降级路径：形状保持整矩形，靠轮询开关穿透。
    // 默认先穿透——「点击被吞掉」远比「条带晚 50ms 响应」严重。
    this.setIgnore(!this.isFullWindow(rects))
  }

  /**
   * 由 windowLeaveWatcher 的轮询驱动，传入光标相对窗口客户区的坐标。
   * 仅在降级路径下有意义。
   */
  updateCursor(localX: number, localY: number): void {
    if (this.strategy !== 'ignoreMouse') return
    const inside = pointInAnyRect(localX, localY, this.rects)
    this.setIgnore(!inside)
  }

  private setIgnore(ignore: boolean): void {
    if (ignore === this.ignoring) return
    this.ignoring = ignore
    try {
      this.win.setIgnoreMouseEvents(ignore, { forward: true })
    } catch (err) {
      log.warn('setIgnoreMouseEvents 失败', err)
    }
  }

  /** 回到「整窗可交互」，用于恢复到 normal 状态 */
  reset(): void {
    const b = this.win.getBounds()
    this.applyRects([{ x: 0, y: 0, width: b.width, height: b.height }])
    this.setIgnore(false)
  }
}
