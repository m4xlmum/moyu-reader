<script setup lang="ts">
/**
 * chrome 层根组件。
 *
 * 两种形态共用这一层：
 *   - 展开：顶栏 + 正文（留空，由标签页视图覆盖）+ 底栏
 *   - 收起：整扇窗就是一颗悬浮球
 *
 * 正文之所以要完全透明且不画任何东西，是因为标签页视图叠在它上方；
 * 窗口透明时，未被绘制的地方露出的是桌面。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import TopBar from './TopBar.vue'
import BottomBar from './BottomBar.vue'
import Ball from './Ball.vue'
import { useConfig } from '../composables/useConfig'
import { useTabs } from '../composables/useTabs'
import { useWindowState } from '../composables/useWindowState'

const { config, patch } = useConfig()
const { tabs, activeTabId, activeTab } = useTabs()
const { state, expand } = useWindowState()

const collapsed = computed(() => state.value?.mode === 'collapsed')
const ballSize = computed(() => config.value?.stealth.ballSize ?? 52)
</script>

<template>
  <!-- 收起：整扇窗只剩一颗球 -->
  <Ball v-if="collapsed" :size="ballSize" @expand="expand" />

  <!-- 展开：完整的浏览器式界面 -->
  <div v-else class="chrome">
    <TopBar
      :tabs="tabs"
      :active-tab-id="activeTabId"
      :active-tab="activeTab"
      :config="config"
      @patch="patch"
    />

    <!-- 中间留空：这一块由标签页视图覆盖 -->
    <div class="spacer" />

    <BottomBar :config="config" :active-tab="activeTab" @patch="patch" />
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
  background: transparent;
  pointer-events: none;
}
</style>
