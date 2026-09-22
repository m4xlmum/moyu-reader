/**
 * 预加载入口。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { contextBridge } from 'electron'
import { api } from './api'

/**
 * 只有本应用自己的页面才能拿到这套 API。
 *
 * 首页是一个「自家标签页」，它带着 preload 运行；如果用户把它导航到
 * 第三方站点，preload 会在新文档上重新执行——若不加判断，那个站点
 * 就能直接调用 window.moyu 读写站点、历史与书签。
 * 因此这里按协议与来源做白名单判断，只认本地文件与本机 devServer。
 */
const OWN_PAGES = ['/index.html', '/home.html', '/popover.html', '/settings.html']

function isOwnPage(): boolean {
  const { protocol, hostname, pathname } = window.location

  if (protocol === 'file:') {
    return OWN_PAGES.some((p) => pathname.endsWith(p))
  }

  // 开发期由 electron-vite 的 devServer 提供页面；远端站点不可能是 localhost
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1'
  return (protocol === 'http:' || protocol === 'https:') && isLocal && pathname.endsWith('.html')
}

if (isOwnPage()) {
  // contextIsolation 开启，渲染进程只能看到这一个对象
  contextBridge.exposeInMainWorld('moyu', api)
}
