<script setup lang="ts">
/**
 * 三个区域的显隐开关：顶部菜单栏 / 主体 / 底部工具栏。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { ZoneState } from '@shared/types'

const props = defineProps<{ zones: ZoneState }>()
const emit = defineEmits<{ change: [zones: ZoneState] }>()

const ITEMS: Array<{ key: keyof ZoneState; label: string; title: string }> = [
  { key: 'top', label: '顶部', title: '显示/隐藏顶部菜单栏' },
  { key: 'body', label: '主体', title: '显示/隐藏主体（隐藏后该区域点击穿透）' },
  { key: 'bottom', label: '底部', title: '显示/隐藏底部工具栏' }
]

function toggle(key: keyof ZoneState): void {
  emit('change', {
    ...props.zones,
    [key]: props.zones[key] === 'shown' ? 'hidden' : 'shown'
  })
}
</script>

<template>
  <div class="zones moyu-no-drag">
    <button
      v-for="item in ITEMS"
      :key="item.key"
      class="zone"
      :class="{ off: zones[item.key] === 'hidden' }"
      :title="item.title"
      @click="toggle(item.key)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.zones {
  display: flex;
  gap: 2px;
}

.zone {
  padding: 2px 6px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-dim);
  white-space: nowrap;
}

.zone:hover {
  background: var(--moyu-surface-hover);
  color: var(--moyu-text);
}

.zone.off {
  color: var(--moyu-text-faint);
  text-decoration: line-through;
}
</style>
