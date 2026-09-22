/**
 * 窗口表面状态的唯一入口。
 *
 * 全应用只有这里可以调用 setOpacity / setSkipTaskbar / setFocusable /
 * setHasShadow / setContentProtection / setBounds。
 * 把这些调用收敛到一处，是为了让 transparent:true 与 setOpacity 这两条
 * Windows 合成路径不会从不同地方被反复折腾（详见 docs/spike-findings.md）。
 *
 * 收起成球之后，屏幕上不再存在「看不见却仍占着一大块」的区域，
 * 因此原先基于 setShape 的命中区域裁剪已整体移除——点击穿透不再是
 * 靠裁剪实现的技巧，而是「窗口真的变小了」这个事实。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { BaseWindow } from 'electron'
import { OPACITY_MAX, OPACITY_MIN } from '@shared/constants'
import type { AppConfig, Rect, WindowMode } from '@shared/types'
import { log } from './logger'

export interface SurfaceInput {
  mode: WindowMode
  /** 展开态与收起态各自的窗口矩形 */
  windowRect: Rect
  /** 用户设定的界面透明度（仅展开态直接生效，收起态由球的 CSS 承担） */
  opacity: number
}

/** 藏起来或缩成球时，窗口都不该出现在任务栏 */
function shouldSkipTaskbar(mode: WindowMode, showInTaskbar: boolean): boolean {
  if (mode === 'trayHidden' || mode === 'minimized' || mode === 'collapsed') return true
  return !showInTaskbar
}

/**
 * 收起态的窗口透明度恒为 1。
 *
 * 悬浮球自己的「半透明」由 CSS 的 alpha 承担，而不是把整个窗口调淡——
 * 否则用户把界面设在 30% 时，球也会淡到几乎找不到，
 * 而球是收起之后唯一能把他带回来的东西。
 */
export function effectiveOpacity(mode: WindowMode, configured: number): number {
  if (mode === 'trayHidden') return 0
  if (mode === 'collapsed') return 1
  return clampOpacity(configured)
}

export class WindowSurface {
  private last: SurfaceInput | null = null

  constructor(
    private readonly win: BaseWindow,
    private readonly getConfig: () => AppConfig
  ) {}

  /** 依据目标状态设置全部窗口级属性 */
  apply(input: SurfaceInput): void {
    const previous = this.last
    this.last = input

    const cfg = this.getConfig()
    const { mode, windowRect, opacity } = input

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

    // 5) 尺寸。收起与展开就是同一扇窗的两套矩形，切换即整个界面消失或出现。
    if (!sameRect(previous?.windowRect ?? null, windowRect)) {
      this.call(() =>
        this.win.setBounds({
          x: windowRect.x,
          y: windowRect.y,
          width: windowRect.width,
          height: windowRect.height
        })
      )
    }

    // 6) 透明度。
    this.call(() => this.win.setOpacity(effectiveOpacity(mode, opacity)))
  }

  /**
   * 重放上一次的表面状态。
   *
   * Windows 会在最小化恢复、跨显示器拖动、DPI 变化之后静默丢弃
   * layered 属性。每次 restore / show / 显示器变化后都要调用本方法。
   */
  reassert(): void {
    if (!this.last) return
    log.info(`重放窗口表面状态（mode=${this.last.mode}）`)
    this.apply(this.last)
  }

  getLast(): SurfaceInput | null {
    return this.last
  }

  private call(fn: () => void): void {
    try {
      fn()
    } catch (err) {
      log.warn('窗口表面操作失败', err)
    }
  }
}

function sameRect(a: Rect | null, b: Rect): boolean {
  if (!a) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return OPACITY_MAX
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, value))
}
