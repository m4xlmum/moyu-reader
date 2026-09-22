/**
 * 窗口运行状态的响应式镜像（展开 / 收起成球、界面透明度）。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { onMounted, onUnmounted, ref } from 'vue'
import type { WindowRuntime } from '@shared/types'

export function useWindowState() {
  const state = ref<WindowRuntime | null>(null)
  let unsubscribe: (() => void) | null = null

  onMounted(async () => {
    state.value = await window.moyu.win.getState()
    unsubscribe = window.moyu.win.onState((next) => {
      state.value = next
    })
  })

  onUnmounted(() => unsubscribe?.())

  /** 整个界面缩成悬浮球 */
  function collapse(): void {
    void window.moyu.win.collapse()
  }

  /** 从悬浮球展开回完整界面 */
  function expand(): void {
    void window.moyu.win.expand()
  }

  return { state, collapse, expand }
}
