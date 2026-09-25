/**
 * 更新类 IPC：查、装、忽略。
 *
 * 四个句柄，形状照 registerWindowIpc。没有「下载」这一路：下载不是界面上的一颗
 * 按钮，而是「检查更新」与「更新并重启」各自的后半截（见 updateService 的
 * check / install）。
 *
 * 查与忽略都 `await` 到底再返回：查一次要等网络，界面要的是「做完了没有」这个
 * 结果，而不是「我收到你的请求了」。进度不在这里——它走 BROADCAST.updateState，
 * 提示条与设置页听的是同一条。
 *
 * install() 例外：它不等，也不必等。这一下会起安装程序、然后本进程就退出
 * （见 updateService 的 install），回去的 Promise 多半等不到。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { ipcMain } from 'electron'
import { INVOKE } from '@shared/ipc'
import type { AppContext } from '../context'

export function registerUpdateIpc(ctx: AppContext): void {
  ipcMain.handle(INVOKE.updateGet, () => ctx.update.getState())

  ipcMain.handle(INVOKE.updateCheck, () => ctx.update.check({ manual: true }))

  ipcMain.handle(INVOKE.updateInstall, () => {
    ctx.update.install()
  })

  ipcMain.handle(INVOKE.updateIgnore, (_e, input: { version: string | null }) =>
    ctx.update.ignore(input.version)
  )
}
