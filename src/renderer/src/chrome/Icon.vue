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
    | 'close'
    | 'search'
    | 'history'
    | 'bookmark'
    | 'settings'
    | 'chevron-down'
    | 'panel-right'
    | 'mobile'
    | 'pin'
    | 'maximize'
    | 'restore'
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
    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12M18 6L6 18" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="M7 10l5 5 5-5" />
    </template>
    <template v-else-if="name === 'panel-right'">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </template>
    <!--
      手机版网页：一台竖着的手机。不用「手机 + 显示器」两个图元来表达
      「手机 / 电脑」——顶栏里每个图标只有 15px，两个图元挤在一起只剩糊。
      按钮的高亮状态已经说明了「现在是哪一边」，图标只需要指出这件事是什么。
    -->
    <template v-else-if="name === 'mobile'">
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M10.5 17.5h3" />
    </template>
    <!-- 置顶：一枚图钉。头朝上、针朝下，与「钉在最上面」是同一个意思 -->
    <template v-else-if="name === 'pin'">
      <path d="M9 3.5h6v3.2l2.2 2.6v1.4H6.8v-1.4L9 6.7z" />
      <path d="M12 10.7v9.8" />
    </template>
    <!--
      最大化：一个空心方框，Windows 这一代的画法。
      它必须与下面的「还原」（两个错位方框）一眼分得开——两枚图标就挨着放
      （同一个按钮的两个状态），认错就等于点错。
    -->
    <template v-else-if="name === 'maximize'">
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
    </template>
    <!--
      还原：一大一小两个错位方框。后面那个只露出上面的边与右边的边——
      两条完整的方框挤在 24 视框里会糊成一片，露个拐角反而更像「一叠」。
    -->
    <template v-else-if="name === 'restore'">
      <rect x="4" y="9" width="11" height="11" rx="2" />
      <path d="M9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
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
    <!--
      设置用「三条带旋钮的滑杆」而不是齿轮：齿轮的齿在 24 视框里要画准，
      得靠一条几十个点的路径，手写一个八齿轮廓几乎必然歪。滑杆同样一眼认得出。
    -->
    <template v-else-if="name === 'settings'">
      <path d="M5 7h9M18 7h1M5 12h3M12 12h7M5 17h9M18 17h1" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="17" r="2" />
    </template>
  </svg>
</template>

<style scoped>
.icon-svg {
  display: block;
  flex: 0 0 auto;
}
</style>
