<script setup lang="ts">
/**
 * 无极透明度滑块。
 *
 * 下限锁在 5%：0% 会让窗口不可见却仍可交互，用户会以为自己把窗口弄丢了。
 * 真正「藏起来」请用老板键或托盘，而不是把透明度拉到 0。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, ref } from 'vue'
import { OPACITY_MAX, OPACITY_MIN } from '@shared/constants'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const dragging = ref(false)

/** 拖动期间不回写显示值，避免主进程回传造成的抖动 */
const localValue = ref(props.modelValue)
const displayValue = computed(() =>
  Math.round((dragging.value ? localValue.value : props.modelValue) * 100)
)

const PRESETS = [
  { label: '清晰', value: 1 },
  { label: '淡化', value: 0.7 },
  { label: '轻隐', value: 0.45 },
  { label: '几近无形', value: 0.25 }
]

function onInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value) / 100
  localValue.value = value
  emit('update:modelValue', Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, value)))
}

function setPreset(value: number): void {
  localValue.value = value
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="opacity moyu-no-drag">
    <span class="label">透明度</span>
    <input
      class="slider"
      type="range"
      :min="Math.round(OPACITY_MIN * 100)"
      :max="Math.round(OPACITY_MAX * 100)"
      :value="displayValue"
      @pointerdown="dragging = true"
      @pointerup="dragging = false"
      @input="onInput"
    />
    <span class="value">{{ displayValue }}%</span>
    <div class="presets">
      <button
        v-for="preset in PRESETS"
        :key="preset.label"
        class="preset"
        :class="{ active: Math.abs(modelValue - preset.value) < 0.01 }"
        :title="`${preset.label}（${Math.round(preset.value * 100)}%）`"
        @click="setPreset(preset.value)"
      >
        {{ preset.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.opacity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  color: var(--moyu-text-dim);
  white-space: nowrap;
}

.slider {
  width: 96px;
  height: 3px;
  -webkit-appearance: none;
  appearance: none;
  /* 轨道必须与底栏的白色拉开：白色画在白底上等于不存在 */
  background: var(--moyu-border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--moyu-accent);
  cursor: pointer;
}

/* 键盘焦点必须看得见：滑块的默认轮廓已被去掉，这里补回来 */
.slider:focus-visible {
  outline: 2px solid var(--moyu-accent);
  outline-offset: 3px;
}

.value {
  width: 36px;
  text-align: right;
  color: var(--moyu-text-dim);
  font-variant-numeric: tabular-nums;
}

.presets {
  display: flex;
  gap: 2px;
}

.preset {
  padding: 2px 6px;
  border-radius: var(--moyu-radius-sm);
  color: var(--moyu-text-faint);
  white-space: nowrap;
}

.preset:hover {
  background: var(--moyu-surface-hover);
  color: var(--moyu-text);
}

.preset.active {
  background: var(--moyu-surface-active);
  color: var(--moyu-accent);
}
</style>
