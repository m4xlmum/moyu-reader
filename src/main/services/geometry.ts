/**
 * 版面与坐标计算。
 *
 * 全应用所有与坐标相关的判断都必须经由本模块，不得在别处重复计算。
 * 理由见 docs/spike-findings.md：混合 DPI 下坐标不一致是最难查的一类缺陷，
 * 集中一处才可能被测试覆盖。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { Rect } from '@shared/types'

export interface Layout {
  width: number
  height: number
  topBar: Rect
  address: Rect
  body: Rect
  rail: Rect
}

/**
 * 依据窗口客户区尺寸推导各区域。
 *
 * 版面是一个「顶栏 + 右侧栏」的 L 形：顶栏横跨整个宽度（窗口按钮在最右端，
 * 与 Windows 的习惯一致），右侧栏从顶栏下沿一直垂到窗口底部。
 * 地址栏夹在顶栏与正文之间，折叠时传 addressH = 0，正文直接顶上去。
 */
export function computeLayout(
  width: number,
  height: number,
  topH: number,
  addressH: number,
  railW: number
): Layout {
  const mainWidth = Math.max(0, width - railW)
  const bodyTop = topH + addressH
  return {
    width,
    height,
    topBar: { x: 0, y: 0, width, height: topH },
    address: { x: 0, y: topH, width: mainWidth, height: addressH },
    body: { x: 0, y: bodyTop, width: mainWidth, height: Math.max(0, height - bodyTop) },
    rail: { x: mainWidth, y: topH, width: railW, height: Math.max(0, height - topH) }
  }
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height
}
