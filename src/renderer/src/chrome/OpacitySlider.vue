<script setup lang="ts">
/**
 * 无极透明度滑块（竖栏版）。
 *
 * 下限锁在 5%：0% 会让窗口不可见却仍可交互，用户会以为自己把窗口弄丢了。
 * 真正「藏起来」请用老板键或托盘，而不是把透明度拉到 0。
 *
 * 横条转 90° 放置，而不是用竖排 Input：Chromium 的 range 只有横向是稳定的，
 * 竖排写法各版本表现不一，而 transform 一定可靠。
 * 旋转不改变布局盒，所以外框必须按旋转**后**的尺寸留位。
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

function onInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value) / 100
  localValue.value = value
  emit('update:modelValue', Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, value)))
}
</script>

<template>
  <div class="opacity moyu-no-drag">
    <span class="value">{{ displayValue }}%</span>
    <div class="track-wrap">
      <input
        class="slider"
        type="range"
        :min="Math.round(OPACITY_MIN * 100)"
        :max="Math.round(OPACITY_MAX * 100)"
        :value="displayValue"
        :title="`界面透明度 ${displayValue}%（下限 5%）`"
        :aria-label="`界面透明度 ${displayValue}%`"
        @pointerdown="dragging = true"
        @pointerup="dragging = false"
        @input="onInput"
      />
    </div>
  </div>
</template>

<style scoped>
.opacity {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px 0 4px;
}

.value {
  color: var(--moyu-text-dim);
  font-variant-numeric: tabular-nums;
}

.track-wrap {
  /* 横条的长度与厚度。长度同时决定槽的高度、横条的宽度与居中偏移，
     三处必须一致，所以只在这里写一次，由子元素继承。 */
  --track-len: 72px;
  --track-thick: 14px;
  position: relative;
  width: 16px;
  height: var(--track-len);
}

/*
 * 绝对定位，并且用负外边距居中——不能靠父级的居中来摆这一条。
 *
 * 横条（宽 72）比槽（宽 16）宽得多。作为 grid 项时 Chromium 不会两侧均分溢出，
 * 而是从槽的左沿向右排（实测：槽在文档 x 929..945，输入框落在 931..1041，
 * 中心偏右 49px）；改用 inset:0 + margin:auto 也一样，因为负的 auto 外边距
 * 不成立，LTR 下 margin-left 会被归零，结果仍是向右溢出 28px。
 * 两种情况下转 90° 之后整条都落到可视列之外，看上去就是这个控件根本不存在。
 *
 * 因此这里把「居中」写成明确的一半尺寸偏移，与父级宽度无关。
 *
 * 长度取 72px 是竖向空间的约束：默认 960×540 下，右侧栏去掉顶栏、设置按钮与
 * 悬浮球槽位后只剩约 404px 给这一列，而各控件合计约 440px。110px 的滑块会把
 * 整列撑出 35px，底部一截被裁掉；72px 正好把这些空间收回来。
 */
.slider {
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--track-len);
  height: var(--track-thick);
  margin-left: calc(var(--track-len) / -2);
  margin-top: calc(var(--track-thick) / -2);
  transform: rotate(-90deg);
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

/*
 * 轨道与滑块同高（14px），二者之间就没有居中歧义——
 * 视觉上的那条细线由背景渐变画出来，命中区域则保持 14px 宽。
 */
.slider::-webkit-slider-runnable-track {
  height: 14px;
  border-radius: 7px;
  background-image: linear-gradient(var(--moyu-border), var(--moyu-border));
  background-size: 100% 3px;
  background-position: center;
  background-repeat: no-repeat;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--moyu-accent);
}

/* 键盘焦点必须看得见：滑块的默认轮廓已被去掉，这里补回来 */
.slider:focus-visible {
  outline: 2px solid var(--moyu-accent);
  outline-offset: 3px;
}
</style>
