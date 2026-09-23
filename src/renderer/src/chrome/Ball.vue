<script setup lang="ts">
/**
 * 悬浮球。
 *
 * 三种形态，同一个组件：
 *   - 排在顶栏里（默认）——它是工具栏里的一个按钮，位置由 CSS 排布决定
 *   - 顶栏被隐藏时，浮在窗口右上角（右栏顶端）
 *   - 收起时铺满整扇窗，窗口此刻恰好就是球的尺寸
 *
 * 收起态与展开态下球在屏幕上的矩形完全一致，因此收起与展开看起来就是
 * 界面在球的位置上缩进去、再长出来，球本身一动不动。这不是巧合：主进程
 * 收缩窗口时用的就是这里量出来并上报的矩形（见 @shared/ipc 的 SEND.setBallRect）。
 * 让主进程自己算一遍「球该在哪」等于把版面规则抄成两份，迟早会差出几个像素。
 *
 * 平时半透明、悬停变清晰——既找得到，又不抢眼。反馈只用透明度、阴影这类
 * 不改变占位的属性：任何缩放都会让球在收起态顶出窗口边界，被切出四个方角。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BALL_SIZE } from '@shared/constants'

const props = defineProps<{
  /** 收起态：球铺满整扇窗 */
  collapsed: boolean
  /** 顶栏被隐藏，球改浮在窗口右上角 */
  floating: boolean
}>()

const emit = defineEmits<{ toggle: []; menu: [] }>()

const el = ref<HTMLButtonElement | null>(null)

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

/**
 * 把球当前的矩形报给主进程。
 *
 * 收起时窗口要缩到球身上，而球的位置由 CSS 排布决定，只有渲染进程量得准。
 * 收起态下不上报：那时球铺满整扇窗，量到的是窗口而不是球，
 * 报上去会把「球该在哪」覆盖成窗口的位置，展开后收起就再也落不回原处。
 */
function reportRect(): void {
  if (props.collapsed) return
  const node = el.value
  if (!node) return
  const r = node.getBoundingClientRect()
  window.moyu.win.setBallRect({
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  })
}

onMounted(() => {
  reportRect()
  window.addEventListener('resize', reportRect)
})

onBeforeUnmount(() => window.removeEventListener('resize', reportRect))

// 顶栏藏起来前后，球换了个落脚处，位置要重新报一次
watch(
  () => props.floating,
  () => void nextTick(reportRect)
)
</script>

<template>
  <button
    ref="el"
    class="ball"
    :class="{ docked: !collapsed, floating, collapsed }"
    :style="collapsed ? undefined : { width: 'var(--moyu-ball-size)', height: 'var(--moyu-ball-size)' }"
    :title="collapsed ? '展开摸鱼阅读（右键更多）' : '收起成悬浮球（右键更多，拖动可移动窗口）'"
    :aria-label="collapsed ? '展开摸鱼阅读' : '收起成悬浮球'"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu.prevent="emit('menu')"
  >
    <svg
      :width="BALL_SIZE * 0.46"
      :height="BALL_SIZE * 0.46"
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
  /* 默认排在顶栏里：跟着 flex 走，自己占位 */
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
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

/* 顶栏藏起来时球浮在右上角。右栏会被强制保留，所以那里一定是 chrome 的地盘 */
.ball.floating {
  position: absolute;
  top: var(--moyu-ball-margin);
  right: var(--moyu-ball-margin);
}

/*
 * 收起态：窗口就是球，球紧贴着窗口的四条边。
 * clip-path 是保险：窗口本应是正方形（主进程按球心摆一个正方形，见
 * WindowController.collapsedBounds），但平台有最小窗口尺寸，万一还是被卡成
 * 非正方，border-radius 会画出椭圆。circle(closest-side) 取短边作直径，
 * 窗口是正方形时与 border-radius: 50% 完全一致，不是时也仍是正圆。
 */
.ball.collapsed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  clip-path: circle(closest-side at 50% 50%);
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

/*
 * 收起态：窗口正好是球的尺寸，球紧贴着窗口的四条边。
 * 阴影与向外的焦点环都会画到球外面去，而那里已经没有窗口了——
 * 结果是四个角上留下四块灰影，看着像窗口没切干净。
 * 因此这一态下不画任何超出球面的东西，反馈只靠透明度。
 */
.ball.collapsed,
.ball.collapsed:hover,
.ball.collapsed:active {
  box-shadow: none;
}

.ball.collapsed:focus-visible {
  outline-offset: -4px;
}
</style>
