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
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, TabState } from '@shared/types'

const props = defineProps<{
  tabs: TabState[]
  activeTabId: string | null
  activeTab: TabState | null
  config: AppConfig | null
}>()

const emit = defineEmits<{ patch: [patch: ConfigPatch] }>()

const addressInput = ref('')
const editing = ref(false)

/** 未编辑时地址栏跟随当前标签页；编辑时不抢用户的输入 */
watch(
  () => props.activeTab?.url,
  (url) => {
    if (!editing.value) addressInput.value = url ?? ''
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
</script>

<template>
  <header class="topbar moyu-drag">
    <!-- 导航 -->
    <div class="group moyu-no-drag">
      <button class="icon" title="后退" :disabled="!activeTab?.canGoBack" @click="navBack">
        ←
      </button>
      <button class="icon" title="前进" :disabled="!activeTab?.canGoForward" @click="navForward">
        →
      </button>
      <button class="icon" title="刷新" @click="navReload">⟳</button>
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
        <span class="tab-close" title="关闭标签页" @click="closeTab(tab.id, $event)">✕</span>
      </button>
    </div>

    <button class="icon moyu-no-drag" title="新建标签页" @click="newTab">＋</button>

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
      <button class="icon" title="最小化（老板键 1）" @click="winMinimize">—</button>
      <button class="icon" title="藏进托盘（老板键 2）" @click="winHide">⤓</button>
      <button class="icon danger" title="关闭（藏进托盘，不退出）" @click="winClose">✕</button>
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
  padding: 0 6px;
  background: var(--moyu-surface);
  border-bottom: 1px solid var(--moyu-border);
}

.group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.icon {
  height: 22px;
  min-width: 22px;
  padding: 0 5px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  white-space: nowrap;
}

.icon:hover:not(:disabled) {
  background: var(--moyu-surface-hover);
  color: var(--moyu-text);
}

.icon.on {
  color: var(--moyu-accent);
}

.icon.danger:hover {
  color: var(--moyu-danger);
}

.address {
  flex: 1 1 auto;
  min-width: 50px;
  height: 22px;
  padding: 0 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--moyu-border);
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text);
  outline: none;
}

.address:focus {
  border-color: var(--moyu-accent);
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
  height: 22px;
  max-width: 110px;
  padding: 0 4px 0 7px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  background: rgba(0, 0, 0, 0.2);
  flex: 0 0 auto;
}

.tab.active {
  background: var(--moyu-surface-active);
  color: var(--moyu-text);
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  opacity: 0;
  font-size: 10px;
}

.tab:hover .tab-close {
  opacity: 0.7;
}

.tab-close:hover {
  opacity: 1;
  color: var(--moyu-danger);
}
</style>
