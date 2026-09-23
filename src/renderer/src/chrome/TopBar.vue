<script setup lang="ts">
/**
 * 顶部功能栏：导航、地址栏开关、标签页、悬浮球、窗口操作。
 *
 * 地址栏本身不在这里——它默认折叠，展开时是顶栏下方独立的一行。
 * 这里只留一个开关，兼作「当前在哪」的一眼可见处。
 *
 * 标签页不再是排开的标签条：标签一多就会溢出，只得横向滚动才能找到想去的那个。
 * 改成一个下拉样式的按钮，显示当前页，点开是一份竖排清单（面板窗口里画，
 * 因为 chrome 层在标签页视图之下，画在顶栏里的下拉会被网页盖住）。
 *
 * 整条可拖动（-webkit-app-region: drag），其中的控件需标记 no-drag，
 * 否则点击会被当成拖动窗口起手。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import { isOwnUrl } from '@shared/url'
import type { TabState } from '@shared/types'
import Icon from './Icon.vue'
import Ball from './Ball.vue'

const props = defineProps<{
  tabs: TabState[]
  activeTabId: string | null
  activeTab: TabState | null
  /** 地址栏当前是否展开，来自主进程回传的窗口状态 */
  addressOpen: boolean
  /** 右侧栏当前是否占位，同时决定开关按钮的高亮 */
  railVisible: boolean
}>()

const emit = defineEmits<{ toggleBall: []; ballMenu: [] }>()

/**
 * 当前页的域名，显示在地址栏开关上。
 *
 * 自家页面（起始页、个人中心）显示自己的标题：它们没有域名，
 * 而真实的 file:// 路径既不好看，也暴露了本机目录结构。
 */
const siteLabel = computed(() => {
  const url = props.activeTab?.url
  if (!url || isOwnUrl(url)) return props.activeTab?.title || '起始页'
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
})

/** 下拉按钮上显示的当前页标题 */
const tabLabel = computed(() => props.activeTab?.title || '新标签页')

async function newTab(): Promise<void> {
  await window.moyu.tabs.create({ activate: true })
}

/**
 * 切换地址栏。
 *
 * 用 mousedown.prevent 而不是 click：地址栏输入框一旦失焦就会自行收起，
 * 而按在按钮上会让它失焦——那样「点开关」会先收起再展开，等于没反应。
 * 挡掉 mousedown 的默认行为，焦点就不会移走，收起只由这次点击决定。
 */
function toggleAddress(event: MouseEvent): void {
  event.preventDefault()
  window.moyu.win.setAddressOpen({ open: !props.addressOpen })
}

/**
 * 打开标签页清单。
 *
 * 做成独立面板而不是 CSS 下拉：面板是另一个窗口，可以盖在网页上；
 * 顶栏里的 DOM 只要画到顶栏下沿以外就会被标签页视图整个盖住。
 * 锚点取按钮自身的位置，主进程据此把它摆在按钮正下方。
 */
function openTabList(event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  void window.moyu.ui.openPopover({
    kind: 'tabs',
    anchorRect: {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
  })
}

function toggleRail(): void {
  window.moyu.win.setChrome({ rail: !props.railVisible })
}

// 模板里的 window 指向组件实例而非全局对象，因此全局调用都要包一层方法
function navBack(): void {
  const id = props.activeTabId
  if (id) void window.moyu.nav.back({ tabId: id })
}

function navForward(): void {
  const id = props.activeTabId
  if (id) void window.moyu.nav.forward({ tabId: id })
}

function navReload(): void {
  const id = props.activeTabId
  if (id) void window.moyu.nav.reload({ tabId: id })
}

function winMinimize(): void {
  void window.moyu.win.minimize()
}

function winClose(): void {
  void window.moyu.win.close()
}

function goHome(): void {
  void window.moyu.tabs.home()
}
</script>

<template>
  <header class="topbar moyu-drag">
    <!-- 导航 -->
    <div class="group moyu-no-drag">
      <button class="icon" title="回到起始页" @click="goHome"><Icon name="home" /></button>
      <button class="icon" title="后退" :disabled="!activeTab?.canGoBack" @click="navBack">
        <Icon name="back" />
      </button>
      <button class="icon" title="前进" :disabled="!activeTab?.canGoForward" @click="navForward">
        <Icon name="forward" />
      </button>
      <button class="icon" title="刷新" @click="navReload"><Icon name="reload" /></button>
    </div>

    <!-- 地址栏开关。地址栏默认折叠，这里是唤出它的入口 -->
    <button
      class="address-toggle moyu-no-drag"
      :class="{ on: addressOpen }"
      :title="addressOpen ? '收起地址栏' : '展开地址栏'"
      @mousedown="toggleAddress"
    >
      <Icon name="search" :size="14" />
      <span class="ellipsis">{{ siteLabel }}</span>
    </button>

    <!-- 标签页：下拉式的单按钮，标签再多也不会把顶栏挤爆 -->
    <button
      class="tab-select moyu-no-drag"
      :title="`标签页（${tabs.length}）`"
      @click="openTabList"
    >
      <span class="ellipsis">{{ tabLabel }}</span>
      <span v-if="tabs.length > 1" class="tab-count">{{ tabs.length }}</span>
      <Icon name="chevron-down" :size="12" />
    </button>

    <button class="icon moyu-no-drag" title="新建标签页" @click="newTab">
      <Icon name="plus" />
    </button>

    <div class="spacer" />

    <!-- 窗口操作。顺序：最小化、关闭、悬浮球、收起右侧栏 -->
    <div class="group moyu-no-drag">
      <button class="icon" title="最小化（老板键 1）" @click="winMinimize">
        <Icon name="minimize" />
      </button>
      <button class="icon danger" title="关闭（藏进托盘，不退出）" @click="winClose">
        <Icon name="close" />
      </button>
      <Ball :collapsed="false" :floating="false" @toggle="emit('toggleBall')" @menu="emit('ballMenu')" />
      <button
        class="icon"
        :class="{ on: railVisible }"
        :title="railVisible ? '收起右侧栏' : '展开右侧栏'"
        @click="toggleRail"
      >
        <Icon name="panel-right" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  flex: 0 0 auto;
  height: var(--moyu-top-h);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: var(--moyu-surface);
  border-bottom: 1px solid var(--moyu-hairline);
}

.group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.spacer {
  flex: 1 1 auto;
}

.icon {
  height: 26px;
  min-width: 26px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  white-space: nowrap;
  transition: background 120ms ease-out, color 120ms ease-out;
}

.icon:hover:not(:disabled) {
  background: var(--moyu-surface-hover);
  color: var(--moyu-ink);
}

.icon:disabled {
  color: var(--moyu-text-faint);
}

.icon.on {
  color: var(--moyu-accent);
  background: var(--moyu-accent-soft);
}

.icon.danger:hover {
  color: #ffffff;
  background: var(--moyu-danger);
}

.ellipsis {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 地址栏开关做得像浏览器的站点标识：一个图标加当前域名 */
.address-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  min-width: 120px;
  max-width: 260px;
  padding: 0 12px;
  border-radius: 13px;
  background: var(--moyu-surface-hover);
  color: var(--moyu-text-dim);
  transition: background 120ms ease-out, color 120ms ease-out;
}

.address-toggle:hover {
  background: var(--moyu-surface-active);
  color: var(--moyu-ink);
}

.address-toggle.on {
  color: var(--moyu-accent);
  background: var(--moyu-accent-soft);
}

/* 标签页下拉：形状与地址栏开关一致，宽度受控，标题长了就省略 */
.tab-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  min-width: 108px;
  max-width: 190px;
  padding: 0 10px 0 12px;
  border-radius: 13px;
  background: var(--moyu-surface-hover);
  color: var(--moyu-text-dim);
  transition: background 120ms ease-out, color 120ms ease-out;
}

.tab-select:hover {
  background: var(--moyu-surface-active);
  color: var(--moyu-ink);
}

.tab-count {
  flex: 0 0 auto;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--moyu-surface-active);
  color: var(--moyu-text-dim);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
