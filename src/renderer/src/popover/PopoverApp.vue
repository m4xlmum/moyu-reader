<script setup lang="ts">
/**
 * 弹出面板。四种面板共用这一个组件，由 URL 的 ?kind= 决定内容。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onMounted, ref } from 'vue'
import type { Bookmark, HistoryEntry, PresetSite, SiteRecord } from '@shared/types'

type Kind = 'sites' | 'history' | 'bookmarks' | 'uaZoom'

const kind = (new URLSearchParams(location.search).get('kind') ?? 'sites') as Kind

const mySites = ref<SiteRecord[]>([])
const presets = ref<PresetSite[]>([])
const history = ref<HistoryEntry[]>([])
const bookmarks = ref<Bookmark[]>([])
const query = ref('')
const newSiteUrl = ref('')
const activeTabId = ref<string | null>(null)
const uaMode = ref<'desktop' | 'mobile'>('desktop')

const title = computed(
  () => ({ sites: '站点', history: '历史记录', bookmarks: '书签', uaZoom: '显示' })[kind]
)

onMounted(async () => {
  const tabsState = await window.moyu.tabs.list()
  activeTabId.value = tabsState.activeTabId
  const current = tabsState.tabs.find((t) => t.id === tabsState.activeTabId)
  uaMode.value = current?.uaMode ?? 'desktop'

  await refreshAll()
})

async function refreshAll(): Promise<void> {
  if (kind === 'sites') {
    mySites.value = await window.moyu.sites.list()
    presets.value = await window.moyu.sites.presets()
  } else if (kind === 'history') {
    history.value = await window.moyu.history.list({ query: query.value, limit: 200 })
  } else if (kind === 'bookmarks') {
    bookmarks.value = await window.moyu.bookmarks.list({ query: query.value })
  }
}

function open(url: string): void {
  const tabId = activeTabId.value
  if (!tabId) return
  void window.moyu.nav.goto({ tabId, input: url })
  void window.moyu.ui.closePopover()
}

async function addSite(): Promise<void> {
  const url = newSiteUrl.value.trim()
  if (!url) return
  mySites.value = await window.moyu.sites.add({ url })
  newSiteUrl.value = ''
}

async function removeSite(id: string, event: MouseEvent): Promise<void> {
  event.stopPropagation()
  mySites.value = await window.moyu.sites.remove({ id })
}

async function removeBookmark(id: string, event: MouseEvent): Promise<void> {
  event.stopPropagation()
  bookmarks.value = await window.moyu.bookmarks.remove({ id })
}

async function clearHistory(): Promise<void> {
  await window.moyu.history.clear()
  history.value = []
}

function setUa(mode: 'desktop' | 'mobile'): void {
  const tabId = activeTabId.value
  if (!tabId) return
  uaMode.value = mode
  void window.moyu.page.setUa({ tabId, mode })
}

function zoom(op: 'in' | 'out' | 'reset'): void {
  const tabId = activeTabId.value
  if (!tabId) return
  void window.moyu.page.setZoom({ tabId, op })
}
</script>

<template>
  <div class="panel">
    <header class="head">
      <span class="title">{{ title }}</span>
      <input
        v-if="kind === 'history' || kind === 'bookmarks'"
        v-model="query"
        class="search"
        type="text"
        placeholder="搜索"
        @input="refreshAll"
      />
      <button v-if="kind === 'history' && history.length" class="mini" @click="clearHistory">
        清空
      </button>
    </header>

    <div class="body">
      <!-- 站点 -->
      <template v-if="kind === 'sites'">
        <div class="add">
          <input
            v-model="newSiteUrl"
            type="text"
            placeholder="输入网址后回车添加"
            @keydown.enter="addSite"
          />
        </div>
        <div v-if="mySites.length" class="section">我的站点</div>
        <div v-for="site in mySites" :key="site.id" class="row" @click="open(site.url)">
          <span class="row-title">{{ site.title }}</span>
          <button class="mini" title="移除" @click="removeSite(site.id, $event)">✕</button>
        </div>
        <div class="section">热门站点</div>
        <div v-for="site in presets" :key="site.id" class="row" @click="open(site.url)">
          <span class="row-title">{{ site.title }}</span>
          <span class="tag">{{ site.category }}</span>
        </div>
      </template>

      <!-- 历史 -->
      <template v-else-if="kind === 'history'">
        <div v-if="!history.length" class="empty">暂无记录</div>
        <div v-for="item in history" :key="item.id" class="row" @click="open(item.url)">
          <span class="row-title">{{ item.title }}</span>
          <span v-if="item.visitCount > 1" class="tag">{{ item.visitCount }} 次</span>
        </div>
      </template>

      <!-- 书签 -->
      <template v-else-if="kind === 'bookmarks'">
        <div v-if="!bookmarks.length" class="empty">暂无书签</div>
        <div v-for="item in bookmarks" :key="item.id" class="row" @click="open(item.url)">
          <span class="row-title">{{ item.title }}</span>
          <button class="mini" title="移除" @click="removeBookmark(item.id, $event)">✕</button>
        </div>
      </template>

      <!-- 显示 -->
      <template v-else>
        <div class="section">访问方式</div>
        <div class="segmented">
          <button :class="{ on: uaMode === 'desktop' }" @click="setUa('desktop')">电脑模式</button>
          <button :class="{ on: uaMode === 'mobile' }" @click="setUa('mobile')">手机模式</button>
        </div>
        <p class="hint">切换后会重新加载页面。窄窗口下部分站点用手机版排版更合适。</p>
        <div class="section">页面缩放</div>
        <div class="segmented">
          <button @click="zoom('out')">缩小</button>
          <button @click="zoom('reset')">重置</button>
          <button @click="zoom('in')">放大</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--moyu-surface);
  border: 1px solid var(--moyu-border);
  border-radius: var(--moyu-radius);
  overflow: hidden;
  color: var(--moyu-text);
}

.head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--moyu-border);
}

.title {
  flex: 0 0 auto;
  font-weight: 600;
}

.search {
  flex: 1 1 auto;
  min-width: 40px;
  height: 22px;
  padding: 0 7px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--moyu-border);
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text);
  outline: none;
}

.body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px;
}

.section {
  padding: 8px 6px 4px;
  color: var(--moyu-text-faint);
  font-size: 11px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: var(--moyu-radius-sm);
  cursor: pointer;
}

.row:hover {
  background: var(--moyu-surface-hover);
}

.row-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  flex: 0 0 auto;
  color: var(--moyu-text-faint);
  font-size: 11px;
}

.mini {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-faint);
}

.mini:hover {
  color: var(--moyu-danger);
}

.add {
  padding: 4px 2px;
}

.add input {
  width: 100%;
  height: 26px;
  padding: 0 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--moyu-border);
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text);
  outline: none;
}

.add input:focus {
  border-color: var(--moyu-accent);
}

.segmented {
  display: flex;
  gap: 4px;
  padding: 0 6px;
}

.segmented button {
  flex: 1 1 0;
  height: 26px;
  border-radius: var(--moyu-radius-sm);
  background: rgba(0, 0, 0, 0.24);
  color: var(--moyu-text-dim);
}

.segmented button:hover {
  background: var(--moyu-surface-hover);
  color: var(--moyu-text);
}

.segmented button.on {
  background: var(--moyu-surface-active);
  color: var(--moyu-accent);
}

.hint {
  margin: 6px 8px 0;
  color: var(--moyu-text-faint);
  font-size: 11px;
  line-height: 1.5;
}

.empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--moyu-text-faint);
}
</style>
