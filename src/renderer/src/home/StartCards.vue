<script setup lang="ts">
/**
 * 起始页的现代世界：卡片排版。
 *
 * 参照仍是 Chrome / Edge 的新标签页——中性底色、克制的分隔线、一个强调色、
 * 大量留白，界面不抢内容。区别在于这一版把「继续上次」提成了一张卡片：
 * 这个应用的用途是读东西，回到刚才那篇是这个页面上最常发生的一件事。
 *
 * 磁贴不靠 CSS 裁：先按实测尺寸算出这一档能放几行几列，再多出来的不渲染。
 * 迷你档（正文区 432×232）只能放一行，那一行就是一行。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, useTemplateRef } from 'vue'
import type { HistoryEntry } from '@shared/types'
import Icon from '../chrome/Icon.vue'
import ThemeMenu from './ThemeMenu.vue'
import { useBox } from './useBox'
import type { HomeTile } from './types'
import type { HomeTheme } from '@shared/constants'

const props = defineProps<{
  tiles: HomeTile[]
  lastRead: HistoryEntry | null
  query: string
  theme: HomeTheme
  compact: boolean
}>()

const emit = defineEmits<{
  open: [url: string]
  resume: []
  submit: [text: string]
  pick: [theme: HomeTheme]
  'update:query': [value: string]
}>()

/** 磁贴格子的尺寸（含间距）。紧凑档整体缩一号 */
const CELL = computed(() => (props.compact ? { col: 68, row: 64 } : { col: 84, row: 84 }))
const GAP = 4

/**
 * 格子尺寸写在 CSS 变量里，样式表拿去画网格。
 *
 * 这一个数有两处要用：网格怎么排（CSS），和能放几行几列（下面的算式）。
 * 抄成两份迟早会分家——改了样式忘了改算式，就会出现半行磁贴。
 */
const gridVars = computed(() => ({
  '--cell-col': `${CELL.value.col}px`,
  '--cell-row': `${CELL.value.row}px`
}))

const area = useTemplateRef<HTMLElement>('area')
const { w: areaW, h: areaH } = useBox(area)

/** n 个格子占 n*(size+GAP)-GAP，反解得 n ≤ (h+GAP)/(size+GAP) */
const columns = computed(() =>
  Math.max(1, Math.floor((areaW.value + GAP) / (CELL.value.col + GAP)))
)
const rows = computed(() => Math.max(1, Math.floor((areaH.value + GAP) / (CELL.value.row + GAP))))

const visible = computed(() => props.tiles.slice(0, columns.value * rows.value))

function initialOf(name: string): string {
  return [...name.trim()][0] ?? '·'
}
</script>

<template>
  <div class="cards" :class="{ compact }" :style="gridVars">
    <header class="head">
      <span class="wordmark">摸鱼阅读</span>
      <ThemeMenu variant="cards" :theme="theme" @pick="emit('pick', $event)" />
    </header>

    <form class="search" @submit.prevent="emit('submit', query)">
      <Icon name="search" :size="compact ? 14 : 16" />
      <input
        :value="query"
        type="text"
        :placeholder="compact ? '输入网址或关键词' : '输入网址，或输入关键词搜索'"
        spellcheck="false"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
    </form>

    <!--
      继续上次。没有可继续的就留一块同高的空位，而不是把下面的磁贴顶上来：
      版面每次打开都跳一下，比少一张卡片更让人分心。
    -->
    <button v-if="lastRead" class="hero" @click="emit('resume')">
      <span class="hero-label">继续上次</span>
      <span class="hero-title">{{ lastRead.title || lastRead.url }}</span>
      <Icon name="arrow-right" :size="compact ? 13 : 15" />
    </button>
    <div v-else class="hero empty" aria-hidden="true" />

    <div ref="area" class="tiles">
      <button
        v-for="tile in visible"
        :key="tile.key"
        class="tile"
        :title="tile.url"
        @click="emit('open', tile.url)"
      >
        <span class="favicon">
          <img
            v-if="tile.icon"
            :src="tile.icon"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span v-else class="initial">{{ initialOf(tile.name) }}</span>
        </span>
        <span class="tile-label">{{ tile.name }}</span>
      </button>
    </div>

    <p class="foot">Alt+Z 最小化 · Alt+X 藏进托盘</p>
  </div>
</template>

<style scoped>
.cards {
  width: 100%;
  height: 100%;
  background: var(--ground);
  display: flex;
  flex-direction: column;
  padding: 28px 24px 14px;
  /* 页面本身就是底板；窄了不要横向滚，宁可少放两个磁贴 */
  overflow: hidden;
}

.cards.compact {
  padding: 12px 16px 10px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wordmark {
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--text);
  /* 标识折行就不是标识了；挤不下时宁可挤旁边的主题菜单 */
  flex: 0 0 auto;
  white-space: nowrap;
}

.cards.compact .wordmark {
  font-size: 16px;
}

/* ---------------------------------------------------------------- 搜索 */

.search {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 42px;
  margin-top: 14px;
  padding: 0 16px;
  border: 1px solid var(--divider-strong);
  border-radius: var(--radius-pill);
  background: var(--ground);
  color: var(--text-secondary);
  transition: box-shadow 140ms ease-out, border-color 140ms ease-out;
}

.cards.compact .search {
  height: 32px;
  margin-top: 10px;
  padding: 0 12px;
}

.search:hover {
  box-shadow: 0 1px 4px rgba(17, 24, 39, 0.1);
}

.search:focus-within {
  border-color: transparent;
  box-shadow: 0 1px 6px rgba(17, 24, 39, 0.16);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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

.cards.compact .search input {
  font-size: 13px;
}

.search input::placeholder {
  color: var(--text-tertiary);
}

/* 焦点环由包裹层承担，输入框自身不画第二道 */
.search input:focus-visible {
  outline: none;
}

/* ---------------------------------------------------------------- 继续上次 */

.hero {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 52px;
  margin-top: 16px;
  padding: 0 16px;
  border: 1px solid var(--divider);
  border-radius: var(--radius);
  background: var(--ground-hover);
  color: var(--text-secondary);
  text-align: left;
  transition: border-color 120ms ease-out, background 120ms ease-out;
}

.cards.compact .hero {
  height: 34px;
  margin-top: 8px;
  padding: 0 10px;
  gap: 8px;
}

.hero.empty {
  border-style: dashed;
  background: none;
}

.hero:not(.empty):hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.hero-label {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--text-tertiary);
}

.cards:not(.compact) .hero-label {
  /* 宽松档里这一行是卡片的小标题，独占一行 */
  font-size: 11px;
  letter-spacing: 0.04em;
}

.hero-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--text);
}

.cards:not(.compact) .hero {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  position: relative;
}

.cards:not(.compact) .hero-title {
  width: 100%;
}

.cards:not(.compact) .hero :deep(.icon-svg) {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
}

/* ---------------------------------------------------------------- 站点磁贴 */

.tiles {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, var(--cell-col));
  grid-auto-rows: var(--cell-row);
  justify-content: center;
  align-content: start;
  gap: 4px;
  overflow: hidden;
}

.cards.compact .tiles {
  margin-top: 8px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius);
  transition: background 120ms ease-out;
}

.cards.compact .tile {
  gap: 6px;
}

.tile:hover {
  background: var(--ground-hover);
}

.favicon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--tile);
  overflow: hidden;
}

.cards.compact .favicon {
  width: 30px;
  height: 30px;
}

.favicon img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.cards.compact .favicon img {
  width: 16px;
  height: 16px;
}

/* 没有图标时用首字占位，与浏览器的做法一致 */
.initial {
  font-size: 15px;
  color: var(--text-secondary);
}

.tile-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.cards.compact .tile-label {
  font-size: 11px;
}

.tile:hover .tile-label {
  color: var(--text);
}

/* ---------------------------------------------------------------- 脚注 */

.foot {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
}

.cards.compact .foot {
  margin-top: 8px;
  font-size: 11px;
}
</style>
