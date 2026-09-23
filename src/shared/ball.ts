/**
 * 悬浮球的几何。
 *
 * 主进程与渲染进程共用这一份：主进程用它算「收起时窗口缩到哪」，
 * 渲染进程用它算「球画在哪」。两边必须一致，收起的瞬间才不会跳。
 *
 * 关键约束：球必须**完全落在 chrome 画得到的地方**。
 * 正文区被标签页视图覆盖（那一层在 chrome 之上），球只要伸进正文，
 * 超出部分就会被盖住——既显示成半个月牙，那一块也点不到。
 * 因此尺寸上限由所在栏的短边决定，位置也在栏内居中。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BALL_MARGIN, RAIL_W, TOP_BAR_H } from './constants'
import type { BallCorner, Rect } from './types'

/**
 * 球所在那条栏的短边。
 *
 * 顶栏是横条，短边是高度；右侧栏是竖条，短边是宽度。
 * 球无论停在哪，都得塞进这个尺寸里。
 */
function stripAcross(corner: BallCorner): number {
  return corner === 'top-left' || corner === 'top-right' ? TOP_BAR_H : RAIL_W
}

/** 在一段长度里居中 */
function centerIn(strip: number, size: number): number {
  return Math.round((strip - size) / 2)
}

/**
 * 实际生效的球直径。
 *
 * 用户设得再大也会被裁到所在栏的短边之内——超出就会被正文区的视图盖住。
 * 下限 24 是为了保证小尺寸下仍然点得中。
 */
export function effectiveBallSize(configured: number, corner: BallCorner): number {
  return Math.max(24, Math.min(configured, stripAcross(corner) - 4))
}

/**
 * 球相对窗口左上角的偏移。
 *
 * 右侧的两个停靠位都按右侧栏那一列居中，因此顶栏右端的球正好落在栏的正上方，
 * 而不是与栏差开几个像素。左上仍是窗口左边缘的一个留白。
 */
export function ballOffsetInWindow(
  corner: BallCorner,
  windowWidth: number,
  windowHeight: number,
  size: number
): { x: number; y: number } {
  if (corner === 'top-left') {
    return { x: BALL_MARGIN, y: centerIn(TOP_BAR_H, size) }
  }

  const x = windowWidth - RAIL_W + centerIn(RAIL_W, size)
  const y = corner === 'top-right' ? centerIn(TOP_BAR_H, size) : windowHeight - size - BALL_MARGIN
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
