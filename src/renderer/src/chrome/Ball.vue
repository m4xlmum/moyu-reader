<script setup lang="ts">
/**
 * 悬浮球。
 *
 * 它是窗口**内部**的常驻元素，不是屏幕角落的挂件：
 *   - 展开时贴在窗口的某一角（位置由 ballCorner 决定）
 *   - 收起时窗口缩到球身上，球铺满整个窗口
 *
 * 两种形态下球在屏幕上的矩形完全一致，因此收起与展开看起来就是
 * 界面在球的位置上缩进去、再长出来，球本身一动不动。
 *
 * 平时 55% 不透明，鼠标移上去恢复不透明并微微放大——既找得到，又不抢眼。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import { BALL_MARGIN } from '@shared/constants'
import type { BallCorner } from '@shared/types'

const props = defineProps<{
  size: number
  corner: BallCorner
  collapsed: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

/** 展开时贴角，收起时铺满窗口 */
const positionStyle = computed(() => {
  if (props.collapsed) {
    return { inset: '0px' }
  }
  const m = `${BALL_MARGIN}px`
  switch (props.corner) {
    case 'top-left':
      return { top: m, left: m }
    case 'top-right':
      return { top: m, right: m }
    case 'bottom-left':
      return { bottom: m, left: m }
    case 'bottom-right':
    default:
      return { bottom: m, right: m }
  }
})
</script>

<template>
  <button
    class="ball"
    :class="{ docked: !collapsed, collapsed }"
    :style="[{ width: `${size}px`, height: `${size}px` }, positionStyle]"
    :title="collapsed ? '展开摸鱼阅读' : '收起成悬浮球'"
    :aria-label="collapsed ? '展开摸鱼阅读' : '收起成悬浮球'"
    @click="emit('toggle')"
  >
    <svg
      :width="size * 0.46"
      :height="size * 0.46"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5h6a2.5 2.5 0 0 1 2 2.5v11a2 2 0 0 0-1.6-1.4H4z" />
      <path d="M20 5.5h-6a2.5 2.5 0 0 0-2 2.5v11a2 2 0 0 1 1.6-1.4H20z" />
    </svg>
  </button>
</template>

<style scoped>
.ball {
  position: absolute;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--moyu-accent);
  color: #ffffff;
  opacity: 0.55;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.28);
  transition:
    opacity 140ms ease-out,
    transform 140ms ease-out,
    box-shadow 140ms ease-out;
  -webkit-app-region: no-drag;
  z-index: 10;
}

.ball.docked {
  /* 展开态下它只是一个开关，不影响正文区域的观感 */
  opacity: 0.45;
}

.ball:hover {
  opacity: 1;
  transform: scale(1.06);
  box-shadow: 0 3px 12px rgba(17, 24, 39, 0.34);
}

.ball:active {
  transform: scale(0.96);
}

.ball:focus-visible {
  opacity: 1;
  outline: 2px solid var(--moyu-accent);
  outline-offset: 2px;
}
</style>
