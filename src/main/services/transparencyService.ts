/**
 * 透明度动画。
 *
 * spike 实测 setOpacity 与 transparent:true 可以正常混合（见 docs/spike-findings.md），
 * 因此无极透明度与淡入淡出都直接走 setOpacity，不需要向网页注入 CSS。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { FADE_MS, FADE_TICK_MS } from '@shared/constants'

/** 缓出三次曲线，起手快、收尾稳，观感比线性自然 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export class OpacityAnimator {
  private timer: NodeJS.Timeout | null = null
  private value: number

  constructor(
    initial: number,
    private readonly onTick: (value: number) => void,
    private readonly durationMs: number = FADE_MS
  ) {
    this.value = initial
  }

  get current(): number {
    return this.value
  }

  /** 立即设置，不做动画 */
  set(value: number): void {
    this.cancel()
    this.value = value
    this.onTick(value)
  }

  /** 平滑过渡到目标值 */
  fadeTo(target: number, durationMs = this.durationMs): Promise<void> {
    this.cancel()

    if (durationMs <= 0 || Math.abs(target - this.value) < 0.001) {
      return Promise.resolve(this.set(target))
    }

    const from = this.value
    const delta = target - from
    const start = Date.now()

    return new Promise((resolve) => {
      this.timer = setInterval(() => {
        const elapsed = Date.now() - start
        const t = Math.min(1, elapsed / durationMs)
        const next = from + delta * easeOutCubic(t)
        this.value = next
        this.onTick(next)
        if (t >= 1) {
          this.cancel()
          this.value = target
          this.onTick(target)
          resolve()
        }
      }, FADE_TICK_MS)
    })
  }

  cancel(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
