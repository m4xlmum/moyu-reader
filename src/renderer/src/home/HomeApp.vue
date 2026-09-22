<script setup lang="ts">
/**
 * 首页：浏览器起始页。
 *
 * 品类标准做法——居中的搜索框、下方等距的站点磁贴、大量留白、界面退到内容之后。
 * 站点顺序遵循浏览器的惯例：自己固定的排在前面，其次是常访问的，最后是预置的热门站点。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { HOME_URL } from '@shared/constants'
import { PRESET_SITES } from '@shared/presets'
import { registrableDomain, hostOf, resolveInput } from '@shared/url'
import type { AppConfig, Bookmark, HistoryEntry, SiteRecord, TabState } from '@shared/types'
import Icon from '../chrome/Icon.vue'

const mySites = ref<SiteRecord[]>([])
const history = ref<HistoryEntry[]>([])
const bookmarks = ref<Bookmark[]>([])
const config = ref<AppConfig | null>(null)
const query = ref('')
const focused = ref(false)

/** 当前正在别处打开着的站点，用于给对应磁贴加一圈强调色 */
const currentDomain = ref<string | null>(null)
const resumeLit = ref(false)

let offConfig: (() => void) | null = null
let offTabs: (() => void) | null = null

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  const host = hostOf(url)
  return host ? registrableDomain(host) : null
}

onMounted(async () => {
  config.value = await window.moyu.config.get()
  offConfig = window.moyu.config.onChanged((next) => {
    config.value = next
  })

  const applyTabs = (payload: { tabs: TabState[]; activeTabId: string | null }): void => {
    const guests = payload.tabs.filter((t) => t.url && t.url !== HOME_URL)
    const active = guests.find((t) => t.id === payload.activeTabId)
    currentDomain.value = domainOf((active ?? guests[guests.length - 1])?.url)
  }
  applyTabs(await window.moyu.tabs.list())
  offTabs = window.moyu.tabs.onState(applyTabs)

  await reload()
})

onUnmounted(() => {
  offConfig?.()
  offTabs?.()
})

async function reload(): Promise<void> {
  const [sites, hist, marks] = await Promise.all([
    window.moyu.sites.list(),
    window.moyu.history.list({ limit: 200 }),
    window.moyu.bookmarks.list()
  ])
  mySites.value = sites
  history.value = hist
  bookmarks.value = marks
}

// ---------------------------------------------------------------- 磁贴编排

interface Tile {
  key: string
  name: string
  url: string
  domain: string
  icon?: string
}

/** 域名 → 图标地址。历史与书签里存过图标的，直接复用，这是浏览器的做法 */
const iconByDomain = computed(() => {
  const map = new Map<string, string>()
  for (const entry of [...history.value, ...bookmarks.value]) {
    const domain = domainOf(entry.url)
    const icon = 'faviconUrl' in entry ? entry.faviconUrl : undefined
    if (domain && icon && !map.has(domain)) map.set(domain, icon)
  }
  return map
})

/** 按访问次数排序的常访问站点 */
const mostVisited = computed(() => {
  const byDomain = new Map<string, HistoryEntry>()
  for (const entry of history.value) {
    const domain = domainOf(entry.url)
    if (!domain) continue
    const existing = byDomain.get(domain)
    if (!existing || entry.visitCount > existing.visitCount) byDomain.set(domain, entry)
  }
  return [...byDomain.values()].sort((a, b) => b.visitCount - a.visitCount)
})

const tiles = computed<Tile[]>(() => {
  const seen = new Set<string>()
  const out: Tile[] = []

  const push = (name: string, url: string, key: string): void => {
    const domain = domainOf(url)
    if (!domain || seen.has(domain)) return
    seen.add(domain)
    out.push({ key, name, url, domain, icon: iconByDomain.value.get(domain) })
  }

  // 顺序即优先级：自己固定的 → 常访问的 → 预置的热门站点
  for (const site of mySites.value) push(site.title, site.url, site.id)
  for (const entry of mostVisited.value) push(entry.title || entry.url, entry.url, entry.id)
  for (const preset of PRESET_SITES) push(preset.title, preset.url, preset.id)

  return out.slice(0, 18)
})

function initialOf(name: string): string {
  return [...name.trim()][0] ?? '·'
}

const lastRead = computed<HistoryEntry | null>(() => history.value[0] ?? null)

// ---------------------------------------------------------------- 动作

/**
 * 打开一个站点。
 *
 * 先把当前站点指到这个磁贴上，再开标签页——反馈必须发生在点击这一刻。
 * 首页始终留在原处，新站点另开一张标签页。
 */
function open(url: string): void {
  currentDomain.value = domainOf(url)
  void window.moyu.tabs.create({ url, activate: true })
}

function submitQuery(): void {
  const value = query.value.trim()
  if (!value) return
  open(resolveInput(value, config.value?.browser.searchTemplate ?? ''))
  query.value = ''
}

function resume(): void {
  const last = lastRead.value
  if (!last) return
  resumeLit.value = true
  window.setTimeout(() => (resumeLit.value = false), 500)
  open(last.url)
}
</script>

<template>
  <div class="start">
    <div class="column">
      <div class="wordmark">摸鱼阅读</div>

      <form class="search" :class="{ focused }" @submit.prevent="submitQuery">
        <Icon name="search" :size="17" />
        <input
          v-model="query"
          type="text"
          placeholder="输入网址，或输入关键词搜索"
          spellcheck="false"
          @focus="focused = true"
          @blur="focused = false"
        />
      </form>

      <button v-if="lastRead" class="resume" :class="{ lit: resumeLit }" @click="resume">
        <span class="resume-text">继续上次：{{ lastRead.title || lastRead.url }}</span>
        <Icon name="arrow-right" :size="14" />
      </button>
      <div v-else class="resume-placeholder" />

      <div class="shortcuts">
        <button
          v-for="tile in tiles"
          :key="tile.key"
          class="tile"
          :class="{ current: tile.domain === currentDomain }"
          :title="tile.url"
          @click="open(tile.url)"
        >
          <span class="favicon">
            <img v-if="tile.icon" :src="tile.icon" alt="" @error="($event.target as HTMLImageElement).style.display = 'none'" />
            <span v-else class="initial">{{ initialOf(tile.name) }}</span>
          </span>
          <span class="tile-label">{{ tile.name }}</span>
        </button>
      </div>

      <p class="footnote">Alt+Z 最小化 · Alt+X 藏进托盘</p>
    </div>
  </div>
</template>

<style scoped>
.start {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--ground);
  display: flex;
  justify-content: center;
  overflow: hidden;
}

.column {
  width: 100%;
  max-width: 760px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 搜索框落在偏上位置：与浏览器起始页一致，给下方磁贴留出稳定的重心 */
  padding-top: 6%;
}

/* ---------------------------------------------------------------- 标识与搜索 */

/* 起始页的标识是这个页面唯一的品牌时刻，尺度该由它占住 */
.wordmark {
  font-size: 30px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--text);
  margin-bottom: 26px;
}

.search {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 46px;
  padding: 0 20px;
  border: 1px solid var(--divider-strong);
  border-radius: var(--radius-pill);
  background: var(--ground);
  color: var(--text-secondary);
  transition: box-shadow 140ms ease-out, border-color 140ms ease-out;
}

.search:hover {
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.1);
}

.search.focused {
  border-color: transparent;
  box-shadow: 0 1px 6px rgba(17, 24, 39, 0.16);
}

.search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
}

.search input::placeholder {
  color: var(--text-tertiary);
}

/* 焦点环由包裹层承担，输入框自身不画第二道 */
.search input:focus-visible {
  outline: none;
}

.search:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---------------------------------------------------------------- 继续上次 */

.resume {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin-top: 14px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  transition: background 120ms ease-out, color 120ms ease-out;
}

.resume:hover {
  background: var(--ground-hover);
  color: var(--text);
}

.resume.lit {
  background: var(--accent-soft);
  color: var(--accent);
}

.resume-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resume-placeholder {
  height: 26px;
  margin-top: 14px;
}

/* ---------------------------------------------------------------- 站点磁贴 */

.shortcuts {
  width: 100%;
  margin-top: 26px;
  display: grid;
  grid-template-columns: repeat(auto-fill, 84px);
  justify-content: center;
  gap: 8px 4px;
  overflow-y: auto;
  max-height: 100%;
  padding-bottom: 4px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  border-radius: var(--radius);
  transition: background 120ms ease-out;
}

.tile:hover {
  background: var(--ground-hover);
}

.tile:active {
  background: var(--ground-active);
}

.favicon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--tile);
  overflow: hidden;
}

.favicon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

/* 没有图标时用首字占位，与浏览器的做法一致 */
.initial {
  font-size: 16px;
  color: var(--text-secondary);
}

.tile.current .favicon {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1.5px var(--accent);
}

.tile.current .initial {
  color: var(--accent);
}

.tile-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.tile:hover .tile-label,
.tile.current .tile-label {
  color: var(--text);
}

/* ---------------------------------------------------------------- 脚注 */

.footnote {
  margin: 18px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
}

/* ---------------------------------------------------------------- 紧凑高度 */

/* 迷你模式下纵向空间极少：脚注让位，磁贴收紧 */
@media (max-height: 400px) {
  .column {
    padding-top: 14px;
  }

  .wordmark {
    font-size: 19px;
    margin-bottom: 10px;
  }

  .search {
    height: 36px;
  }

  .resume,
  .resume-placeholder {
    margin-top: 8px;
  }

  .shortcuts {
    margin-top: 12px;
    grid-template-columns: repeat(auto-fill, 68px);
  }

  .favicon {
    width: 32px;
    height: 32px;
  }

  .footnote {
    display: none;
  }
}
</style>
