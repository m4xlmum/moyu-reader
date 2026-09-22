/**
 * 个人中心窗口：普通的有边框窗口，不透明、可缩放。
 *
 * 它必须登记到 WindowRegistry 并标记 blocksAutoHide，
 * 否则用户在设置窗口里操作时，摸鱼窗口会因为光标离开而把主体藏起来。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BrowserWindow } from 'electron'
import type { WindowRegistry } from './windowRegistry'
import { rendererUrl } from './rendererUrl'
import { log } from './logger'

export class SettingsWindowService {
  private win: BrowserWindow | null = null

  constructor(
    private readonly registry: WindowRegistry,
    private readonly preloadPath: string
  ) {}

  open(section?: string): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show()
      this.win.focus()
      if (section) this.win.webContents.send('settings:navigate', section)
      return
    }

    const win = new BrowserWindow({
      width: 920,
      height: 660,
      minWidth: 720,
      minHeight: 520,
      title: '摸鱼阅读 · 个人中心',
      // 设置窗口刻意做成普通窗口：它不需要隐蔽，清晰的界面反而更重要
      frame: true,
      transparent: false,
      backgroundColor: '#f6f7f9',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.win = win

    this.registry.add(win, {
      interactiveScreenRects: () => null,
      blocksAutoHide: true
    })

    win.on('closed', () => {
      this.registry.remove(win.id)
      this.win = null
    })

    win.once('ready-to-show', () => {
      win.show()
      if (section) win.webContents.send('settings:navigate', section)
    })

    win.loadURL(rendererUrl('settings')).catch((err) => {
      log.error('加载个人中心失败', err)
    })
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
  }

  isOpen(): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible())
  }
}
