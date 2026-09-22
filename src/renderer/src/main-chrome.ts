/**
 * chrome 界面入口：覆盖整个窗口的一层，中部完全透明，由下方的网页露出。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { createApp } from 'vue'
import ChromeApp from './chrome/ChromeApp.vue'

createApp(ChromeApp).mount('#app')
