/**
 * 光标离开后收起成球的轮询器。
 *
 * 为什么不用 DOM 的 mouseleave：窗口收起后 DOM 事件不再触发，
 * 而且收起之后也不该再有任何自动行为——展开只由用户点击悬浮球决定。
 *
 * 因此这里只有一个方向的动作：光标离开够久 → 通知收起。
 * 展开永远不由本模块发起，避免球在光标掠过时自己弹开。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { screen } from 'electron'
import { POLL_MS } from '@shared/constants'
import type { AppConfig, Rect, WindowMode } from '@shared/types'
import { pointInRect } from './geometry'
import { WindowRegistry } from './windowRegistry'
import { log } from './logger'

export interface WatcherDeps {
  getWindowId: () => number | null
  getBounds: () => Rect | null
  getMode: () => WindowMode
  getConfig: () => AppConfig
  registry: WindowRegistry
  /** 光标已离开足够久，应当收起 */
  onCollapse: () => void
}

export class WindowLeaveWatcher {
  private timer: NodeJS.Timeout | null = null
  private outsideSince: number | null = null
  private suspended = 0
  /**
   * 是否已「武装」。
   *
   * 首次运行时光标多半不在窗口上，若一上来就按「光标在外」处理，
   * 用户刚打开应用就会看到界面在几百毫秒后整个消失，像是坏了。
   * 因此先要求光标进过窗口一次，收起行为才生效。
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

  /** 挂起自动收起（弹出面板打开、设置窗口聚焦等） */
  suspend(): void {
    this.suspended++
    this.outsideSince = null
  }

  resume(): void {
    this.suspended = Math.max(0, this.suspended - 1)
    this.outsideSince = null
  }

  /** 展开之后调用：重新开始计时，避免刚展开就立刻又收起 */
  rearm(): void {
    this.outsideSince = null
  }

  private tick(): void {
    const cfg = this.deps.getConfig()
    const mode = this.deps.getMode()
    const bounds = this.deps.getBounds()
    const winId = this.deps.getWindowId()

    // 只在展开态下工作：收起态不该再有任何自动行为
    if (mode !== 'expanded') {
      this.outsideSince = null
      return
    }
    if (!bounds || winId === null) return

    if (!cfg.stealth.autoCollapse) {
      this.outsideSince = null
      return
    }

    if (this.suspended > 0 || this.deps.registry.hasAutoHideBlocker(winId)) {
      this.outsideSince = null
      return
    }

    const cursor = screen.getCursorScreenPoint()
    // 窗口是 16:9 的矩形，落在窗口内即「用户还在用」
    const insideSelf = pointInRect(cursor.x, cursor.y, bounds)
    const insideOther = this.deps.registry.cursorInAnyWindow(cursor.x, cursor.y, winId)

    if (insideSelf || insideOther) {
      this.outsideSince = null
      this.armed = true
      return
    }

    if (!this.armed) return

    if (this.outsideSince === null) {
      this.outsideSince = Date.now()
      return
    }
    if (Date.now() - this.outsideSince < cfg.stealth.hideDelayMs) return

    this.outsideSince = null
    log.info('光标离开窗口，收起成球')
    this.deps.onCollapse()
  }
}
