/**
 * 更新类 IPC：查、下、装、忽略。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcMain } from 'electron'
import { INVOKE } from '@shared/ipc'
import type { AppContext } from '../context'

/**
 * 五个句柄，形状照 registerWindowIpc。
 *
 * 前四个都是 `await` 到底再返回：查一次要等网络、下一次要等一百多兆，界面要的是
 * 「做完了没有」这个结果，而不是「我收到你的请求了」。进度不在这里——它走
 * BROADCAST.updateState，提示条与设置页听的是同一条。
 *
 * install() 例外：它不等。起了安装程序之后本进程就要退出（见 updateService 的
 * install），回去的 Promise 多半等不到。
 */
export function registerUpdateIpc(ctx: AppContext): void {
  ipcMain.handle(INVOKE.updateGet, () => ctx.update.getState())

  ipcMain.handle(INVOKE.updateCheck, () => ctx.update.check({ manual: true }))

  ipcMain.handle(INVOKE.updateDownload, () => ctx.update.download())

  ipcMain.handle(INVOKE.updateInstall, () => {
    ctx.update.install()
  })

  ipcMain.handle(INVOKE.updateIgnore, (_e, input: { version: string | null }) =>
    ctx.update.ignore(input.version)
  )
}
