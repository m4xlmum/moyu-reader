/**
 * 元素实测尺寸。
 *
 * 起始页的版面是「按空间分档」的：正文区最窄只有 432×232（迷你档去掉顶栏
 * 与右栏之后），磁贴放不下的行、命令行放不下的行都得先算出来再渲染，
 * 而不是靠 CSS 裁掉——裁出来的半行比没有这一行更难看。
 * 因此这一页要真的知道自己的盒子有多大。
 *
 * 要量的元素由调用方用 `useTemplateRef` 取出来再传进来，而不是在这里建一个
 * 空 ref：模板上的 `ref="area"` 只是一个字符串，`noUnusedLocals` 不认它，
 * 于是「只被模板用过」的变量会被判成没人用。`useTemplateRef` 把那个名字写进
 * 了代码里，两边就都说得通了。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { onMounted, onUnmounted, ref, type Ref, type ShallowRef } from 'vue'

export function useBox(el: Readonly<ShallowRef<HTMLElement | null>>): {
  w: Ref<number>
  h: Ref<number>
} {
  const w = ref(0)
  const h = ref(0)
  let ro: ResizeObserver | null = null

  onMounted(() => {
    if (!el.value) return
    // observe 之后会立刻回调一次，因此不必再手工量一次初始尺寸
    ro = new ResizeObserver(([entry]) => {
      w.value = Math.round(entry.contentRect.width)
      h.value = Math.round(entry.contentRect.height)
    })
    ro.observe(el.value)
  })

  onUnmounted(() => ro?.disconnect())

  return { w, h }
}
