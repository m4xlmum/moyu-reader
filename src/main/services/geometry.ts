/**
 * 版面矩形计算。
 *
 * 全应用所有与坐标相关的判断都必须经由本模块，不得在别处重复计算。
 * 理由见 docs/spike-findings.md：混合 DPI 下「主体在光标仍在窗口内时误隐藏」
 * 是最可能的缺陷来源，集中一处才可能被测试覆盖。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BOTTOM_BAR_H, TOP_BAR_H } from '@shared/constants'
import type { Rect, ZoneState } from '@shared/types'

export interface Layout {
  width: number
  height: number
  topBar: Rect
  body: Rect
  bottomBar: Rect
  topStrip: Rect
  bottomStrip: Rect
}

/** 依据窗口客户区尺寸推导各区域矩形 */
export function computeLayout(width: number, height: number, stripH: number): Layout {
  const strip = Math.max(1, Math.min(stripH, TOP_BAR_H, BOTTOM_BAR_H))
  const bodyTop = TOP_BAR_H
  const bodyHeight = Math.max(0, height - TOP_BAR_H - BOTTOM_BAR_H)
  return {
    width,
    height,
    topBar: { x: 0, y: 0, width, height: TOP_BAR_H },
    body: { x: 0, y: bodyTop, width, height: bodyHeight },
    bottomBar: { x: 0, y: height - BOTTOM_BAR_H, width, height: BOTTOM_BAR_H },
    topStrip: { x: 0, y: 0, width, height: strip },
    bottomStrip: { x: 0, y: height - strip, width, height: strip }
  }
}

/**
 * 当前可交互区域的并集。
 *
 * 三个区域全部显示时返回整个窗口矩形，而不是 null。
 * 早先的写法返回 null 表示「整窗」，但那样「光标是否落在区域内」就被算成了恒真，
 * 导致光标移出窗口后永远判定为「还在窗内」，自动隐藏彻底失效。
 * 返回真实矩形，这个判定才对形状裁剪与光标位置两种情况都成立。
 *
 * 隐藏的区域仍保留其版面空间（网页不会重排），但不绘制、不接收鼠标事件。
 * 每个隐藏区域留下一条窄条带保持可交互，否则窗口既藏起来又拖不动、也叫不出来。
 */
export function interactiveRects(layout: Layout, zones: ZoneState): Rect[] {
  if (zones.top === 'shown' && zones.body === 'shown' && zones.bottom === 'shown') {
    return [{ x: 0, y: 0, width: layout.width, height: layout.height }]
  }
  const rects: Rect[] = []
  rects.push(zones.top === 'shown' ? layout.topBar : layout.topStrip)
  if (zones.body === 'shown') rects.push(layout.body)
  rects.push(zones.bottom === 'shown' ? layout.bottomBar : layout.bottomStrip)
  return rects
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height
}

export function pointInAnyRect(px: number, py: number, rects: Rect[]): boolean {
  for (const r of rects) if (pointInRect(px, py, r)) return true
  return false
}

/** 把窗口相对坐标的点换算为屏幕坐标 */
export function toScreen(winX: number, winY: number, localX: number, localY: number): { x: number; y: number } {
  return { x: winX + localX, y: winY + localY }
}

/** 把屏幕坐标的点换算为窗口相对坐标 */
export function toLocal(winX: number, winY: number, screenX: number, screenY: number): { x: number; y: number } {
  return { x: screenX - winX, y: screenY - winY }
}
