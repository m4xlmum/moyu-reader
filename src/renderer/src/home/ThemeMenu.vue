<script setup lang="ts">
/**
 * 主题选择器：一个触发器 + 一层浮层。两套世界共用，只有触发器长得不一样。
 *
 * 放在起始页的页眉里（两套世界的页眉都在同一个位置，见 StartCards /
 * StartTerminal）：它是这一页上唯一「改自己样子」的入口，不属于内容，
 * 因此待在视线之外，但一伸手就能够到。
 *
 * 浮层朝哪边开由形态决定：卡片世界的触发器在页眉上，朝下开；
 * 终端世界在页面最底下那条状态行里，朝上开。两边都是往页面里面开。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { HOME_THEMES, type HomeTheme } from '@shared/constants'
import Icon from '../chrome/Icon.vue'

const props = defineProps<{ theme: HomeTheme; variant: 'cards' | 'terminal' }>()
const emit = defineEmits<{ pick: [theme: HomeTheme] }>()

const open = ref(false)

const current = computed(() => HOME_THEMES.find((t) => t.id === props.theme))

function pick(id: HomeTheme): void {
  open.value = false
  emit('pick', id)
}

/** 点面板外面或按 Esc 就收起来，浮层的常规礼数 */
function onPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.theme-menu')) open.value = false
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!--
    形态用 data-variant 而不是 class。
    子组件的根元素会带上**父组件**的作用域属性，于是父组件里任何一条
    `.某类名[data-v-父]` 的规则都可能落到这里；而 cards / terminal 正好是
    两套世界根元素的类名，撞上就是「主题菜单被当成整页排了一遍版」。
    属性名不参与那套改写，也就撞不上。
  -->
  <div class="theme-menu" :data-variant="variant" :class="{ open }">
    <button
      class="trigger"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :title="`起始页主题：${current?.label ?? ''}`"
      @click="open = !open"
    >
      <template v-if="variant === 'terminal'">
        <span class="key">THEME</span>
        <span class="value">{{ current?.label }}</span>
      </template>
      <template v-else>
        <span class="value">主题 · {{ current?.label }}</span>
      </template>
      <Icon name="chevron-down" :size="11" />
    </button>

    <div v-if="open" class="panel" role="listbox" aria-label="起始页主题">
      <button
        v-for="t in HOME_THEMES"
        :key="t.id"
        class="item"
        role="option"
        :aria-selected="t.id === theme"
        :class="{ on: t.id === theme }"
        @click="pick(t.id)"
      >
        <!--
          色卡：这一小块自己带上目标主题的属性，于是 --ground / --text /
          --accent / --tile 就在它内部解析成那个主题的颜色。
          配色只有 home.css 里那一份，这里不另抄一遍十六进制。
        -->
        <span class="chips" :data-theme="t.id" aria-hidden="true">
          <i class="chip-text" />
          <i class="chip-accent" />
          <i class="chip-tile" />
        </span>
        <span class="text">
          <span class="name">{{ t.label }}</span>
          <span class="hint">{{ t.hint }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-menu {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/*
 * 终端世界反过来朝上开：那一边的触发器在页面最底下那条状态行里，
 * 朝下开就直接落到窗口外面去了。
 */
.theme-menu[data-variant='terminal'] .panel {
  top: auto;
  bottom: calc(100% + 4px);
}

.trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
  transition: background 120ms ease-out, color 120ms ease-out;
}

.trigger:hover,
.trigger[aria-expanded='true'] {
  background: var(--ground-hover);
  color: var(--text);
}

/* 终端世界的触发器：一个键值对，键暗、值亮——状态行里的写法 */
.theme-menu[data-variant='terminal'] .trigger {
  gap: 6px;
  padding: 0 4px;
  letter-spacing: 0.02em;
}

.theme-menu[data-variant='terminal'] .key {
  color: var(--text-tertiary);
}

.theme-menu[data-variant='terminal'] .value {
  color: var(--accent);
}

.panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 30;
  width: 252px;
  /* 只有三个主题，正常情况下不会滚；窗口特别矮时（迷你档）才轮到滚动条 */
  max-height: calc(100vh - 56px);
  overflow-y: auto;
  padding: 4px;
  background: var(--ground);
  border: 1px solid var(--divider-strong);
  border-radius: var(--radius);
  /* 阴影用中性的黑，不用强调色的偏蓝：它在每一套配色里都得立得住 */
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
}

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  transition: background 120ms ease-out;
}

.item:hover {
  background: var(--ground-hover);
}

.item.on {
  background: var(--accent-soft);
}

/*
 * 色卡。底色格用不着单画：这一小块的地就是那个主题的底色。
 */
.chips {
  flex: 0 0 auto;
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--ground);
  border: 1px solid var(--divider-strong);
  border-radius: 3px;
}

.chips i {
  display: block;
  width: 8px;
  height: 15px;
}

.chip-text {
  background: var(--text);
}

.chip-accent {
  background: var(--accent);
}

.chip-tile {
  background: var(--tile);
}

.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-size: 12px;
  color: var(--text);
}

.hint {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-tertiary);
}
</style>
