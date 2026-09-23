<script setup lang="ts">
/**
 * chrome 层根组件。
 *
 * 两种形态共用这一层，差别只在界面部分是否绘制：
 *   - 展开：顶栏 + 地址栏（默认折叠）+ 正文（留空，由标签页视图覆盖）+ 右侧栏 + 悬浮球
 *   - 收起：只有悬浮球，铺满整扇窗
 *
 * 正文之所以完全透明且不画东西，是因为标签页视图叠在它上方；
 * 窗口透明时，未被绘制的地方露出的是桌面。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import { ADDRESS_H, BALL_MARGIN, BALL_SIZE, RAIL_W, TOP_BAR_H } from '@shared/constants'
import { effectiveBallSize } from '@shared/ball'
import type { BallCorner } from '@shared/types'
import TopBar from './TopBar.vue'
import AddressBar from './AddressBar.vue'
import Rail from './Rail.vue'
import Ball from './Ball.vue'
import { useConfig } from '../composables/useConfig'
import { useTabs } from '../composables/useTabs'
import { useWindowState } from '../composables/useWindowState'

const { config, patch } = useConfig()
const { tabs, activeTabId, activeTab } = useTabs()
const { state, collapse, expand } = useWindowState()

const collapsed = computed(() => state.value?.mode === 'collapsed')
const addressOpen = computed(() => state.value?.addressOpen ?? false)
const ballSize = computed(() => config.value?.stealth.ballSize ?? BALL_SIZE)
const ballCorner = computed<BallCorner>(() => config.value?.stealth.ballCorner ?? 'bottom-right')

/** 同一个球，点一下收起或展开 */
function toggle(): void {
  if (collapsed.value) expand()
  else collapse()
}

/**
 * 各区域尺寸由主进程的常量下发，不写死在 CSS 里。
 *
 * 正文的宽度与高度都是主进程按这些值算出来、直接设在标签页视图上的；
 * 这里若另写一份，两边迟早会差几个像素，网页就会被栏压住一条。
 */
const geometryVars = {
  '--moyu-top-h': `${TOP_BAR_H}px`,
  '--moyu-address-h': `${ADDRESS_H}px`,
  '--moyu-rail-w': `${RAIL_W}px`
}

/**
 * 球的槽位。
 *
 * 球浮在界面之上，不预留空间就会压住它停靠的那条栏里的控件。
 * 只给球实际所在的那条栏留：三条栏各给一份的话，
 * 顶栏会平白空出一截，右下角那颗球还会在顶栏留下一个永远用不上的缺口。
 */
const gutter = computed(
  () => `${effectiveBallSize(ballSize.value, ballCorner.value) + BALL_MARGIN * 2}px`
)
const ballVars = computed(() => ({
  '--ball-gutter-left': ballCorner.value === 'top-left' ? gutter.value : '0px',
  '--ball-gutter-right': ballCorner.value === 'top-right' ? gutter.value : '0px',
  '--ball-gutter-bottom': ballCorner.value === 'bottom-right' ? gutter.value : '0px'
}))
</script>

<template>
  <div class="root" :style="[geometryVars, ballVars]">
    <template v-if="!collapsed">
      <TopBar
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :active-tab="activeTab"
        :address-open="addressOpen"
      />

      <div class="middle">
        <div class="main-col">
          <AddressBar v-if="addressOpen" :active-tab-id="activeTabId" :active-tab="activeTab" />

          <!-- 中间留空：这一块由标签页视图覆盖 -->
          <div class="spacer" />
        </div>

        <Rail :config="config" :active-tab="activeTab" @patch="patch" />
      </div>
    </template>

    <!-- 悬浮球常驻：展开时贴在窗口的角上，收起时就是整扇窗 -->
    <Ball :size="ballSize" :corner="ballCorner" :collapsed="collapsed" @toggle="toggle" />
  </div>
</template>

<style scoped>
.root {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.middle {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: row;
}

.main-col {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.spacer {
  flex: 1 1 auto;
  background: transparent;
  pointer-events: none;
}
</style>
