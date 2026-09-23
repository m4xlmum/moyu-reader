/**
 * Vue 单文件组件的类型声明。
 *
 * window.moyu 的声明在 src/preload/index.d.ts，由 tsconfig.web.json 纳入。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/**
 * 应用版本号，构建时由 electron.vite.config.ts 从 package.json 写进来。
 *
 * 之所以不是运行时的 `app.getVersion()`：这一页只需要一个字符串，
 * 而它在构建时就已经确定了，为它牵一条 IPC 通道不划算。
 */
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
