<script setup lang="ts">
/**
 * 顶部菜单栏：前进后退、地址栏、标签页、窗口操作。
 *
 * 整条可拖动（-webkit-app-region: drag），其中的控件需标记 no-drag，
 * 否则点击会被当成拖动窗口起手。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, nextTick, ref, watch } from 'vue'
import { HOME_URL } from '@shared/constants'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, TabState } from '@shared/types'
import Icon from './Icon.vue'

const props = defineProps<{
  tabs: TabState[]
  activeTabId: string | null
  activeTab: TabState | null
  config: AppConfig | null
}>()

const emit = defineEmits<{ patch: [patch: ConfigPatch] }>()

const addressInput = ref('')
const editing = ref(false)

/**
 * 未编辑时地址栏跟随当前标签页；编辑时不抢用户的输入。
 * 首页是自家页面，它的 file:// 真实路径不该出现在界面上——
 * 那既不好看，也暴露了本机目录结构。首页一律显示为空白。
 */
watch(
  () => props.activeTab?.url,
  (url) => {
    if (editing.value) return
    addressInput.value = !url || url === HOME_URL ? '' : url
  },
  { immediate: true }
)

const uaMode = computed(() => props.activeTab?.uaMode ?? 'desktop')

function submitAddress(): void {
  const tabId = props.activeTabId
  if (!tabId) return
  const value = addressInput.value.trim()
  if (!value) return
  editing.value = false
  void window.moyu.nav.goto({ tabId, input: value })
}

async function newTab(): Promise<void> {
  await window.moyu.tabs.create({ activate: true })
  await nextTick()
  editing.value = true
}

function closeTab(tabId: string, event: MouseEvent): void {
  event.stopPropagation()
  void window.moyu.tabs.close({ tabId })
}

function toggleUa(): void {
  const tabId = props.activeTabId
  if (!tabId) return
  const next = uaMode.value === 'mobile' ? 'desktop' : 'mobile'
  void window.moyu.page.setUa({ tabId, mode: next })
}

function togglePin(): void {
  const cfg = props.config
  if (!cfg) return
  emit('patch', { window: { alwaysOnTop: !cfg.window.alwaysOnTop } })
}

function toggleMini(): void {
  const cfg = props.config
  if (!cfg) return
  void window.moyu.win.toggleMini({ enabled: !cfg.window.miniMode })
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

    <!-- 地址栏 -->
    <input
      v-model="addressInput"
      class="address moyu-no-drag"
      type="text"
      placeholder="输入网址或搜索"
      spellcheck="false"
      @focus="editing = true"
      @blur="editing = false"
      @keydown.enter="submitAddress"
    />

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

    <!-- 窗口操作 -->
    <div class="group moyu-no-drag">
      <button
        class="icon"
        :class="{ on: uaMode === 'mobile' }"
        title="切换手机/电脑模式"
        @click="toggleUa"
      >
        手机
      </button>
      <button
        class="icon"
        :class="{ on: config?.window.alwaysOnTop }"
        title="置顶"
        @click="togglePin"
      >
        置顶
      </button>
      <button
        class="icon"
        :class="{ on: config?.window.miniMode }"
        title="迷你模式"
        @click="toggleMini"
      >
        迷你
      </button>
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
  padding: 0 8px;
  background: var(--moyu-surface);
  border-bottom: 1px solid var(--moyu-hairline);
}

.group {
  display: flex;
  align-items: center;
  gap: 1px;
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

/* 地址栏做成浏览器的地址框：浅底圆角，而不是一条下划线 */
.address {
  flex: 1 1 auto;
  min-width: 50px;
  height: 26px;
  padding: 0 12px;
  background: var(--moyu-surface-hover);
  border: 1px solid transparent;
  border-radius: var(--moyu-radius);
  color: var(--moyu-ink);
  outline: none;
  transition: background 120ms ease-out, border-color 120ms ease-out;
}

.address::placeholder {
  color: var(--moyu-text-faint);
}

.address:hover {
  background: var(--moyu-surface-active);
}

.address:focus {
  background: var(--moyu-surface);
  border-color: var(--moyu-accent);
  box-shadow: 0 0 0 2px var(--moyu-accent-soft);
}

/* 焦点不能只靠颜色：低透明度下背景与描边的变化不足以定位 */
.address:focus-visible {
  outline: 2px solid var(--moyu-accent);
  outline-offset: 1px;
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
