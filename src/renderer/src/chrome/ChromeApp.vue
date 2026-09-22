<script setup lang="ts">
/**
 * chrome 层根组件。
 *
 * 两种形态共用这一层，差别只在界面部分是否绘制：
 *   - 展开：顶栏 + 正文（留空，由标签页视图覆盖） + 底栏 + 角上的悬浮球
 *   - 收起：只有悬浮球，铺满整扇窗
 *
 * 正文之所以完全透明且不画东西，是因为标签页视图叠在它上方；
 * 窗口透明时，未被绘制的地方露出的是桌面。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import { BALL_MARGIN } from '@shared/constants'
import TopBar from './TopBar.vue'
import BottomBar from './BottomBar.vue'
import Ball from './Ball.vue'
import { useConfig } from '../composables/useConfig'
import { useTabs } from '../composables/useTabs'
import { useWindowState } from '../composables/useWindowState'

const { config, patch } = useConfig()
const { tabs, activeTabId, activeTab } = useTabs()
const { state, collapse, expand } = useWindowState()

const collapsed = computed(() => state.value?.mode === 'collapsed')
const ballSize = computed(() => config.value?.stealth.ballSize ?? 52)
const ballCorner = computed(() => config.value?.stealth.ballCorner ?? 'bottom-right')

/** 同一个球，点一下收起或展开 */
function toggle(): void {
  if (collapsed.value) expand()
  else collapse()
}

/**
 * 球的停靠侧要给它留出槽位。
 *
 * 球是浮在界面之上的，不预留空间就会压住那一侧的按钮（例如右下角的「设置」）。
 * 两条工具栏都留：球停在上边或下边是可配的，两边都留比按状态切换简单得多，
 * 代价只是另一条栏空出一小段。
 */
const gutter = computed(() => `${ballSize.value + BALL_MARGIN * 2}px`)
const gutterSide = computed(() => (ballCorner.value.endsWith('right') ? 'right' : 'left'))
</script>

<template>
  <div class="root" :style="{ '--ball-gutter': gutter, [`--ball-gutter-${gutterSide}`]: gutter }">
    <div v-if="!collapsed" class="chrome">
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

    <!-- 悬浮球常驻：展开时贴在窗口的角上，收起时就是整扇窗 -->
    <Ball :size="ballSize" :corner="ballCorner" :collapsed="collapsed" @toggle="toggle" />
  </div>
</template>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100%;
  background: transparent;
}

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
