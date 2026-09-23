<script setup lang="ts">
/**
 * 右侧功能栏。
 *
 * 手机模式、置顶、站点、历史、书签、缩放、透明度、设置这些原本摊在底栏的功能都收在这里。
 * 横屏下纵向空间最贵，而底栏那条横带子要吃掉整个宽度；换成一条竖栏，
 * 代价只是正文窄了 48px。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, TabState } from '@shared/types'
import Icon from './Icon.vue'
import OpacitySlider from './OpacitySlider.vue'

const props = defineProps<{
  config: AppConfig | null
  activeTab: TabState | null
  /** 顶栏已隐藏，球浮在本栏顶端，需要给它让出一段空白 */
  ballGapTop: boolean
}>()

const emit = defineEmits<{ patch: [patch: ConfigPatch] }>()

type PopoverKind = 'sites' | 'history' | 'bookmarks' | 'uaZoom'

const uaMode = computed(() => props.activeTab?.uaMode ?? 'desktop')
const zoomPercent = computed(() => Math.round((props.activeTab?.zoom ?? 1) * 100))

/** 面板锚点取自按钮自身的位置，主进程据此把它摆在按钮附近 */
function openPopover(kind: PopoverKind, event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  void window.moyu.ui.openPopover({
    kind,
    anchorRect: {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
  })
}

function toggleUa(): void {
  const tabId = props.activeTab?.id
  if (!tabId) return
  void window.moyu.page.setUa({ tabId, mode: uaMode.value === 'mobile' ? 'desktop' : 'mobile' })
}

function togglePin(): void {
  const cfg = props.config
  if (!cfg) return
  emit('patch', { window: { alwaysOnTop: !cfg.window.alwaysOnTop } })
}

function zoom(op: 'in' | 'out' | 'reset'): void {
  const tabId = props.activeTab?.id
  if (!tabId) return
  void window.moyu.page.setZoom({ tabId, op })
}

function setOpacity(value: number): void {
  void window.moyu.win.setOpacity({ value })
}

// 模板里的 window 指向组件实例而非全局对象，因此全局调用都要包一层方法
function openSettings(): void {
  void window.moyu.ui.openSettings()
}
</script>

<template>
  <aside class="rail moyu-drag" :class="{ 'ball-top': ballGapTop }">
    <div class="stack moyu-no-drag">
      <button
        class="item"
        :class="{ on: uaMode === 'mobile' }"
        title="手机 / 电脑模式"
        @click="toggleUa"
      >
        手机
      </button>
      <button
        class="item"
        :class="{ on: config?.window.alwaysOnTop }"
        title="窗口置顶"
        @click="togglePin"
      >
        置顶
      </button>

      <div class="sep" />

      <button class="item" title="我的站点 / 热门站点" @click="openPopover('sites', $event)">
        站点
      </button>
      <button class="item" title="历史记录" @click="openPopover('history', $event)">历史</button>
      <button class="item" title="书签" @click="openPopover('bookmarks', $event)">书签</button>

      <div class="sep" />

      <button class="item" title="放大" @click="zoom('in')"><Icon name="plus" :size="13" /></button>
      <button class="item percent" title="重置缩放" @click="zoom('reset')">{{ zoomPercent }}%</button>
      <button class="item" title="缩小" @click="zoom('out')"><Icon name="minus" :size="13" /></button>

      <div class="sep" />

      <OpacitySlider :model-value="config?.window.opacity ?? 1" @update:model-value="setOpacity" />
    </div>

    <!-- 设置固定在栏底：它是最常走的一个出口，不该被滚出视野 -->
    <button class="item foot moyu-no-drag" title="设置" @click="openSettings">设置</button>
  </aside>
</template>

<style scoped>
.rail {
  flex: 0 0 var(--moyu-rail-w);
  width: var(--moyu-rail-w);
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  background: var(--moyu-surface);
  border-left: 1px solid var(--moyu-hairline);
}

/*
 * 顶栏藏起来之后，球浮在本栏顶端。
 * 不给它让位的话，第一个按钮就被压在球底下了。
 */
.rail.ball-top {
  padding-top: calc(4px + var(--moyu-ball-size) + var(--moyu-ball-margin) * 2);
}

.stack {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 窗口矮的时候这一列放不下，允许纵向滚动；横向必须裁掉——
     透明度滑块是横条转 90° 画出来的，它的布局盒比栏宽得多 */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.stack::-webkit-scrollbar {
  width: 0;
  display: none;
}

.sep {
  flex: 0 0 auto;
  height: 1px;
  margin: 3px 4px;
  background: var(--moyu-hairline);
}

.item {
  flex: 0 0 auto;
  width: 100%;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  white-space: nowrap;
  transition: background 120ms ease-out, color 120ms ease-out;
}

.item:hover {
  background: var(--moyu-surface-hover);
  color: var(--moyu-ink);
}

.item.on {
  color: var(--moyu-accent);
  background: var(--moyu-accent-soft);
}

.item.percent {
  font-variant-numeric: tabular-nums;
}
</style>
