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
import { ballOffsetInWindow, effectiveBallSize } from '@shared/ball'
import type { BallCorner } from '@shared/types'

const props = defineProps<{
  /** 用户配置的直径；实际生效值会按工具栏高度收窄 */
  size: number
  corner: BallCorner
  collapsed: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()

/** 实际生效的直径：主进程算收起尺寸时用的是同一个函数 */
const ballSize = computed(() => effectiveBallSize(props.size, props.corner))

/** 位移小于这个距离就当作点击，而不是拖动 */
const CLICK_SLOP = 5

/**
 * 按下时的屏幕坐标。
 *
 * 必须用屏幕坐标而不是页面坐标：拖动时窗口跟着光标走，光标在页面里
 * 几乎不动，用页面坐标算位移会恒为零，点击与拖动就分不开了。
 */
let pressAt: { x: number; y: number } | null = null
let dragging = false

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  pressAt = { x: event.screenX, y: event.screenY }
  dragging = true
  // 捕获指针：窗口移动过程中指针短暂离开球面也能继续收到事件
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  window.moyu.win.dragStart()
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging) return
  dragging = false
  window.moyu.win.dragEnd()

  const start = pressAt
  pressAt = null
  if (!start) return

  const moved = Math.hypot(event.screenX - start.x, event.screenY - start.y)
  // 没怎么动就是一次点击，切换收起 / 展开
  if (moved < CLICK_SLOP) emit('toggle')
}

function onPointerCancel(): void {
  if (!dragging) return
  dragging = false
  pressAt = null
  window.moyu.win.dragEnd()
}

/** 展开时贴在工具栏内的那个角，收起时铺满窗口 */
const positionStyle = computed(() => {
  if (props.collapsed) {
    return { inset: '0px' }
  }
  const off = ballOffsetInWindow(props.corner, window.innerWidth, window.innerHeight, ballSize.value)
  return { left: `${off.x}px`, top: `${off.y}px` }
})
</script>

<template>
  <button
    class="ball"
    :class="{ docked: !collapsed, collapsed }"
    :style="[{ width: `${ballSize}px`, height: `${ballSize}px` }, positionStyle]"
    :title="collapsed ? '展开摸鱼阅读' : '收起成悬浮球（拖动可移动窗口）'"
    :aria-label="collapsed ? '展开摸鱼阅读' : '收起成悬浮球'"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <svg
      :width="ballSize * 0.46"
      :height="ballSize * 0.46"
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
  transition: opacity 140ms ease-out, box-shadow 140ms ease-out;
  -webkit-app-region: no-drag;
  /* 拖动是自己实现的，所以光标形状也要自己给 */
  cursor: grab;
  z-index: 10;
  /*
   * 关键：任何状态下都不能画出这个盒子。
   * 收起后窗口正好是球的尺寸，一旦放大哪怕百分之几，圆就会被窗口边界切出方角。
   * 因此反馈只用透明度与阴影——它们不会改变球的占位。
   */
  transform: none;
}

.ball.docked {
  /* 展开态下它只是一个开关，不影响正文区域的观感 */
  opacity: 0.45;
}

.ball:hover {
  opacity: 1;
  box-shadow: 0 3px 12px rgba(17, 24, 39, 0.34);
}

/* 按下时向内收，而不是向外扩 */
.ball:active {
  cursor: grabbing;
  opacity: 1;
  box-shadow:
    0 1px 4px rgba(17, 24, 39, 0.3),
    inset 0 0 0 2px rgba(255, 255, 255, 0.45);
}

.ball:focus-visible {
  opacity: 1;
  outline: 2px solid var(--moyu-accent);
  outline-offset: 2px;
}
</style>
