<script setup lang="ts">
/**
 * 顶部功能栏：导航、地址栏开关、标签页、手机 / 置顶、窗口操作。
 *
 * 地址栏本身不在这里——它默认折叠，展开时是顶栏下方独立的一行。
 * 这里只留一个开关，兼作「当前在哪」的一眼可见处。
 *
 * 标签条与它的让位（窗口窄时退回下拉清单）都在 TabStrip 里，
 * 那一条要按实测宽度决定自己让不让位，是顶栏里唯一需要知道自己有多宽的东西。
 *
 * 整条可拖动，按在控件上是操作。判据在 useWindowDrag 里，这里不必逐个标记。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import { isOwnUrl } from '@shared/url'
import type { ConfigPatch } from '@shared/ipc'
import type { TabState } from '@shared/types'
import Icon from './Icon.vue'
import Ball from './Ball.vue'
import TabStrip from './TabStrip.vue'
import { useWindowDrag } from '../composables/useWindowDrag'

const props = defineProps<{
  tabs: TabState[]
  activeTabId: string | null
  activeTab: TabState | null
  /** 地址栏当前是否展开，来自主进程回传的窗口状态 */
  addressOpen: boolean
  /** 右侧栏当前是否占位，同时决定开关按钮的高亮 */
  railVisible: boolean
  /** 窗口是否置顶，决定置顶按钮的高亮 */
  alwaysOnTop: boolean
}>()

const emit = defineEmits<{
  toggleBall: []
  ballMenu: []
  patch: [patch: ConfigPatch]
}>()

/** 整条栏可拖动。按在按钮、地址栏开关、标签条上是操作，其余地方都是拖窗口 */
const drag = useWindowDrag()

/**
 * 当前页的域名，显示在地址栏开关上。
 *
 * 自家页面（起始页、系统设置）显示自己的标题：它们没有域名，
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

/** 新建一张标签页并切过去 */
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

function toggleRail(): void {
  window.moyu.win.setChrome({ rail: !props.railVisible })
}

/** 手机 / 电脑模式。跟着当前标签页走，换一页就跟着那一页的状态 */
const mobile = computed(() => props.activeTab?.uaMode === 'mobile')

function toggleUa(): void {
  const tabId = props.activeTabId
  if (!tabId) return
  void window.moyu.page.setUa({ tabId, mode: mobile.value ? 'desktop' : 'mobile' })
}

function togglePin(): void {
  emit('patch', { window: { alwaysOnTop: !props.alwaysOnTop } })
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

/**
 * 最大化。铺满当前显示器的整个工作区，不保 16:9。
 *
 * 这一枚只画「最大化」这一态，不画「还原」：最大化之后整条顶栏都让位给网页
 * （用户定的），它就跟着没了。退出改走右上角那一枚还原键，或球的右键菜单——
 * 那两处都在最大化后仍在窗内的那一小块里。
 */
function winMaximize(): void {
  void window.moyu.win.maximize()
}

function winClose(): void {
  void window.moyu.win.close()
}

function goHome(): void {
  void window.moyu.tabs.home()
}
</script>

<template>
  <header
    class="topbar"
    @pointerdown="drag.onPointerDown"
    @pointerup="drag.onPointerUp"
    @pointercancel="drag.onPointerCancel"
  >
    <!-- 导航 -->
    <div class="group">
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
      class="address-toggle"
      :class="{ on: addressOpen }"
      :title="addressOpen ? '收起地址栏' : '展开地址栏'"
      @mousedown="toggleAddress"
    >
      <Icon name="search" :size="14" />
      <span class="ellipsis">{{ siteLabel }}</span>
    </button>

    <!--
      标签条。它自己占住中间那一整块，也自己决定放不下时退回下拉清单，
      新建按钮跟着它走——浏览器里那个「+」也是挨着最后一个标签。
    -->
    <TabStrip :tabs="tabs" :active-tab-id="activeTabId">
      <button class="icon" title="新建标签页" @click="newTab">
        <Icon name="plus" />
      </button>
    </TabStrip>

    <!--
      窗口操作。顺序：手机 · 置顶 · 最大化/还原 · 最小化 · 关闭 · 悬浮球 · 收起右侧栏。
      手机与置顶原本是右栏里两个写着汉字的格子，改作图标搬到这里——
      顶栏里放得下图标，而它们改的是「这一页怎么显示」，不是阅读本身。
    -->
    <div class="group">
      <button
        class="icon"
        :class="{ on: mobile }"
        :title="mobile ? '切回电脑版网页' : '切换到手机版网页'"
        @click="toggleUa"
      >
        <Icon name="mobile" />
      </button>
      <button
        class="icon"
        :class="{ on: alwaysOnTop }"
        :title="alwaysOnTop ? '取消窗口置顶' : '窗口置顶'"
        @click="togglePin"
      >
        <Icon name="pin" />
      </button>
      <!--
        最大化：铺满当前显示器的工作区（不保 16:9）。
        最大化之后这条顶栏整个让位给网页，这一枚也跟着消失——
        退出那一步在右上角的还原键上（见 ChromeApp 的 .float）。
      -->
      <button class="icon" title="最大化（铺满工作区）" aria-label="最大化" @click="winMaximize">
        <Icon name="maximize" />
      </button>
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

/* 标签条那一块自己吃掉剩余宽度（见 TabStrip 的 .rest），这里不必再放占位 */

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
  /* 危险色在深色主题里是亮的（#ff8a8a），上面的字得跟着翻面 */
  color: var(--moyu-on-fill);
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
  border-radius: var(--moyu-radius-pill);
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

/*
 * 迷你档（窗口 480 宽）里把地址栏开关收成一个图标。
 *
 * 它占的 120px 是顶栏里最奢侈的一笔：那个宽度上域名本来就被截成「docs.claud…」，
 * 看得出来的一半信息标签条上也有一份。收掉它，标签条才拿得到放得下一个标签的
 * 地方——否则顶栏中间只剩一个光秃秃的数字，谁也不知道那是标签页。
 *
 * 阈值取在迷你档与 800 那一档之间：到了 800，这点宽度就不必省了。
 */
@media (max-width: 620px) {
  .address-toggle {
    width: 26px;
    min-width: 26px;
    padding: 0;
    gap: 0;
    justify-content: center;
  }

  .address-toggle .ellipsis {
    display: none;
  }
}
</style>
