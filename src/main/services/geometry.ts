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
 * 悬浮球在指定屏幕角落的位置。
 *
 * 用工作区（workArea）而不是整块屏幕：贴着任务栏的球会被任务栏盖住一半。
 */
export function ballBoundsFor(corner: BallCorner, workArea: Rect, size = BALL_SIZE): Rect {
  const left = workArea.x + BALL_MARGIN
  const top = workArea.y + BALL_MARGIN
  const right = workArea.x + workArea.width - size - BALL_MARGIN
  const bottom = workArea.y + workArea.height - size - BALL_MARGIN

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
