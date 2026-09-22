/**
 * 首页（起始页）入口。
 *
 * 首页是一张「自家标签页」：它带 preload，能读取站点、历史与书签。
 * 访客页面拿不到这些能力，见 src/preload/index.ts 的来源校验。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { createApp } from 'vue'
import HomeApp from './home/HomeApp.vue'

createApp(HomeApp).mount('#app')
