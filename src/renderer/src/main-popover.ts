/**
 * 弹出面板入口。面板种类由 URL 的 ?kind= 决定。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { createApp } from 'vue'
import PopoverApp from './popover/PopoverApp.vue'

createApp(PopoverApp).mount('#app')
