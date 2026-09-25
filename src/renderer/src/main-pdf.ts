/**
 * 本机 PDF 阅读页入口。
 *
 * 这一页也是一张「自家标签页」：它带 preload（要读配置里的主题才画得出墨色），
 * 但它画的是 canvas——PDF 的内容不进 DOM，那本书里的任何东西都到不了这一层。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { createApp } from 'vue'
import PdfApp from './pdf/PdfApp.vue'

createApp(PdfApp).mount('#app')
