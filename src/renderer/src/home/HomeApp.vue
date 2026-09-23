<script setup lang="ts">
/**
 * 起始页：一份数据，两套世界。
 *
 * 主题决定的不只是配色，还有这一页披哪一层皮（见 @shared/constants 的
 * HOME_THEMES 与 worldOfTheme）：
 * - modern   行式列表，纸白与暗夜 → StartModern
 * - terminal 命令行，磷绿 → StartTerminal
 *
 * 两套世界的**划分与交互是同一套**（页眉 / 输入行 / 内容行 / 状态行，
 * 见 useRows）：换主题换的是观感，不是这一页怎么用。
 *
 * 这一层只管数据与动作：站点从哪来、继续上次打开哪一篇、回车去哪、主题怎么落盘。
 * 至于画成什么样、一屏放得下几行，交给两套世界各自按实测尺寸算——
 * 只有它们知道自己的行有多高、盒子里还剩多少地方。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { DEFAULT_HOME_THEME, worldOfTheme, type HomeTheme } from '@shared/constants'
import { PRESET_SITES } from '@shared/presets'
import { registrableDomain, hostOf, resolveInput } from '@shared/url'
import type { AppConfig, Bookmark, HistoryEntry, SiteRecord, TabState } from '@shared/types'
import StartModern from './StartModern.vue'
import StartTerminal from './StartTerminal.vue'
import { useBox } from './useBox'
import { rowsOf } from './useRows'
import type { HomeTile } from './types'

const mySites = ref<SiteRecord[]>([])
const history = ref<HistoryEntry[]>([])
const bookmarks = ref<Bookmark[]>([])
const config = ref<AppConfig | null>(null)
const query = ref('')
/** 起始页主题，见 config.ui.homeTheme */
const theme = ref<HomeTheme>(DEFAULT_HOME_THEME)
/** 开着几张标签页。两套世界的页眉都要报这个数 */
const tabCount = ref(0)

let offConfig: (() => void) | null = null
let offTabs: (() => void) | null = null

const world = computed(() => worldOfTheme(theme.value))

const page = useTemplateRef<HTMLElement>('page')
const { h: pageH } = useBox(page)
/**
 * 紧凑形态。
 *
 * 用实测高度分档，而不是媒体查询：这一页在窗口里占多高，取决于顶栏与地址栏
 * 开着没有，只有量出来才知道。360 这个界：迷你档的正文区只有 232 高，必须收；
 * 小号档有 406，还宽裕。
 */
const compact = computed(() => pageH.value < 360)

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  const host = hostOf(url)
  return host ? registrableDomain(host) : null
}

onMounted(async () => {
  config.value = await window.moyu.config.get()
  applyTheme(config.value.ui.homeTheme)
  offConfig = window.moyu.config.onChanged((next) => {
    config.value = next
    // 主题也可能是在系统设置里改的，那条路上只有这条广播会通知到这里
    applyTheme(next.ui.homeTheme)
  })

  const applyTabs = (payload: { tabs: TabState[]; activeTabId: string | null }): void => {
    tabCount.value = payload.tabs.length
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

// ---------------------------------------------------------------- 站点编排

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

/**
 * 候选站点。
 *
 * 顺序即优先级：自己固定的 → 常访问的 → 预置的热门站点。
 *
 * 上限只是防着一份用了很久的历史把 DOM 撑起来：任何一档窗口都显示不了这么多行，
 * 因此这个截断不会被看见。
 */
const MAX_TILES = 36

const tiles = computed<HomeTile[]>(() => {
  const seen = new Set<string>()
  const out: HomeTile[] = []

  const push = (name: string, url: string, key: string): void => {
    const domain = domainOf(url)
    if (!domain || seen.has(domain)) return
    seen.add(domain)
    out.push({ key, name, url, domain, icon: iconByDomain.value.get(domain) })
  }

  for (const site of mySites.value) push(site.title, site.url, site.id)
  for (const entry of mostVisited.value) push(entry.title || entry.url, entry.url, entry.id)
  for (const preset of PRESET_SITES) push(preset.title, preset.url, preset.id)

  return out.slice(0, MAX_TILES)
})

const lastRead = computed<HistoryEntry | null>(() => history.value[0] ?? null)

/**
 * 两套世界共用的一份行：继续上次在最前，其后是站点。
 *
 * 在这里建一次而不是交给两套世界各建一次——它们要的就是同一份东西，
 * 各建一遍只能多出两处会分家的地方。
 */
const rows = computed(() => rowsOf(tiles.value, lastRead.value))

// ---------------------------------------------------------------- 动作

/**
 * 打开一个站点。
 *
 * 起始页始终留在原处，新站点另开一张标签页。
 */
function open(url: string): void {
  void window.moyu.tabs.create({ url, activate: true })
}

/**
 * 把输入框里的东西交出去。
 *
 * 是网址就打开它，是别的话就按搜索引擎搜——这层判断在主进程那边统一做
 * （resolveInput），两套世界因此都不必自己认网址。
 */
function submit(text: string): void {
  const value = text.trim()
  if (!value) return
  open(resolveInput(value, config.value?.browser.searchTemplate ?? ''))
  query.value = ''
}

function resume(): void {
  const last = lastRead.value
  if (!last) return
  open(last.url)
}

// ---------------------------------------------------------------- 主题

/**
 * 主题与形态都写在 html 的属性上，样式表按属性挑变量组（见 styles/home.css）。
 *
 * 不绑 class：属性选择器在样式表里更直白，也不会与作用域样式打架——
 * 作用域样式会给选择器末尾补一个 data-v 属性，属性选择器不参与那套改写。
 */
function applyTheme(next: HomeTheme): void {
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.dataset.world = worldOfTheme(next)
}

/**
 * 选一个主题。
 *
 * 先落地再持久化：换主题是一次视觉反馈，不该等一趟 IPC 往返才看到效果。
 * 配置更新后主进程会广播回来，那条路也会再调一次 applyTheme——幂等，不冲突。
 */
function pickTheme(next: HomeTheme): void {
  applyTheme(next)
  void window.moyu.config.patch({ ui: { homeTheme: next } })
}
</script>

<template>
  <div ref="page" class="page">
    <StartModern
      v-if="world === 'modern'"
      :rows="rows"
      :site-count="tiles.length"
      :tab-count="tabCount"
      :query="query"
      :theme="theme"
      :compact="compact"
      @open="open"
      @resume="resume"
      @submit="submit"
      @pick="pickTheme"
      @update:query="query = $event"
    />
    <StartTerminal
      v-else
      :rows="rows"
      :site-count="tiles.length"
      :tab-count="tabCount"
      :query="query"
      :theme="theme"
      :compact="compact"
      @open="open"
      @resume="resume"
      @submit="submit"
      @pick="pickTheme"
      @update:query="query = $event"
    />
  </div>
</template>

<style scoped>
/*
 * 这一层是两套世界共同的地。
 *
 * 主题切换只换这里的颜色，两套世界各自也画一层底（理由见 styles/settings.css
 * 开头：自家页面的底板要画在自己身上，不能只挂在 html/body 上）。
 */
.page {
  width: 100%;
  height: 100%;
  background: var(--ground);
  overflow: hidden;
}
</style>
