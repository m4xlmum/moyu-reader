<script setup lang="ts">
/**
 * 图标集。
 *
 * 统一为 24 视框、1.6 描边、圆头圆角、只用 currentColor 的线性图标。
 * 不使用 Unicode 字符冒充图标：字符的字重、基线和对齐由字体决定，
 * 在不同机器上表现不一致，也无法与文本的字号体系协调。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
defineProps<{
  name:
    | 'home'
    | 'back'
    | 'forward'
    | 'reload'
    | 'plus'
    | 'minus'
    | 'minimize'
    | 'tray'
    | 'close'
    | 'search'
    | 'history'
    | 'bookmark'
    | 'arrow-right'
    | 'collapse'
  size?: number
}>()
</script>

<template>
  <svg
    class="icon-svg"
    :width="size ?? 15"
    :height="size ?? 15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'home'">
      <path d="M4 11.5 12 4.5l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
    </template>
    <template v-else-if="name === 'back'">
      <path d="M15 5l-7 7 7 7" />
    </template>
    <template v-else-if="name === 'forward'">
      <path d="M9 5l7 7-7 7" />
    </template>
    <template v-else-if="name === 'reload'">
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M18.5 3.5v4h-4" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'minimize'">
      <path d="M5 18h14" />
    </template>
    <template v-else-if="name === 'tray'">
      <path d="M12 4v10" />
      <path d="M8 10.5l4 4 4-4" />
      <path d="M4 19.5h16" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12M18 6L6 18" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </template>
    <template v-else-if="name === 'history'">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 8v4.5l3 1.8" />
    </template>
    <template v-else-if="name === 'bookmark'">
      <path d="M7 4.5h10a1 1 0 0 1 1 1v14l-6-3.6-6 3.6v-14a1 1 0 0 1 1-1z" />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M5 12h13" />
      <path d="M13 7l5 5-5 5" />
    </template>
    <!-- 收起成球：界面缩进右下角的一颗圆点 -->
    <template v-else-if="name === 'collapse'">
      <rect x="3.5" y="4.5" width="17" height="12" rx="1.5" />
      <circle cx="18" cy="19" r="2.6" fill="currentColor" stroke="none" />
    </template>
  </svg>
</template>

<style scoped>
.icon-svg {
  display: block;
  flex: 0 0 auto;
}
</style>
