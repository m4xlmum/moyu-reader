<script setup lang="ts">
/**
 * 右侧功能栏。
 *
 * 站点、历史、书签、缩放、两条透明度滑块这些原本摊在底栏的功能都收在这里。
 * 横屏下纵向空间最贵，而底栏那条横带子要吃掉整个宽度；换成一条竖栏，
 * 代价只是正文窄了 48px。
 *
 * 手机与置顶原本也是这里的两个按钮（写着汉字，一格一个），现在搬去了顶栏的图标组：
 * 它们改的是「这一页怎么显示」，与阅读本身无关，占着功能位不如让给滑块。
 *
 * 栏底那格「设置」也搬走了——用户要它挪到界面左上角并换成图标，现在它与起始页
 * 那颗键并排待在顶栏最左（见 TopBar.vue）。于是这一栏不再有「固定在栏底、
 * 滚不掉」的那一格：整条栈都能滚，最下面一条滑块不会被谁挤掉。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import {
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  OPACITY_MAX,
  OPACITY_MIN
} from '@shared/constants'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, TabState } from '@shared/types'
import Icon from './Icon.vue'
import OpacitySlider from './OpacitySlider.vue'
import { useWindowDrag } from '../composables/useWindowDrag'

const props = defineProps<{
  config: AppConfig | null
  activeTab: TabState | null
  /** 顶栏已隐藏，球浮在本栏顶端，需要给它让出一段空白 */
  ballGapTop: boolean
}>()

const emit = defineEmits<{ patch: [patch: ConfigPatch] }>()

/** 整条栏可拖动。按在按钮与滑块上是操作，其余地方（格子之间、分隔线、栏内空白）都是拖窗口 */
const drag = useWindowDrag()

type PopoverKind = 'sites' | 'history' | 'bookmarks' | 'uaZoom'

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

/**
 * 缩放这三格。它们作用在**某一页**上，因此停在起始页 / 设置上时没有可作用的对象
 * ——那三格显示的是默认值，点了也不会发生什么，于是干脆禁掉，而不是装作能点。
 */
function zoom(op: 'in' | 'out' | 'reset'): void {
  const tabId = props.activeTab?.id
  if (!tabId) return
  void window.moyu.page.setZoom({ tabId, op })
}

/** 整扇窗的透明度，含网页 */
function setOpacity(value: number): void {
  void window.moyu.win.setOpacity({ value })
}

/** 界面底板（顶栏、本栏、弹出面板）的透明度，网页不受影响 */
function setBackgroundOpacity(value: number): void {
  emit('patch', { ui: { backgroundOpacity: value } })
}

/**
 * 收起时是否暂停网页里正在播的媒体。
 *
 * 这一项在系统设置里也有（隐蔽 → 收起时暂停音视频），两处改的是同一份配置，
 * 靠配置广播对齐——因此在设置里改完，这里那一格的高亮会跟着变。
 * 摆在本栏最上面一格：小窗口下这条功能栈是**会滚的**（迷你档实测溢出 174px），
 * 排在下面的东西等于藏起来了，而这一枚本来就是嫌设置里不好找才搬上来的。
 */
const pauseOnCollapse = computed(() => props.config?.stealth.muteMediaOnCollapse ?? false)

const pauseHint = computed(() =>
  pauseOnCollapse.value
    ? '收起时暂停播放 · 开：收起成球、藏进托盘、最小化都会暂停网页里正在播的媒体'
    : '收起时暂停播放 · 关：收起时网页继续在后台播放'
)

function togglePauseOnCollapse(): void {
  emit('patch', { stealth: { muteMediaOnCollapse: !pauseOnCollapse.value } })
}
</script>

<template>
  <aside
    class="rail"
    :class="{ 'ball-top': ballGapTop }"
    @pointerdown="drag.onPointerDown"
    @pointerup="drag.onPointerUp"
    @pointercancel="drag.onPointerCancel"
  >
    <div class="stack">
      <!--
        收起时暂停播放。全栏唯一一格「开关」：其余要么打开面板、要么是滑块，
        它按下去就地切换一个状态，高亮即当前状态（.item.on）。
      -->
      <button
        class="item"
        :class="{ on: pauseOnCollapse }"
        :title="pauseHint"
        @click="togglePauseOnCollapse"
      >
        <Icon name="pause" :size="14" />
      </button>

      <div class="sep" />

      <button class="item" title="我的站点 / 热门站点" @click="openPopover('sites', $event)">
        站点
      </button>
      <button class="item" title="历史记录" @click="openPopover('history', $event)">历史</button>
      <button class="item" title="书签" @click="openPopover('bookmarks', $event)">书签</button>

      <div class="sep" />

      <button
        class="item"
        :disabled="!activeTab"
        title="放大"
        @click="zoom('in')"
      >
        <Icon name="plus" :size="13" />
      </button>
      <button
        class="item percent"
        :disabled="!activeTab"
        title="重置缩放"
        @click="zoom('reset')"
      >
        {{ zoomPercent }}%
      </button>
      <button
        class="item"
        :disabled="!activeTab"
        title="缩小"
        @click="zoom('out')"
      >
        <Icon name="minus" :size="13" />
      </button>

      <div class="sep" />

      <OpacitySlider
        label="整体"
        hint="整扇窗，含网页"
        :model-value="config?.window.opacity ?? 1"
        :min="OPACITY_MIN"
        :max="OPACITY_MAX"
        @update:model-value="setOpacity"
      />

      <OpacitySlider
        label="背景"
        hint="只影响界面底板，网页不受影响"
        :model-value="config?.ui.backgroundOpacity ?? 1"
        :min="BACKGROUND_OPACITY_MIN"
        :max="BACKGROUND_OPACITY_MAX"
        @update:model-value="setBackgroundOpacity"
      />
    </div>
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

.item:hover:not(:disabled) {
  background: var(--moyu-surface-hover);
  color: var(--moyu-ink);
}

/* 没有当前网页时缩放那三格是禁用的：默认值摆在那里，但点了什么都不会发生 */
.item:disabled {
  color: var(--moyu-text-faint);
}

.item.on {
  color: var(--moyu-accent);
  background: var(--moyu-accent-soft);
}

.item.percent {
  font-variant-numeric: tabular-nums;
}
</style>
