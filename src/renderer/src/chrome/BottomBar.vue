<script setup lang="ts">
/**
 * 底部工具栏：站点入口、透明度、区域开关、个人中心。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, TabState, ZoneState } from '@shared/types'
import OpacitySlider from './OpacitySlider.vue'
import ZoneToggles from './ZoneToggles.vue'

const props = defineProps<{
  zones: ZoneState
  config: AppConfig | null
  activeTab: TabState | null
}>()

const emit = defineEmits<{
  patch: [patch: ConfigPatch]
  applyZones: [zones: ZoneState]
}>()

type PopoverKind = 'sites' | 'history' | 'bookmarks' | 'uaZoom'

/** 面板锚点取自按钮自身的位置，主进程据此把它摆在按钮附近 */
function openPopover(kind: PopoverKind, event: MouseEvent): void {
  const el = event.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  void window.moyu.ui.openPopover({
    kind,
    anchorRect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
  })
}

function setOpacity(value: number): void {
  void window.moyu.win.setOpacity({ value })
}

function zoom(op: 'in' | 'out' | 'reset'): void {
  const tabId = props.activeTab?.id
  if (!tabId) return
  void window.moyu.page.setZoom({ tabId, op })
}

function bookmarkCurrent(): void {
  const tab = props.activeTab
  if (!tab || !tab.url || tab.url === 'about:blank') return
  void window.moyu.bookmarks.add({
    title: tab.title || tab.url,
    url: tab.url,
    faviconUrl: tab.faviconUrl
  })
}

// 模板里的 window 指向组件实例而非全局对象，因此全局调用都要包一层方法
function openSettings(): void {
  void window.moyu.ui.openSettings()
}
</script>

<template>
  <footer class="bottombar moyu-drag">
    <div class="group moyu-no-drag">
      <button class="tool" title="我的站点 / 热门站点" @click="openPopover('sites', $event)">
        站点
      </button>
      <button class="tool" title="历史记录" @click="openPopover('history', $event)">历史</button>
      <button class="tool" title="书签" @click="openPopover('bookmarks', $event)">书签</button>
      <button class="tool" title="收藏当前页面" @click="bookmarkCurrent">收藏</button>
    </div>

    <div class="group moyu-no-drag">
      <button class="tool" title="缩小" @click="zoom('out')">－</button>
      <button class="tool" title="重置缩放" @click="zoom('reset')">
        {{ Math.round((activeTab?.zoom ?? 1) * 100) }}%
      </button>
      <button class="tool" title="放大" @click="zoom('in')">＋</button>
    </div>

    <OpacitySlider :model-value="config?.window.opacity ?? 1" @update:model-value="setOpacity" />

    <ZoneToggles :zones="zones" @change="(z) => emit('applyZones', z)" />

    <button class="tool moyu-no-drag" title="个人中心" @click="openSettings">设置</button>
  </footer>
</template>

<style scoped>
.bottombar {
  flex: 0 0 auto;
  height: var(--moyu-bottom-h);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  background: var(--moyu-surface);
  border-top: 1px solid var(--moyu-border);
  overflow-x: auto;
  overflow-y: hidden;
}

.group {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}

.tool {
  height: 22px;
  padding: 0 6px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  white-space: nowrap;
}

.tool:hover {
  background: var(--moyu-surface-hover);
  color: var(--moyu-text);
}
</style>
