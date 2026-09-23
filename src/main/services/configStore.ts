/**
 * 应用配置的加载、合并、校验与持久化。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import path from 'node:path'
import {
  CONFIG_VERSION,
  DEFAULT_BOSS_HIDE,
  DEFAULT_BOSS_MINIMIZE,
  DEFAULT_HOME_THEME,
  DEFAULT_SEARCH_TEMPLATE,
  HIDE_DELAY_MS,
  HOME_THEMES,
  LEGACY_HOME_THEMES,
  LEGACY_PORTRAIT_SIZES,
  OPACITY_MAX,
  OPACITY_MIN,
  PERSIST_DEBOUNCE_MS
} from '@shared/constants'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, HomeTheme, StealthConfig, UiConfig, WindowConfig } from '@shared/types'
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
      opacity: 1,
      alwaysOnTop: true,
      showInTaskbar: false
    },
    ui: {
      // 两条栏默认都在。隐藏是留给「只想留一颗球看网页」的场合的，
      // 默认藏起来会把第一次打开的人挡在门外。
      topBarOpen: true,
      railOpen: true,
      homeTheme: DEFAULT_HOME_THEME
    },
    stealth: {
      // 默认关闭：收起与否由用户点悬浮球决定，不自动发生。
      // 自动收起会让界面在用户没打算藏的时候忽然缩成一颗球，反而更容易被注意到。
      autoCollapse: false,
      hideDelayMs: HIDE_DELAY_MS,
      muteMediaOnCollapse: true,
      contentProtection: false
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

  const h = { ...d.hotkeys, ...(input.hotkeys ?? {}) }
  const b = { ...d.browser, ...(input.browser ?? {}) }
  const ls = { ...d.lastSession, ...(input.lastSession ?? {}) }

  // window / ui / stealth 都逐字段取，而不是整段摊开：
  // 摊开会让已经从类型里去掉的旧字段（ballCorner / ballSize / miniMode /
  // lastNormalSize …）随着落盘的配置一路活下来，每次合并都把它们原样写回去，
  // 永远清不掉。删掉一个配置项时，这里也要跟着删一行。
  const w: WindowConfig = {
    x: typeof input.window?.x === 'number' ? input.window.x : d.window.x,
    y: typeof input.window?.y === 'number' ? input.window.y : d.window.y,
    width: input.window?.width ?? d.window.width,
    height: input.window?.height ?? d.window.height,
    opacity: input.window?.opacity ?? d.window.opacity,
    alwaysOnTop: input.window?.alwaysOnTop ?? d.window.alwaysOnTop,
    showInTaskbar: input.window?.showInTaskbar ?? d.window.showInTaskbar
  }

  const ui: UiConfig = {
    topBarOpen: input.ui?.topBarOpen ?? d.ui.topBarOpen,
    railOpen: input.ui?.railOpen ?? d.ui.railOpen,
    homeTheme: input.ui?.homeTheme ?? d.ui.homeTheme
  }

  const s: StealthConfig = {
    autoCollapse: input.stealth?.autoCollapse ?? d.stealth.autoCollapse,
    hideDelayMs: input.stealth?.hideDelayMs ?? d.stealth.hideDelayMs,
    muteMediaOnCollapse: input.stealth?.muteMediaOnCollapse ?? d.stealth.muteMediaOnCollapse,
    contentProtection: input.stealth?.contentProtection ?? d.stealth.contentProtection
  }

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
      // 位置也一并重算：横屏更宽，沿用旧坐标可能贴出屏幕外
      w.x = null
      w.y = null
    }
  }

  // 迁移到 4：悬浮球改为窗口内的常驻元素，交互也改成手动开关。
  // 旧配置里 autoCollapse 默认是开的，沿用会让人以为「界面自己会跑掉」。
  if ((input.version ?? 1) < 4) {
    s.autoCollapse = false
  }

  // 迁移到 5：底栏取消，功能移入右侧栏，窗口左下角不再是 chrome 区域。
  // 迁移到 6：悬浮球进了顶栏，停靠位置与大小都不再是配置项。
  // 迁移到 7：右侧栏去掉迷你与收藏，系统设置改在窗口内打开；
  //           window.miniMode / lastNormalSize 由上面的逐字段取值丢掉。
  // 迁移到 8：起始页主题由七个收到三个。收掉的那几个全是荧光屏主题，
  //           落到同属终端世界的磷绿上；落到纸白等于把选过黑底的人扔回白底。
  //           必须在下面「主题不在表里就回落默认」之前做。
  if ((input.version ?? 1) < 8 && LEGACY_HOME_THEMES.includes(String(input.ui?.homeTheme))) {
    ui.homeTheme = 'crt-green'
  }

  w.opacity = clamp(w.opacity, OPACITY_MIN, OPACITY_MAX)
  w.width = Math.round(clamp(w.width, 200, 4000))
  w.height = Math.round(clamp(w.height, 200, 4000))
  s.hideDelayMs = Math.round(clamp(s.hideDelayMs, 200, 5000))
  b.defaultZoom = clamp(b.defaultZoom, 0.25, 5)
  if (typeof b.searchTemplate !== 'string' || !b.searchTemplate.includes('%s')) {
    b.searchTemplate = d.browser.searchTemplate
  }
  if (!Array.isArray(ls.openUrls)) ls.openUrls = []
  if (typeof ui.topBarOpen !== 'boolean') ui.topBarOpen = d.ui.topBarOpen
  if (typeof ui.railOpen !== 'boolean') ui.railOpen = d.ui.railOpen
  if (!HOME_THEMES.some((t) => t.id === ui.homeTheme)) {
    ui.homeTheme = d.ui.homeTheme as HomeTheme
  }

  return {
    version: CONFIG_VERSION,
    window: w,
    ui,
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
      ui: { ...this.config.ui, ...(patch.ui ?? {}) },
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
