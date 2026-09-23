<script setup lang="ts">
/**
 * 起始页的现代世界：行式列表，纸白与暗夜用它。
 *
 * 划分与终端世界逐段对齐，四段各司其职：
 *   页眉（标识 + 标签数） → 输入行 → 内容行 → 状态行（站点数 + 按键 + 主题）
 * 两套世界的差别因此只剩一层皮：字体、圆角、配色，以及行里画什么
 * （这里画站点图标，荧光屏那边不画）。骨架是同一副，用户换主题时
 * 换掉的是观感，而不是重新学一遍这一页怎么用。
 *
 * 行数按实测高度算出来再渲染，放不下的不渲染（理由同 StartTerminal）。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, useTemplateRef } from 'vue'
import ThemeMenu from './ThemeMenu.vue'
import Icon from '../chrome/Icon.vue'
import { useBox } from './useBox'
import { filterRows, useRowList, type HomeRow } from './useRows'
import type { HomeTheme } from '@shared/constants'

const props = defineProps<{
  rows: HomeRow[]
  siteCount: number
  tabCount: number
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

/** 行高（px）。这个数是唯一的：行高与「放得下几行」都由它推出来，见 --row-h */
const ROW_H = computed(() => (props.compact ? 24 : 28))

const filtered = computed(() => filterRows(props.rows, props.query))

const area = useTemplateRef<HTMLElement>('area')
const { h: areaH } = useBox(area)

/** 一屏放得下的行数。至少留一行——能放一行也比空着强 */
const limit = computed(() => Math.max(1, Math.floor(areaH.value / ROW_H.value)))

const { visible, sel, pick, onKeydown, onSubmit } = useRowList(filtered, limit, {
  open: (url) => emit('open', url),
  resume: () => emit('resume'),
  submit: (text) => emit('submit', text),
  clearQuery: () => emit('update:query', '')
})

function initialOf(name: string): string {
  return [...name.trim()][0] ?? '·'
}

const promptEl = useTemplateRef<HTMLInputElement>('promptEl')

/** 点空白处就把光标交回输入行：这一页整块都可以开始打字 */
function onRootClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, input, a, .theme-menu')) return
  promptEl.value?.focus()
}
</script>

<template>
  <div
    class="modern"
    :class="{ compact }"
    :style="{ '--row-h': ROW_H + 'px' }"
    @click="onRootClick"
  >
    <header class="bar">
      <span class="wordmark">摸鱼阅读</span>
      <span class="meta tnum">标签 {{ tabCount }}</span>
    </header>

    <form class="prompt" @submit.prevent="onSubmit(query)">
      <Icon name="search" :size="compact ? 13 : 15" />
      <input
        ref="promptEl"
        :value="query"
        type="text"
        spellcheck="false"
        autocomplete="off"
        :placeholder="compact ? '输入网址或关键词' : '输入网址，或输入关键词搜索'"
        aria-label="网址或关键词"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
        @keydown="onKeydown"
      />
    </form>

    <div ref="area" class="lines">
      <button
        v-for="(row, i) in visible"
        :key="row.key"
        class="line"
        :class="{ sel: i === sel, resume: row.verb === 'resume' }"
        :title="row.url"
        @click="pick(row)"
        @mouseenter="sel = i"
      >
        <!-- 动词列两套世界共用：这里只给继续那行两个字，站点行留白，
             名称因此永远对齐在同一列上 -->
        <span class="verb">{{ row.verb === 'resume' ? '继续' : '' }}</span>
        <span class="favicon">
          <img
            v-if="row.icon"
            :src="row.icon"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <span v-else-if="row.verb === 'open'" class="initial">{{ initialOf(row.label) }}</span>
        </span>
        <span class="label">{{ row.label }}</span>
        <span class="host">{{ row.host }}</span>
      </button>
      <p v-if="!visible.length" class="none">没有匹配的站点，回车按关键词搜索</p>
    </div>

    <footer class="status">
      <span class="stat tnum">站点 {{ siteCount }}</span>
      <span class="keys">Alt+Z 最小化 · Alt+X 藏进托盘</span>
      <ThemeMenu variant="modern" :theme="theme" @pick="emit('pick', $event)" />
    </footer>
  </div>
</template>

<style scoped>
.modern {
  width: 100%;
  height: 100%;
  background: var(--ground);
  display: flex;
  flex-direction: column;
  padding: 18px 22px 12px;
  overflow: hidden;
  font-size: 13px;
}

.modern.compact {
  padding: 10px 14px 8px;
  font-size: 12px;
}

/* ---------------------------------------------------------------- 页眉 */

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--text-tertiary);
}

.wordmark {
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--text);
  /* 标识折行就不是标识了；挤不下时宁可挤旁边的读数 */
  flex: 0 0 auto;
  white-space: nowrap;
}

.modern.compact .wordmark {
  font-size: 13px;
}

.bar .meta {
  flex: 0 0 auto;
}

.modern.compact .bar .meta {
  display: none;
}

/* ---------------------------------------------------------------- 输入行 */

/* 一条下划线，不做成一枚胶囊：与终端世界的提示行是同一段划分，
   换个主题不该让这一行的高度和位置跟着变 */
.prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--divider-strong);
  color: var(--text-tertiary);
}

.modern.compact .prompt {
  margin-top: 6px;
}

.prompt:focus-within {
  border-color: var(--accent);
  color: var(--accent);
}

.prompt input {
  flex: 1 1 auto;
  min-width: 0;
  height: 20px;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: var(--text);
}

.prompt input::placeholder {
  color: var(--text-tertiary);
}

/* 焦点环画在整条输入行上，输入框自身不画第二道 */
.prompt input:focus-visible {
  outline: none;
}

/* ---------------------------------------------------------------- 内容行 */

.lines {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 8px;
  overflow: hidden;
}

.line {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: var(--row-h);
  padding: 0 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  transition: background 100ms ease-out;
}

.line:hover,
.line.sel {
  background: var(--ground-hover);
}

.line.sel .label {
  color: var(--text);
}

/* 动词列固定宽度。两套世界都用它，站点名称才对得齐 */
.verb {
  flex: 0 0 auto;
  width: 2.4em;
  font-size: 12px;
  color: var(--text-tertiary);
}

.line.resume .verb {
  color: var(--accent);
}

/* 图标是这一套世界的皮：终端那边只有字。
   这一格本身不画底：它有 18px 宽，是用来把后面的名称对齐到同一列的，
   底下那圈「图标底」只给首字母垫——没有图标也没有首字母时它就是个洞，
   在深色主题上尤其像掉了一格。 */
.favicon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.favicon img {
  width: 14px;
  height: 14px;
  object-fit: contain;
}

.initial {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--tile);
  font-size: 10px;
  color: var(--text-secondary);
}

.label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.host {
  flex: 0 0 auto;
  max-width: 34%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--text-tertiary);
}

.modern.compact .host {
  display: none;
}

.none {
  margin: 0;
  padding: 0 8px;
  height: var(--row-h);
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ---------------------------------------------------------------- 状态行 */

.status {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--divider);
  font-size: 11px;
  color: var(--text-tertiary);
}

.modern.compact .status {
  font-size: 10px;
}

.status .stat {
  flex: 0 0 auto;
  color: var(--accent);
}

.status .keys {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-align: right;
}

.modern.compact .status .keys {
  visibility: hidden;
}

/* 主题菜单自己带 flex 布局，这里只把它钉在右端 */
.status :deep(.theme-menu) {
  flex: 0 0 auto;
}
</style>
