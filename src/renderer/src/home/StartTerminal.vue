<script setup lang="ts">
/**
 * 起始页的终端世界：命令行排版，磷绿用它。
 *
 * 参照是 P1 荧光屏上的单色终端——提示符、一行行输出、最底一条状态行。
 * 它不是为了怀旧：命令行天然是「一维」的，只吃行数和字符宽度，不吃纵向余量，
 * 因此在迷你档（正文区 432×232）里比别种排版从容。
 *
 * 划分与现代世界逐段对齐（页眉 / 提示行 / 内容行 / 状态行），
 * 行为也同一套（见 useRows）：差别只在这一层皮上——
 * - 站点行首印的是动词 `open`，不是图标；
 * - 输入框不是搜索框，是提示符后面那一截；
 * - 字体等宽、直角、扫描线、字发光。
 *
 * 行数按实测高度算出来再渲染，放不下的不渲染（理由同 StartModern）。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, ref, useTemplateRef } from 'vue'
import ThemeMenu from './ThemeMenu.vue'
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

/** 行高（px）。这个数是唯一的：行高、可容纳行数都由它推出来，见 --row-h */
const ROW_H = computed(() => (props.compact ? 20 : 22))

const filtered = computed(() => filterRows(props.rows, props.query))

const area = useTemplateRef<HTMLElement>('area')
const { h: areaH } = useBox(area)

/** 可容纳的行数。至少留一行——能放一行也比空着强 */
const limit = computed(() => Math.max(1, Math.floor(areaH.value / ROW_H.value)))

const { visible, sel, pick, onKeydown, onSubmit } = useRowList(filtered, limit, {
  open: (url) => emit('open', url),
  resume: () => emit('resume'),
  submit: (text) => emit('submit', text),
  clearQuery: () => emit('update:query', '')
})

const promptEl = useTemplateRef<HTMLInputElement>('promptEl')
const focused = ref(false)

/**
 * 点空白处就把光标交回提示符。终端整块都该是「可以开始打字」的地方，
 * 不必精确点中那一行。
 */
function onRootClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('button, input, a, .theme-menu')) return
  promptEl.value?.focus()
}
</script>

<template>
  <div
    class="term"
    :class="{ compact }"
    :style="{ '--row-h': ROW_H + 'px' }"
    @click="onRootClick"
  >
    <header class="bar">
      <span class="ident">MOYU-READER</span>
      <span class="meta tnum">TABS {{ tabCount }}</span>
    </header>

    <!--
      提示行上不写 placeholder：块状光标就停在提示符后面那一格，
      写了占位文字就正好被它压住。想说的话挪到状态行——终端本来就是这么报消息的。
    -->
    <form class="prompt" :class="{ empty: !query }" @submit.prevent="onSubmit(query)">
      <span class="caret" aria-hidden="true">&gt;</span>
      <span class="field">
        <input
          ref="promptEl"
          :value="query"
          type="text"
          spellcheck="false"
          autocomplete="off"
          aria-label="命令或搜索"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @keydown="onKeydown"
          @focus="focused = true"
          @blur="focused = false"
        />
        <!--
          块状光标只在提示行空着的时候画。
          它画不了「文字中间」那个位置：块要跟到插入点，就得实时量出光标前那截
          文字的宽度，而那点宽度一旦算错，光标就指着一个不是插入点的地方闪——
          改一个网址中间的字时尤其气人。因此空行时给方块（这是终端的样子），
          一旦有字就交回系统那根细光标（它永远说的是真话）。
        -->
        <span v-if="!query" class="cursor" :class="{ lit: focused }" aria-hidden="true" />
      </span>
    </form>

    <div ref="area" class="lines">
      <!--
        鼠标扫过某一行就把它选上：选中行与「回车会打开的那一行」是同一个东西，
        光标停在别处却按回车打开另一条，比选中跟着鼠标走更让人措手不及。
      -->
      <button
        v-for="(row, i) in visible"
        :key="row.key"
        class="line"
        :class="{ sel: i === sel }"
        :title="row.url"
        @click="pick(row)"
        @mouseenter="sel = i"
      >
        <span class="verb">{{ row.verb }}</span>
        <span class="label">{{ row.label }}</span>
        <span class="host">{{ row.host }}</span>
      </button>
      <p v-if="!visible.length" class="none">
        <span class="verb">--</span>
        <span class="label">无匹配站点，回车按关键词搜索</span>
      </p>
    </div>

    <footer class="status">
      <span class="stat tnum">SITES {{ siteCount }}</span>
      <span class="keys">回车打开选中行 · 输入网址或关键词搜索 · ALT+Z 最小化 · ALT+X 藏进托盘</span>
      <ThemeMenu variant="terminal" :theme="theme" @pick="emit('pick', $event)" />
    </footer>
  </div>
</template>

<style scoped>
.term {
  width: 100%;
  height: 100%;
  background: var(--ground);
  display: flex;
  flex-direction: column;
  padding: 18px 22px 12px;
  overflow: hidden;
  font-size: 13px;
}

.term.compact {
  padding: 10px 14px 8px;
  font-size: 12px;
}

/* ---------------------------------------------------------------- 标题行 */

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--text-tertiary);
}

.ident {
  color: var(--accent);
  /* 比正文更亮一点的余辉：屏幕上的亮字，只有型号名与提示符够得上这个待遇 */
  text-shadow: 0 0 5px color-mix(in srgb, currentColor 50%, transparent);
  white-space: nowrap;
  overflow: hidden;
}

.bar .meta {
  flex: 0 0 auto;
}

.term.compact .bar .meta {
  display: none;
}

/* ---------------------------------------------------------------- 提示符 */

.prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--divider);
}

.term.compact .prompt {
  margin-top: 6px;
}

.caret {
  flex: 0 0 auto;
  color: var(--accent);
  text-shadow: 0 0 5px color-mix(in srgb, currentColor 50%, transparent);
}

/* 输入框与光标叠在一起：输入框收字，光标只是行首那一格 */
.field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 20px;
  overflow: hidden;
}

.field input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  color: var(--text);
}

/* 空行时方块光标占着行首，系统那根细光标就不要了，否则是两根 */
.prompt.empty .field input {
  caret-color: transparent;
}

.cursor {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 15px;
  background: var(--accent);
  opacity: 0.5;
}

/* 有焦点时它才是「等你打字」的那一格，才闪 */
.cursor.lit {
  opacity: 1;
  animation: blink 1.1s step-end infinite;
}

.term.compact .cursor {
  height: 13px;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cursor.lit {
    animation: none;
  }
}

/* ---------------------------------------------------------------- 输出行 */

.lines {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 8px;
  overflow: hidden;
}

.line,
.none {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: var(--row-h);
  padding: 0 8px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}

.line {
  transition: background 100ms ease-out;
}

.line:hover,
.line.sel {
  background: var(--ground-hover);
}

.line.sel .label {
  color: var(--text);
}

/* 行首那一列是固定的三段式：动词、名称、域名。名称和域名都截断，
   于是不管站点叫什么，三列永远对得齐 */
.verb {
  flex: 0 0 auto;
  width: 5.5em;
  color: var(--text-tertiary);
}

.line.sel .verb {
  color: var(--accent);
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
  color: var(--text-tertiary);
}

.term.compact .host {
  display: none;
}

.none .label {
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

.term.compact .status {
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

.term.compact .status .keys {
  visibility: hidden;
}

/* 主题菜单自己带 flex 布局，这里只把它钉在右端 */
.status :deep(.theme-menu) {
  flex: 0 0 auto;
}
</style>
