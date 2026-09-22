/**
 * 渲染进程可见的 window.moyu 类型声明。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { MoyuApi } from '@shared/ipc'

declare global {
  interface Window {
    moyu: MoyuApi
  }
}

export {}
