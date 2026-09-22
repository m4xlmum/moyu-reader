/**
 * 预加载入口。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { contextBridge } from 'electron'
import { api } from './api'

// contextIsolation 开启，渲染进程只能看到这一个对象
contextBridge.exposeInMainWorld('moyu', api)
