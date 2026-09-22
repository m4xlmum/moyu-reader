<script setup lang="ts">
/**
 * 显形条带：区域隐藏后残留在窗口边缘的窄条。
 *
 * 它不需要自己处理显形逻辑——条带处在窗口的「可交互区域」内，
 * 主进程的光标轮询一旦发现光标移入，就会把所有区域恢复显示。
 * 这里的点击处理只是为了在轮询之外多一层保险。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
defineProps<{ side: 'top' | 'bottom' }>()
const emit = defineEmits<{ reveal: [] }>()
</script>

<template>
  <div class="strip" :class="side" title="移入以显形" @click="emit('reveal')" />
</template>

<style scoped>
.strip {
  flex: 0 0 auto;
  height: var(--moyu-strip-h);
  width: 100%;
  /* 无底色：这一条要尽可能不显眼，只是给用户一个可悬停的目标 */
  background: transparent;
  -webkit-app-region: drag;
}

.strip.top {
  cursor: ns-resize;
}
</style>
