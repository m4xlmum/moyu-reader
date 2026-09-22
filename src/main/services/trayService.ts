/**
 * 系统托盘。它是窗口藏起来之后唯一的找回入口，因此必须始终可用。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { Menu, Tray, app, nativeImage } from 'electron'
import { log } from './logger'

export interface TrayDeps {
  onReveal: () => void
  onOpenSettings: () => void
  onQuit: () => void
}

export class TrayService {
  private tray: Tray | null = null

  constructor(private readonly deps: TrayDeps) {}

  create(iconPath: string): void {
    if (this.tray) return
    try {
      let image = nativeImage.createFromPath(iconPath)
      if (image.isEmpty()) {
        // 图标缺失时留一个占位，绝不能因为图标问题就没有托盘
        log.warn(`托盘图标加载失败：${iconPath}`)
        image = nativeImage.createEmpty()
      }
      this.tray = new Tray(image)
      this.tray.setToolTip('摸鱼阅读')
      this.tray.setContextMenu(this.buildMenu())
      // 双击托盘图标 = 现形，是用户最容易想到的动作
      this.tray.on('double-click', () => this.deps.onReveal())
    } catch (err) {
      log.error('创建托盘失败', err)
    }
  }

  private buildMenu(): Menu {
    return Menu.buildFromTemplate([
      { label: '现形', click: () => this.deps.onReveal() },
      { label: '个人中心', click: () => this.deps.onOpenSettings() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          this.deps.onQuit()
        }
      }
    ])
  }

  /**
   * explorer.exe 重启后托盘图标会消失，且 Electron 没有提供「任务栏重建」的通知。
   * 因此只能在每次需要用到托盘的时刻（显示窗口、藏起来）重建一次——
   * 重建成本很低，而托盘丢失意味着用户可能再也找不回窗口。
   */
  rebuild(iconPath: string): void {
    this.destroy()
    this.create(iconPath)
  }

  destroy(): void {
    try {
      this.tray?.destroy()
    } catch {
      // 忽略
    }
    this.tray = null
  }
}

/** 托盘在部分环境下需要一点时间才能挂上，启动时调用可避免首帧缺失 */
export function isTraySupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux'
}

export function quitApp(): void {
  app.quit()
}
