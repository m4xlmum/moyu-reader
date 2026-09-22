<script setup lang="ts">
/**
 * chrome 层根组件。
 *
 * 它覆盖整个窗口：顶部画菜单栏、底部画工具栏，中间留空。
 * 中间之所以要完全透明且不画任何东西，是因为标签页视图叠在它的上方，
 * 而标签页隐藏时露出的应当是桌面。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import type { ZoneState } from '@shared/types'
import TopBar from './TopBar.vue'
import BottomBar from './BottomBar.vue'
import RevealStrip from './RevealStrip.vue'
import { useConfig } from '../composables/useConfig'
import { useTabs } from '../composables/useTabs'
import { useWindowState } from '../composables/useWindowState'

const { config, patch } = useConfig()
const { tabs, activeTabId, activeTab } = useTabs()
const { state, applyZones } = useWindowState()

const DEFAULT_ZONES: ZoneState = { top: 'shown', body: 'shown', bottom: 'shown' }

const zones = computed<ZoneState>(() => state.value?.zones ?? DEFAULT_ZONES)

function reveal(side: 'top' | 'bottom'): void {
  void applyZones({ ...zones.value, [side]: 'shown' })
}
</script>

<template>
  <div class="chrome">
    <RevealStrip v-if="zones.top === 'hidden'" side="top" @reveal="reveal('top')" />

    <TopBar
      v-show="zones.top === 'shown'"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :active-tab="activeTab"
      :config="config"
      @patch="patch"
    />

    <!-- 中间留空：这一块由标签页视图覆盖，标签页隐藏时露出桌面 -->
    <div class="spacer" />

    <BottomBar
      v-show="zones.bottom === 'shown'"
      :zones="zones"
      :config="config"
      :active-tab="activeTab"
      @patch="patch"
      @apply-zones="applyZones"
    />

    <RevealStrip v-if="zones.bottom === 'hidden'" side="bottom" @reveal="reveal('bottom')" />
  </div>
</template>

<style scoped>
.chrome {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: transparent;
}

.spacer {
  flex: 1 1 auto;
  /* 必须完全透明，且不接收事件——鼠标应落到下方的网页上 */
  background: transparent;
  pointer-events: none;
}
</style>
