/**
 * 老板键：全局快捷键，窗口失焦时也生效。
 *
 * 关键的坑：globalShortcut.register() 返回 false 时**静默失败**——
 * 组合键被别的程序占用（或被提权进程占用，受 UIPI 限制）时不会抛错，
 * 只是什么也没发生。因此这里绝不假定注册成功，一律把返回值交给调用方，
 * 并在 UI 上如实提示「注册失败，请更换组合键」。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { globalShortcut } from 'electron'
import type { HotkeyInfo } from '@shared/types'
import { log } from './logger'

export type BossKeyName = 'bossMinimize' | 'bossHideToTray'

export class BossKeyService {
  private registered: Record<BossKeyName, string | null> = {
    bossMinimize: null,
    bossHideToTray: null
  }

  /**
   * 注册（或改绑）一个老板键。
   * 改绑时先把旧组合键释放，避免旧键继续占着不放。
   */
  register(name: BossKeyName, accelerator: string, handler: () => void): { ok: boolean; reason?: string } {
    const previous = this.registered[name]

    if (previous && previous !== accelerator) {
      try {
        globalShortcut.unregister(previous)
      } catch {
        // 旧键可能已被系统回收
      }
      this.registered[name] = null
    }

    if (previous === accelerator && globalShortcut.isRegistered(accelerator)) {
      // 重新注册同一组合键以更新回调
      globalShortcut.unregister(accelerator)
    }

    let ok = false
    try {
      ok = globalShortcut.register(accelerator, handler)
    } catch (err) {
      log.error(`注册老板键 ${accelerator} 抛错`, err)
      ok = false
    }

    if (ok) {
      this.registered[name] = accelerator
      log.info(`老板键 ${name} 已注册：${accelerator}`)
      return { ok: true }
    }

    // 注册失败要把旧键还回去，避免用户改绑失败后连原有的键都没了
    if (previous && previous !== accelerator) {
      try {
        if (globalShortcut.register(previous, handler)) this.registered[name] = previous
      } catch {
        // 放弃回滚
      }
    }

    log.warn(`老板键 ${name} 注册失败：${accelerator}（多数是被其它程序占用）`)
    return { ok: false, reason: '组合键已被其它程序占用，请更换' }
  }

  list(): { bossMinimize: HotkeyInfo; bossHideToTray: HotkeyInfo } {
    return {
      bossMinimize: {
        accelerator: this.registered.bossMinimize ?? '',
        registered: this.registered.bossMinimize
          ? globalShortcut.isRegistered(this.registered.bossMinimize)
          : false
      },
      bossHideToTray: {
        accelerator: this.registered.bossHideToTray ?? '',
        registered: this.registered.bossHideToTray
          ? globalShortcut.isRegistered(this.registered.bossHideToTray)
          : false
      }
    }
  }

  /** 必须在 will-quit 中调用，否则退出后组合键仍被本进程占用 */
  unregisterAll(): void {
    try {
      globalShortcut.unregisterAll()
    } catch (err) {
      log.warn('注销全局快捷键失败', err)
    }
    this.registered = { bossMinimize: null, bossHideToTray: null }
  }
}
