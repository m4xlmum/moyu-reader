/**
 * 鼠标移出隐藏的轮询器。
 *
 * 为什么不用 DOM 的 mouseleave：窗口隐藏后 DOM 事件不再触发，
 * 也就无法知道光标何时回来；快速移出时事件本身也不可靠。
 * 因此只能在主进程按固定间隔采样光标位置。
 *
 * 本模块只判断「光标是否还在本应用内」这一个信号，
 * 具体哪些区域该藏该显由 WindowController 依配置决定。
 * 这样三个区域（顶部栏 / 主体 / 底部栏）的显隐共用同一套判定，
 * 悬停条带显形也就能自然生效——条带在可交互区域内，
 * 光标移上去即被判定为「进入」，于是恢复显示。
 *
 * 迟滞设计：隐藏慢（要求连续离开达 hideDelayMs），显形快（一次采样即可）。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { screen } from 'electron'
import { POLL_MS } from '@shared/constants'
import type { AppConfig, Rect, WindowMode, ZoneState } from '@shared/types'
import { interactiveRects, type Layout } from './geometry'
import { WindowRegistry } from './windowRegistry'
import { WindowSurface } from './windowSurface'

export interface WatcherDeps {
  getWindowId: () => number | null
  getBounds: () => Rect | null
  getLayout: () => Layout | null
  getZones: () => ZoneState
  getMode: () => WindowMode
  getConfig: () => AppConfig
  surface: WindowSurface
  registry: WindowRegistry
  /** 光标回到本应用内 */
  onInside: () => void
  /** 光标离开本应用并已超过延迟 */
  onOutside: () => void
}

export class WindowLeaveWatcher {
  private timer: NodeJS.Timeout | null = null
  private outsideSince: number | null = null
  private epoch = 0
  private suspended = 0
  /** 上一次报告的状态，避免每 50ms 重复触发同一侧回调 */
  private lastInside: boolean | null = null
  /**
   * 是否已「武装」。
   *
   * 首次运行时光标多半不在窗口上，若一上来就按「光标在外」处理，
   * 用户刚打开应用就会看到正文在几百毫秒后凭空消失，像是坏了。
   * 因此先要求光标进过窗口一次，之后隐藏行为才生效。
   */
  private armed = false

  constructor(private readonly deps: WatcherDeps) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /** 挂起自动隐藏（弹出面板打开、设置窗口聚焦等） */
  suspend(): void {
    this.suspended++
    this.bumpEpoch()
  }

  resume(): void {
    this.suspended = Math.max(0, this.suspended - 1)
    this.bumpEpoch()
  }

  /** 状态变化时调用，使在途判定作废 */
  bumpEpoch(): void {
    this.epoch++
    this.outsideSince = null
  }

  private tick(): void {
    const cfg = this.deps.getConfig()
    const mode = this.deps.getMode()
    const bounds = this.deps.getBounds()
    const layout = this.deps.getLayout()
    const winId = this.deps.getWindowId()

    if (mode !== 'normal' && mode !== 'bodyHidden') return
    if (!bounds || !layout || winId === null) return

    const stealth = cfg.stealth
    const anyAutoHide = stealth.autoHideTop || stealth.autoHideBody || stealth.autoHideBottom

    const cursor = screen.getCursorScreenPoint()
    const localX = cursor.x - bounds.x
    const localY = cursor.y - bounds.y

    // 降级命中策略下由这里驱动穿透开关
    this.deps.surface.updateCursor(localX, localY)

    // 功能全关时确保一切可见，否则用户会以为窗口坏了
    if (!anyAutoHide) {
      this.report(true)
      return
    }

    if (this.suspended > 0 || this.deps.registry.hasAutoHideBlocker(winId)) {
      this.report(true)
      return
    }

    const rects = interactiveRects(layout, this.deps.getZones())
    const insideSelf = rects.some((r) => inRect(localX, localY, r))
    const insideOther = this.deps.registry.cursorInAnyWindow(cursor.x, cursor.y, winId)

    if (insideSelf || insideOther) {
      this.outsideSince = null
      // 光标进过窗口，隐藏行为自此生效
      this.armed = true
      this.report(true)
      return
    }

    // 光标在窗口之外
    if (!this.armed) return

    const epochAtEntry = this.epoch
    if (this.outsideSince === null) {
      this.outsideSince = Date.now()
      return
    }
    if (Date.now() - this.outsideSince < stealth.hideDelayMs) return
    // 等待期间状态可能已变化
    if (epochAtEntry !== this.epoch) return

    this.outsideSince = null
    this.report(false)
  }

  /** 仅在状态翻转时回调，避免每 50ms 重复触发 */
  private report(inside: boolean): void {
    if (this.lastInside === inside) return
    this.lastInside = inside
    if (inside) this.deps.onInside()
    else this.deps.onOutside()
  }
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
}
