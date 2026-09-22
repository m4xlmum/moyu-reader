/**
 * 版面与坐标计算。
 *
 * 全应用所有与坐标相关的判断都必须经由本模块，不得在别处重复计算。
 * 理由见 docs/spike-findings.md：混合 DPI 下坐标不一致是最难查的一类缺陷，
 * 集中一处才可能被测试覆盖。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BALL_MARGIN, BALL_SIZE } from '@shared/constants'
import type { BallCorner, Rect } from '@shared/types'

export interface Layout {
  width: number
  height: number
  topBar: Rect
  body: Rect
  bottomBar: Rect
}

/** 依据窗口客户区尺寸推导两条工具栏的位置 */
export function computeLayout(
  width: number,
  height: number,
  topH: number,
  bottomH: number
): Layout {
  const bodyTop = topH
  const bodyHeight = Math.max(0, height - topH - bottomH)
  return {
    width,
    height,
    topBar: { x: 0, y: 0, width, height: topH },
    body: { x: 0, y: bodyTop, width, height: bodyHeight },
    bottomBar: { x: 0, y: height - bottomH, width, height: bottomH }
  }
}

/**
 * 悬浮球停靠在窗口某角时，它在**屏幕**上的矩形。
 *
 * 球是窗口内部的元素，不是屏幕角落的挂件。因此收起只是把窗口缩到
 * 这个矩形上——球在屏幕上的位置一个像素都不动，用户眼看它留在原处缩小。
 *
 * 渲染进程用同一套边距（BALL_MARGIN）把球画在窗口的同一个角上，
 * 两边的结果必须一致，收起的瞬间才看不出跳动。
 */
export function ballDockRect(
  corner: BallCorner,
  windowBounds: Rect,
  size = BALL_SIZE,
  margin = BALL_MARGIN
): Rect {
  const left = windowBounds.x + margin
  const top = windowBounds.y + margin
  const right = windowBounds.x + windowBounds.width - size - margin
  const bottom = windowBounds.y + windowBounds.height - size - margin

  switch (corner) {
    case 'top-left':
      return { x: left, y: top, width: size, height: size }
    case 'top-right':
      return { x: right, y: top, width: size, height: size }
    case 'bottom-left':
      return { x: left, y: bottom, width: size, height: size }
    case 'bottom-right':
    default:
      return { x: right, y: bottom, width: size, height: size }
  }
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height
}
