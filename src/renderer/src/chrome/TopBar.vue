<script setup lang="ts">
/**
 * 顶部功能栏：导航、地址栏开关、标签页、悬浮球、窗口操作。
 *
 * 地址栏本身不在这里——它默认折叠，展开时是顶栏下方独立的一行。
 * 这里只留一个开关，兼作「当前在哪」的一眼可见处。
 *
 * 标签条与它的让位（窗口窄时退回下拉清单）都在 TabStrip 里，
 * 那一条要按实测宽度决定自己让不让位，是顶栏里唯一需要知道自己有多宽的东西。
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
import TabStrip from './TabStrip.vue'

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

    <!--
      标签条。它自己占住中间那一整块，也自己决定放不下时退回下拉清单，
      新建按钮跟着它走——浏览器里那个「+」也是挨着最后一个标签。
    -->
    <TabStrip :tabs="tabs" :active-tab-id="activeTabId">
      <button class="icon" title="新建标签页" @click="newTab">
        <Icon name="plus" />
      </button>
    </TabStrip>

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
