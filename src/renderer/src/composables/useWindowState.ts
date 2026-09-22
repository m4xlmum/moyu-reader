/**
 * 窗口运行状态的响应式镜像（当前状态、分区显隐、命中策略等）。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { onMounted, onUnmounted, ref } from 'vue'
import type { WindowRuntime, ZoneState } from '@shared/types'

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

  async function applyZones(zones: ZoneState): Promise<void> {
    const echoed = await window.moyu.win.applyZones(zones)
    if (state.value) state.value = { ...state.value, zones: echoed }
  }

  return { state, applyZones }
}
