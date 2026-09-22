/**
 * 应用配置的加载、合并、校验与持久化。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import path from 'node:path'
import {
  BALL_SIZE,
  CONFIG_VERSION,
  DEFAULT_BOSS_HIDE,
  DEFAULT_BOSS_MINIMIZE,
  DEFAULT_SEARCH_TEMPLATE,
  HIDE_DELAY_MS,
  LEGACY_PORTRAIT_SIZES,
  OPACITY_MAX,
  OPACITY_MIN,
  PERSIST_DEBOUNCE_MS
} from '@shared/constants'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig } from '@shared/types'
import { DebouncedWriter, readJson } from './jsonFile'
import { log } from './logger'

export function defaultConfig(): AppConfig {
  return {
    version: CONFIG_VERSION,
    window: {
      x: null,
      y: null,
      width: 960,
      height: 540,
      lastNormalSize: { width: 960, height: 540 },
      miniMode: false,
      opacity: 1,
      alwaysOnTop: true,
      showInTaskbar: false
    },
    stealth: {
      autoCollapse: true,
      hideDelayMs: HIDE_DELAY_MS,
      muteMediaOnCollapse: true,
      contentProtection: false,
      ballCorner: 'bottom-right',
      ballSize: BALL_SIZE
    },
    hotkeys: {
      bossMinimize: DEFAULT_BOSS_MINIMIZE,
      bossHideToTray: DEFAULT_BOSS_HIDE
    },
    browser: {
      defaultUaMode: 'desktop',
      defaultZoom: 1,
      hideScrollbars: true,
      searchTemplate: DEFAULT_SEARCH_TEMPLATE,
      newWindowAsTab: true
    },
    lastSession: { openUrls: [], activeIndex: 0 }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 逐字段校验并夹紧，防止手工改坏的配置文件让应用进入异常状态 */
function normalize(input: Partial<AppConfig> | null | undefined): AppConfig {
  const d = defaultConfig()
  if (!input || typeof input !== 'object') return d

  const w = { ...d.window, ...(input.window ?? {}) }
  const s = { ...d.stealth, ...(input.stealth ?? {}) }
  const h = { ...d.hotkeys, ...(input.hotkeys ?? {}) }
  const b = { ...d.browser, ...(input.browser ?? {}) }
  const ls = { ...d.lastSession, ...(input.lastSession ?? {}) }

  // 迁移：1 版的竖屏尺寸与新的 16:9 横屏版面不兼容。
  // 只重置「从未调过尺寸」的配置（即恰好等于某个旧预设），
  // 用户自己改过的大小保持不动。
  if ((input.version ?? 1) < CONFIG_VERSION) {
    const untouched = LEGACY_PORTRAIT_SIZES.some(
      (s2) => s2.width === w.width && s2.height === w.height
    )
    if (untouched) {
      w.width = d.window.width
      w.height = d.window.height
      w.lastNormalSize = { ...d.window.lastNormalSize }
      // 位置也一并重算：横屏更宽，沿用旧坐标可能贴出屏幕外
      w.x = null
      w.y = null
    }
  }

  w.opacity = clamp(w.opacity, OPACITY_MIN, OPACITY_MAX)
  w.width = Math.round(clamp(w.width, 200, 4000))
  w.height = Math.round(clamp(w.height, 200, 4000))
  w.lastNormalSize = {
    width: Math.round(clamp(w.lastNormalSize?.width ?? d.window.width, 200, 4000)),
    height: Math.round(clamp(w.lastNormalSize?.height ?? d.window.height, 200, 4000))
  }
  s.hideDelayMs = Math.round(clamp(s.hideDelayMs, 200, 5000))
  s.ballSize = Math.round(clamp(s.ballSize, 36, 96))
  if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(s.ballCorner)) {
    s.ballCorner = d.stealth.ballCorner
  }
  b.defaultZoom = clamp(b.defaultZoom, 0.25, 5)
  if (typeof b.searchTemplate !== 'string' || !b.searchTemplate.includes('%s')) {
    b.searchTemplate = d.browser.searchTemplate
  }
  if (!Array.isArray(ls.openUrls)) ls.openUrls = []

  return {
    version: CONFIG_VERSION,
    window: w,
    stealth: s,
    hotkeys: h,
    browser: b,
    lastSession: ls
  }
}

type Listener = (config: AppConfig) => void

export class ConfigStore {
  private config: AppConfig
  private readonly writer: DebouncedWriter<AppConfig>
  private readonly listeners = new Set<Listener>()

  constructor(userDataDir: string) {
    const file = path.join(userDataDir, 'config.json')
    const raw = readJson<Partial<AppConfig> | null>(file, null)
    this.config = normalize(raw)
    this.writer = new DebouncedWriter<AppConfig>(file, PERSIST_DEBOUNCE_MS)
    if (raw && raw.version !== CONFIG_VERSION) {
      log.info(`配置版本由 ${raw.version} 迁移到 ${CONFIG_VERSION}`)
    }
  }

  get(): AppConfig {
    return this.config
  }

  /** 浅层合并每个顶层分区，随后整体校验；返回合并后的完整配置 */
  patch(patch: ConfigPatch): AppConfig {
    const next: AppConfig = {
      version: this.config.version,
      window: { ...this.config.window, ...(patch.window ?? {}) },
      stealth: { ...this.config.stealth, ...(patch.stealth ?? {}) },
      hotkeys: { ...this.config.hotkeys, ...(patch.hotkeys ?? {}) },
      browser: { ...this.config.browser, ...(patch.browser ?? {}) },
      lastSession: { ...this.config.lastSession, ...(patch.lastSession ?? {}) }
    }
    this.config = normalize(next)
    this.writer.schedule(this.config)
    this.emit()
    return this.config
  }

  /** 直接替换，供内部服务使用；同样会持久化并广播 */
  set(mutator: (config: AppConfig) => AppConfig): AppConfig {
    this.config = normalize(mutator(this.config))
    this.writer.schedule(this.config)
    this.emit()
    return this.config
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.config)
      } catch (err) {
        log.error('配置监听器抛错', err)
      }
    }
  }

  /** 进程退出前调用，确保最后一次变更已落盘 */
  flush(): void {
    this.writer.flush()
  }
}
