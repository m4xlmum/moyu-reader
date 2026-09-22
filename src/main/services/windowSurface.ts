/**
 * 窗口表面状态的唯一入口。
 *
 * 全应用只有这里可以调用 setOpacity / setShape / setIgnoreMouseEvents /
 * setSkipTaskbar / setFocusable / setHasShadow / setContentProtection。
 * 把这些调用收敛到一处，是为了让 transparent:true 与 setOpacity 这两条
 * Windows 合成路径不会从不同地方被反复折腾（详见 docs/spike-findings.md）。
 *
 * 调用顺序有讲究，见下面 apply() 内的注释，不要随意重排。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { BaseWindow } from 'electron'
import { OPACITY_MAX, OPACITY_MIN } from '@shared/constants'
import type { AppConfig, WindowMode, ZoneState } from '@shared/types'
import { interactiveRects, type Layout } from './geometry'
import { HitTester } from './mousePassthrough'
import { log } from './logger'

export interface SurfaceInput {
  mode: WindowMode
  zones: ZoneState
  opacity: number
  layout: Layout
}

/** 两种状态下窗口都不该出现在任务栏 */
function shouldSkipTaskbar(mode: WindowMode, showInTaskbar: boolean): boolean {
  if (mode === 'trayHidden' || mode === 'minimized') return true
  return !showInTaskbar
}

export class WindowSurface {
  private last: SurfaceInput | null = null

  constructor(
    private readonly win: BaseWindow,
    private readonly hitTester: HitTester,
    private readonly getConfig: () => AppConfig
  ) {}

  /** 依据目标状态设置全部窗口级属性。不做 show/hide/minimize 这类动作。 */
  apply(input: SurfaceInput): void {
    this.last = input
    const cfg = this.getConfig()
    const { mode, zones, opacity, layout } = input
    const useWindowOpacity = cfg.stealth.fadeStrategy === 'windowOpacity'

    // 1) 阴影。透视状态下阴影会勾出窗口矩形轮廓，直接暴露窗口存在。
    this.call(() => this.win.setHasShadow(false))

    // 2) 置顶。'screen-saver' 级别会盖住全屏应用，反而显眼，故固定用 floating。
    this.call(() => this.win.setAlwaysOnTop(cfg.window.alwaysOnTop, 'floating'))

    // 3) 从屏幕捕获中排除窗口（防共享屏幕时被抓到）。
    this.call(() => this.win.setContentProtection(cfg.stealth.contentProtection))

    // 最小化状态下，Windows 会让部分属性失效，此时不再改动其余项，
    // 恢复时由 reassert() 统一重放。
    if (mode === 'minimized') return

    // 4) focusable 必须在 skipTaskbar 之前。
    //    Windows 上 setFocusable(false) 会隐式把 skipTaskbar 置为 true，
    //    先设 skipTaskbar 会被它覆盖掉。
    this.call(() => this.win.setFocusable(true))
    this.call(() => this.win.setSkipTaskbar(shouldSkipTaskbar(mode, cfg.window.showInTaskbar)))

    // 5) 透明度。
    //    走 windowOpacity 时，无极透明度直接由 setOpacity 承担——
    //    spike 已实测它与 transparent:true 正常混合，因而不需要向网页注入 CSS。
    //    走 css 时窗口透明度恒为 1，由渲染进程与 pageStyler 负责表现。
    if (useWindowOpacity) {
      const value = mode === 'trayHidden' ? 0 : clampOpacity(opacity)
      this.call(() => this.win.setOpacity(value))
    } else {
      this.call(() => this.win.setOpacity(1))
    }

    // 6) 命中区域。
    if (mode === 'trayHidden') {
      // 窗口即将 hide()，这里只是防住 hide 落地前那一瞬的点击被吞。
      this.call(() => this.win.setIgnoreMouseEvents(true, { forward: true }))
    } else {
      const rects = interactiveRects(layout, zones)
      this.hitTester.applyRects(rects)
      // shape 策略下 hitTester 不管穿透开关，需显式关掉（可能被 trayHidden 打开过）
      if (this.hitTester.getStrategy() === 'shape') {
        this.call(() => this.win.setIgnoreMouseEvents(false, { forward: false }))
      }
    }
  }

  /**
   * 重放上一次的表面状态。
   *
   * Windows 会在最小化恢复、跨显示器拖动、DPI 变化之后静默丢弃
   * layered / region 属性。每次 restore / show / 显示器变化后都要调用本方法，
   * 这是唯一的修复点。
   */
  reassert(): void {
    if (!this.last) return
    log.info(`重放窗口表面状态（mode=${this.last.mode}）`)
    this.apply(this.last)
  }

  /** 供轮询驱动降级路径下的穿透开关 */
  updateCursor(localX: number, localY: number): void {
    this.hitTester.updateCursor(localX, localY)
  }

  getHitTestStrategy(): 'shape' | 'ignoreMouse' {
    return this.hitTester.getStrategy()
  }

  private call(fn: () => void): void {
    try {
      fn()
    } catch (err) {
      log.warn('窗口表面操作失败', err)
    }
  }
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return OPACITY_MAX
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, value))
}
