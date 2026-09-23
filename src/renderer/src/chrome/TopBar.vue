<script setup lang="ts">
/**
 * 顶部菜单栏：导航、地址栏开关、标签页、窗口操作。
 *
 * 地址栏本身不在这里——它默认折叠，展开时是顶栏下方独立的一行。
 * 这里只留一个开关，兼作「当前在哪」的一眼可见处。
 *
 * 整条可拖动（-webkit-app-region: drag），其中的控件需标记 no-drag，
 * 否则点击会被当成拖动窗口起手。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed } from 'vue'
import { HOME_URL } from '@shared/constants'
import type { TabState } from '@shared/types'
import Icon from './Icon.vue'

const props = defineProps<{
  tabs: TabState[]
  activeTabId: string | null
  activeTab: TabState | null
  /** 地址栏当前是否展开，来自主进程回传的窗口状态 */
  addressOpen: boolean
}>()

/**
 * 当前页的域名，显示在地址栏开关上。
 *
 * 首页是自家页面，它的 file:// 真实路径不该出现在界面上——
 * 那既不好看，也暴露了本机目录结构。
 */
const siteLabel = computed(() => {
  const url = props.activeTab?.url
  if (!url || url === HOME_URL) return '起始页'
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
})

async function newTab(): Promise<void> {
  await window.moyu.tabs.create({ activate: true })
}

function closeTab(tabId: string, event: MouseEvent): void {
  event.stopPropagation()
  void window.moyu.tabs.close({ tabId })
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

function activateTab(tabId: string): void {
  void window.moyu.tabs.activate({ tabId })
}

function winMinimize(): void {
  void window.moyu.win.minimize()
}

function winHide(): void {
  void window.moyu.win.hideToTray()
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
      <span class="site">{{ siteLabel }}</span>
    </button>

    <!-- 标签页 -->
    <div v-if="tabs.length > 1" class="tabs moyu-no-drag">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeTabId }"
        :title="tab.title"
        @click="activateTab(tab.id)"
        @mousedown.middle="closeTab(tab.id, $event)"
      >
        <span class="tab-title">{{ tab.title || '新标签页' }}</span>
        <span class="tab-close" title="关闭标签页" @click="closeTab(tab.id, $event)">
          <Icon name="close" :size="11" />
        </span>
      </button>
    </div>

    <button class="icon moyu-no-drag" title="新建标签页" @click="newTab">
      <Icon name="plus" />
    </button>

    <div class="spacer" />

    <!-- 窗口操作 -->
    <div class="group moyu-no-drag">
      <button class="icon" title="最小化（老板键 1）" @click="winMinimize">
        <Icon name="minimize" />
      </button>
      <button class="icon" title="藏进托盘（老板键 2）" @click="winHide">
        <Icon name="tray" />
      </button>
      <button class="icon danger" title="关闭（藏进托盘，不退出）" @click="winClose">
        <Icon name="close" />
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
  /* 球停在顶栏两端时给它留出槽位，避免压住导航或窗口按钮 */
  padding: 0 calc(8px + var(--ball-gutter-right, 0px)) 0 calc(8px + var(--ball-gutter-left, 0px));
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

.icon.danger:hover {
  color: #ffffff;
  background: var(--moyu-danger);
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

.site {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tabs {
  display: flex;
  gap: 2px;
  max-width: 34%;
  overflow-x: auto;
  overflow-y: hidden;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  max-width: 130px;
  padding: 0 4px 0 9px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  flex: 0 0 auto;
  transition: background 120ms ease-out, color 120ms ease-out;
}

.tab:hover {
  background: var(--moyu-surface-hover);
  color: var(--moyu-ink);
}

.tab.active {
  background: var(--moyu-surface-active);
  color: var(--moyu-ink);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--moyu-radius-sm);
  opacity: 0;
  color: var(--moyu-text-dim);
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 0.75;
}

.tab-close:hover {
  opacity: 1;
  background: var(--moyu-surface-active);
  color: var(--moyu-danger);
}
</style>
