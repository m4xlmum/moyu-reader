/**
 * Vue 单文件组件的类型声明。
 *
 * window.moyu 的声明在 src/preload/index.d.ts，由 tsconfig.web.json 纳入。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
