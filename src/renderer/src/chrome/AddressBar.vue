<script setup lang="ts">
/**
 * 地址栏，默认折叠在顶栏下方。
 *
 * 它只在自己被唤出时才挂载：高度归零不是把它藏起来，而是整行不占位，
 * 正文直接顶到顶栏下沿。展开与折叠由主进程裁定（正文是原生视图，
 * 必须和它同时让位），这里只负责发出意图、按回传的状态绘制。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { onMounted, ref, watch } from 'vue'
import { isOwnUrl } from '@shared/url'
import type { TabState } from '@shared/types'

const props = defineProps<{
  activeTabId: string | null
  activeTab: TabState | null
}>()

const input = ref('')
const editing = ref(false)
const field = ref<HTMLInputElement | null>(null)

/**
 * 未编辑时地址栏跟随当前标签页；编辑时不抢用户的输入。
 * 自家页面（起始页、系统设置）在地址栏里留空：它们没有网址，
 * 而真实的 file:// 路径既不好看，也暴露了本机目录结构。
 */
watch(
  () => props.activeTab?.url,
  (url) => {
    if (editing.value) return
    input.value = !url || isOwnUrl(url) ? '' : url
  },
  { immediate: true }
)

// 这一行只会在被主动唤出时挂载，所以挂载即聚焦
onMounted(() => {
  field.value?.focus()
  field.value?.select()
})

function close(): void {
  window.moyu.win.setAddressOpen({ open: false })
}

function submit(): void {
  const tabId = props.activeTabId
  const value = input.value.trim()
  if (!tabId || !value) return
  editing.value = false
  close()
  void window.moyu.nav.goto({ tabId, input: value })
}
</script>

<template>
  <div class="address-row moyu-drag">
    <form class="field moyu-no-drag" @submit.prevent="submit">
      <input
        ref="field"
        v-model="input"
        type="text"
        placeholder="输入网址，或输入关键词搜索"
        spellcheck="false"
        @focus="editing = true"
        @blur="close"
        @keydown.esc="close"
      />
    </form>
  </div>
</template>

<style scoped>
.address-row {
  flex: 0 0 auto;
  height: var(--moyu-address-h);
  display: flex;
  align-items: center;
  /* 这一行不与悬浮球重叠：球停在顶栏的槽位里，或停在右侧栏，
     两种情况都够不到这里，因此不预留槽位 */
  padding: 0 8px;
  background: var(--moyu-surface);
  border-bottom: 1px solid var(--moyu-hairline);
}

/* 做成浏览器的地址框：浅底圆角，而不是一条下划线 */
.field {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
}

.field input {
  width: 100%;
  height: 24px;
  padding: 0 12px;
  background: var(--moyu-surface-hover);
  border: 1px solid transparent;
  border-radius: var(--moyu-radius);
  color: var(--moyu-ink);
  outline: none;
  transition: background 120ms ease-out, border-color 120ms ease-out;
}

.field input::placeholder {
  color: var(--moyu-text-faint);
}

.field input:hover {
  background: var(--moyu-surface-active);
}

.field input:focus {
  background: var(--moyu-surface);
  border-color: var(--moyu-accent);
}

/* 焦点不能只靠颜色：低透明度下背景与描边的变化不足以定位 */
.field input:focus-visible {
  outline: 2px solid var(--moyu-accent);
  outline-offset: 1px;
}
</style>
