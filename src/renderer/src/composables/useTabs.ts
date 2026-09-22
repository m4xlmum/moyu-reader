/**
 * 标签页状态的响应式镜像。状态由主进程推送，这里只做展示。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { TabState } from '@shared/types'

export function useTabs() {
  const tabs = ref<TabState[]>([])
  const activeTabId = ref<string | null>(null)
  let unsubscribe: (() => void) | null = null

  onMounted(async () => {
    const initial = await window.moyu.tabs.list()
    tabs.value = initial.tabs
    activeTabId.value = initial.activeTabId

    unsubscribe = window.moyu.tabs.onState((payload) => {
      tabs.value = payload.tabs
      activeTabId.value = payload.activeTabId
    })
  })

  onUnmounted(() => unsubscribe?.())

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null)

  return { tabs, activeTabId, activeTab }
}
