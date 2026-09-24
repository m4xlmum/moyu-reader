/**
 * 版面与坐标计算。
 *
 * 全应用所有与坐标相关的判断都必须经由本模块，不得在别处重复计算。
 * 理由见 docs/spike-findings.md：混合 DPI 下坐标不一致是最难查的一类缺陷，
 * 集中一处才可能被测试覆盖。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ASPECT_RATIO } from '@shared/constants'
import type { Rect, ResizeEdge } from '@shared/types'

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

// ---------------------------------------------------------------- 边缘缩放

export interface ResizeLimits {
  min: { width: number; height: number }
  max: { width: number; height: number }
}

const W_EDGES: ReadonlyArray<ResizeEdge> = ['w', 'nw', 'sw']

/**
 * 拖动边缘改窗口大小，**结果恒为 ASPECT_RATIO（16:9）**。
 *
 * 这是本仓库唯一一处算缩放的地方，与 computeLayout 一样属于纯函数，
 * 于是它的全部不变量都能被 spike 直接断言（见 spike/resize.js）：
 *
 *   - 只有一个自由度。被拖的那一轴给出边长，另一轴由比例反推，
 *     因此不存在「拖成 20:1 的一条」这种状态。
 *   - **被拖边对面那条边钉住不动**：拖右边时左边缘不动，拖上边时下边缘不动。
 *     这是缩放手感对不对的全部所在——若改成「左上角钉死」，拖上边时窗口会
 *     整体往下长，看起来像在移动窗口。
 *   - 同时拖两个方向（四个角）时取**相对变化更大**的那一轴做主驱动轴。
 *     斜着拖一个 16:9 的窗口时，两轴给出的边长本来就不会一致；
 *     取相对变化大的那一个，手感才是「往哪边拖得多就听谁的」。
 *
 * dx / dy 是光标**相对按下那一刻**的位移，不是增量——与拖窗口一样按锚点绝对算，
 * 平台卡住过某一帧也不会把误差攒起来。
 */
export function resizeRect(
  start: Rect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  limits: ResizeLimits
): Rect {
  const hasX = edge.includes('e') || edge.includes('w')
  const hasY = edge.includes('n') || edge.includes('s')
  if (!hasX && !hasY) return start

  /*
   * 一律换算成「宽度」再夹紧：宽高由比例绑死，两个方向本就是一个自由度，
   * 分头各夹一次反而会夹出两个互相矛盾的结果（比如宽度还在范围内、
   * 由它反推出来的高度却超了上限）。因此夹紧只在宽度这一条数轴上做，
   * 上下限也一并换算过去。
   */
  let candidate: number
  if (hasX && hasY) {
    const relX = Math.abs(dx) / Math.max(1, start.width)
    const relY = Math.abs(dy) / Math.max(1, start.height)
    candidate = relX >= relY ? widthFrom(start, edge, dx) : heightFrom(start, edge, dy) * ASPECT_RATIO
  } else if (hasX) {
    candidate = widthFrom(start, edge, dx)
  } else {
    candidate = heightFrom(start, edge, dy) * ASPECT_RATIO
  }

  const lo = Math.max(limits.min.width, Math.ceil(limits.min.height * ASPECT_RATIO))
  const hi = Math.min(limits.max.width, Math.floor(limits.max.height * ASPECT_RATIO))
  // lo > hi 说明上下限本身互相矛盾（比如显示器比最小尺寸还小），此时听下限的：
  // 窗口大到超出屏幕还能拖回来，小到装不下版面就再也回不去了。
  const width = lo > hi ? lo : Math.min(hi, Math.max(lo, Math.round(candidate)))
  const height = Math.round(width / ASPECT_RATIO)

  return {
    x: W_EDGES.includes(edge) ? start.x + start.width - width : start.x,
    y: edge.startsWith('n') ? start.y + start.height - height : start.y,
    width,
    height
  }
}

/** 拖左右两条边时窗口应有的宽度 */
function widthFrom(start: Rect, edge: ResizeEdge, dx: number): number {
  return start.width + (edge.includes('e') ? dx : -dx)
}

/** 拖上下两条边时窗口应有的高度 */
function heightFrom(start: Rect, edge: ResizeEdge, dy: number): number {
  return start.height + (edge.includes('s') ? dy : -dy)
}
