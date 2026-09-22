<script setup lang="ts">
/**
 * 悬浮球。
 *
 * 收起之后整个界面就是这一颗球，它是用户回到界面的唯一入口，
 * 因此必须始终看得见、点得到；同时又不能扎眼，否则「藏起来」就没意义了。
 * 平衡点：平时 55% 不透明，鼠标移上去恢复不透明并微微放大。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
defineProps<{ size: number }>()
const emit = defineEmits<{ expand: [] }>()
</script>

<template>
  <div class="ball-wrap">
    <button
      class="ball"
      :style="{ width: `${size}px`, height: `${size}px` }"
      title="展开摸鱼阅读"
      aria-label="展开摸鱼阅读"
      @click="emit('expand')"
    >
      <svg
        :width="size * 0.46"
        :height="size * 0.46"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 5.5h6a2.5 2.5 0 0 1 2 2.5v11a2 2 0 0 0-1.6-1.4H4z" />
        <path d="M20 5.5h-6a2.5 2.5 0 0 0-2 2.5v11a2 2 0 0 1 1.6-1.4H20z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.ball-wrap {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: transparent;
  /* 拖拽整颗球可以把窗口挪走 */
  -webkit-app-region: drag;
}

.ball {
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--moyu-accent);
  color: #ffffff;
  /* 平时半透明：既看得见，又不抢眼 */
  opacity: 0.55;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.28);
  transition:
    opacity 140ms ease-out,
    transform 140ms ease-out,
    box-shadow 140ms ease-out;
  -webkit-app-region: no-drag;
}

.ball:hover {
  opacity: 1;
  transform: scale(1.06);
  box-shadow: 0 3px 12px rgba(17, 24, 39, 0.34);
}

.ball:active {
  transform: scale(0.97);
}

.ball:focus-visible {
  opacity: 1;
  outline: 2px solid #ffffff;
  outline-offset: -4px;
}
</style>
