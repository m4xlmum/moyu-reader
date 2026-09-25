/**
 * 本机文件类 IPC：离线阅读。
 *
 * 这条路刻意做得最短：**系统选文件框选中的那几本直接开成普通的网页标签**，
 * 没有「书架」这种要维护的中间态。TXT 与 PDF 交给 Chromium 自己渲染
 * （PDF 有内置阅读器），因此这里不需要新的视图种类、新的样式注入，
 * 也不需要新的导航白名单——`file:` 早就在 sessionSetup 那份名单里。
 *
 * 路径不出主进程：回来的是文件名（见 @shared/url.ts 的 fileNameOf）。
 * 这个程序的全部意义是别人看不出你在干什么，而一条 `C:\Users\…\Documents\…`
 * 会把用户名和目录习惯一起摊在屏幕上。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { dialog, ipcMain } from 'electron'
import { pathToFileURL } from 'node:url'
import { INVOKE } from '@shared/ipc'
import { fileNameOf } from '@shared/url'
import type { AppContext } from '../context'

/**
 * 能选的文件类型。
 *
 * 只有一组，而且**不挂「所有文件」**：列上「所有文件」之后，用户能选中一本
 * EPUB，然后看着它变成一次下载——那比「选不到」更让人摸不着头脑。选不到
 * 是一句明确的话，而这一栏的说明里也写着 EPUB 暂不支持、指向路线图。
 *
 * 过滤器名字要能自己说清「你能选什么」：Chromium 按扩展名猜内容类型，
 * 不认识的扩展名一律变成下载，因此这里只能收它认得的。
 */
const FILTERS: Electron.FileFilter[] = [{ name: '文本与 PDF', extensions: ['txt', 'pdf'] }]

/**
 * 弹出选文件框，把选中的每一本开成一张标签页。返回它们的**文件名**。
 *
 * 多选是刻意的：一次挑三本书是「我要摸一天鱼」这个场景里很自然的动作，
 * 而一本一本弹三次同一个框，比多选难受得多。
 */
export async function openLocalFiles(ctx: AppContext): Promise<string[]> {
  const parent = ctx.controller.getWindow()
  const options: Electron.OpenDialogOptions = {
    title: '打开本机文件',
    buttonLabel: '开始阅读',
    properties: ['openFile', 'multiSelections'],
    filters: FILTERS
  }

  // 取消就是空数组——不是错误，界面据此什么都不说
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return []

  const names: string[] = []
  for (const path of result.filePaths) {
    const url = pathToFileURL(path).href
    ctx.tabs.create({ url, activate: true })
    const name = fileNameOf(url)
    if (name) names.push(name)
  }
  return names
}

export function registerFileIpc(ctx: AppContext): void {
  ipcMain.handle(INVOKE.fileOpenLocal, () => openLocalFiles(ctx))
}
