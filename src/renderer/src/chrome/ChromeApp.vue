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
import TopBar from './TopBar.vue'
import AddressBar from './AddressBar.vue'
import Rail from './Rail.vue'
import Ball from './Ball.vue'
import { useConfig } from '../composables/useConfig'
import { useBackgroundAlpha } from '../composables/useBackgroundAlpha'
import { useTabs } from '../composables/useTabs'
import { useWindowState } from '../composables/useWindowState'

const { config, patch } = useConfig()
const { tabs, activeTabId, activeTab } = useTabs()
const { state, collapse, expand } = useWindowState()

/** 底板透明度写在文档根上，理由见 useBackgroundAlpha */
useBackgroundAlpha(config)

const collapsed = computed(() => state.value?.mode === 'collapsed')
const addressOpen = computed(() => state.value?.addressOpen ?? false)
const topBarOpen = computed(() => state.value?.topBarOpen ?? true)
/** 右侧栏是否占位。顶栏藏起来时它会被强制保留——那是球的落脚处 */
const railVisible = computed(() => state.value?.railVisible ?? true)

/** 同一个球，点一下收起或展开 */
function toggleBall(): void {
  if (collapsed.value) expand()
  else collapse()
}

/** 球的右键菜单。原生菜单，在顶栏之外也能弹（chrome 层画不出的地方它照画） */
function openBallMenu(): void {
  void window.moyu.win.openBallMenu()
}

/**
 * 各区域尺寸由主进程的常量下发，不写死在 CSS 里。
 *
 * 正文的宽度与高度都是主进程按这些值算出来、直接设在标签页视图上的；
 * 这里若另写一份，两边迟早会差几个像素，网页就会被栏压住一条。
 *
 * 球的直径与留白同样下发：收起时主进程要把窗口缩到球身上，而那个矩形
 * 由 Ball 量出来上报，两边用的是同一组数字。
 */
const geometryVars = {
  '--moyu-top-h': `${TOP_BAR_H}px`,
  '--moyu-address-h': `${ADDRESS_H}px`,
  '--moyu-rail-w': `${RAIL_W}px`,
  '--moyu-ball-size': `${BALL_SIZE}px`,
  '--moyu-ball-margin': `${BALL_MARGIN}px`
}
</script>

<template>
  <div class="root" :style="geometryVars">
    <template v-if="!collapsed">
      <!-- 顶栏里就排着悬浮球，它是这一栏的第三个按钮 -->
      <TopBar
        v-if="topBarOpen"
        :tabs="tabs"
        :active-tab-id="activeTabId"
        :active-tab="activeTab"
        :address-open="addressOpen"
        :rail-visible="railVisible"
        :always-on-top="config?.window.alwaysOnTop ?? false"
        @toggle-ball="toggleBall"
        @ball-menu="openBallMenu"
        @patch="patch"
      />

      <div class="middle">
        <div class="main-col">
          <AddressBar v-if="addressOpen" :active-tab-id="activeTabId" :active-tab="activeTab" />

          <!-- 中间留空：这一块由标签页视图覆盖 -->
          <div class="spacer" />
        </div>

        <Rail
          v-if="railVisible"
          :config="config"
          :active-tab="activeTab"
          :ball-gap-top="!topBarOpen"
          @patch="patch"
        />
      </div>
    </template>

    <!-- 球的另外两种形态：顶栏藏起来时浮在右上角，收起时就是整扇窗 -->
    <Ball
      v-if="collapsed || !topBarOpen"
      :collapsed="collapsed"
      :floating="!collapsed"
      @toggle="toggleBall"
      @menu="openBallMenu"
    />
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
