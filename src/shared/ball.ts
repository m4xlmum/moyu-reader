/**
 * 悬浮球的几何。
 *
 * 主进程与渲染进程共用这一份：主进程用它算「收起时窗口缩到哪」，
 * 渲染进程用它算「球画在哪」。两边必须一致，收起的瞬间才不会跳。
 *
 * 关键约束：球必须**完全落在工具栏之内**。
 * 正文区被标签页视图覆盖（那一层在 chrome 之上），球只要伸进正文，
 * 超出部分就会被盖住——既显示成半个月牙，那一块也点不到。
 * 因此尺寸上限由所在工具栏的高度决定，位置也在栏内居中。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BALL_MARGIN, BOTTOM_BAR_H, TOP_BAR_H } from './constants'
import type { BallCorner, Rect } from './types'

/** 球所在的那条工具栏的高度 */
export function barHeightFor(corner: BallCorner): number {
  return corner.startsWith('bottom') ? BOTTOM_BAR_H : TOP_BAR_H
}

/**
 * 实际生效的球直径。
 *
 * 用户设得再大也会被裁到工具栏高度内——超出就会被正文区的视图盖住。
 * 下限 24 是为了保证小尺寸下仍然点得中。
 */
export function effectiveBallSize(configured: number, corner: BallCorner): number {
  const bar = barHeightFor(corner)
  return Math.max(24, Math.min(configured, bar - 4))
}

/** 球相对窗口左上角的偏移 */
export function ballOffsetInWindow(
  corner: BallCorner,
  windowWidth: number,
  windowHeight: number,
  size: number
): { x: number; y: number } {
  const bar = barHeightFor(corner)
  const x = corner.endsWith('right') ? windowWidth - size - BALL_MARGIN : BALL_MARGIN
  // 在所属工具栏内垂直居中，这样无论栏多高都不会越界
  const y = corner.startsWith('bottom')
    ? windowHeight - bar + Math.round((bar - size) / 2)
    : Math.round((bar - size) / 2)
  return { x, y }
}

/** 球在屏幕上的矩形 */
export function ballDockRect(corner: BallCorner, windowBounds: Rect, size: number): Rect {
  const off = ballOffsetInWindow(corner, windowBounds.width, windowBounds.height, size)
  return {
    x: windowBounds.x + off.x,
    y: windowBounds.y + off.y,
    width: size,
    height: size
  }
}
