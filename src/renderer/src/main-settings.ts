/**
 * 系统设置入口。与起始页同属「自家页面」，住在窗口内的一个标签页视图里。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { createApp } from 'vue'
import SettingsApp from './settings/SettingsApp.vue'

createApp(SettingsApp).mount('#app')
