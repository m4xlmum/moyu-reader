/**
 * 摸鱼窗口的编排者：拥有窗口、视图树、状态机与版面。
 *
 * 窗口状态只有这里能改。所有窗口级属性的实际写入都委托给 WindowSurface，
 * 本模块只负责「何时进入哪个状态」以及视图的显隐与尺寸。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BaseWindow, WebContentsView, screen } from 'electron'
import { SIZE_PRESETS, type SizePreset } from '@shared/constants'
import type { Rect, WindowMode, WindowRuntime, ZoneState } from '@shared/types'
import type { ConfigStore } from './configStore'
import { computeLayout, type Layout } from './geometry'
import { HitTester } from './mousePassthrough'
import { log } from './logger'
import { OpacityAnimator } from './transparencyService'
import { WindowLeaveWatcher } from './windowLeaveWatcher'
import { WindowRegistry } from './windowRegistry'
import { WindowSurface } from './windowSurface'

/** 合法状态迁移表。未列出的迁移会被拒绝并记录，避免状态机被悄悄改坏。 */
const LEGAL_TRANSITIONS: Record<WindowMode, WindowMode[]> = {
  normal: ['bodyHidden', 'trayHidden', 'minimized', 'quitting'],
  bodyHidden: ['normal', 'trayHidden', 'minimized', 'quitting'],
  minimized: ['normal', 'trayHidden', 'quitting'],
  trayHidden: ['normal', 'minimized', 'quitting'],
  quitting: []
}

export interface ControllerDeps {
  config: ConfigStore
  registry: WindowRegistry
  preloadPath: string
  /** 渲染进程入口地址；开发期是 devServer 的 URL */
  rendererUrl: string
  /** 主体可见性变化时通知外部（用于同步标签页视图） */
  onBodyVisibilityChange: (visible: boolean) => void
  /** 状态变化时通知外部（用于广播 WindowRuntime） */
  onStateChange: () => void
}

export class WindowController {
  private win: BaseWindow | null = null
  private chrome: WebContentsView | null = null
  private surface: WindowSurface | null = null
  private hitTester: HitTester | null = null
  private watcher: WindowLeaveWatcher | null = null
  private animator: OpacityAnimator | null = null

  private mode: WindowMode = 'normal'
  private zones: ZoneState = { top: 'shown', body: 'shown', bottom: 'shown' }
  private layout: Layout = computeLayout(420, 640, 6)

  constructor(private readonly deps: ControllerDeps) {}

  // ------------------------------------------------------------ 生命周期

  create(): void {
    const cfg = this.deps.config.get()
    const w = cfg.window

    const bounds = resolveInitialBounds(w)

    const win = new BaseWindow({
      ...bounds,
      width: w.width,
      height: w.height,
      frame: false,
      transparent: true,
      show: false,
      alwaysOnTop: w.alwaysOnTop,
      // 透明窗口不能最大化；且 resizable:true 会让透明在某些 Windows 版本上失效。
      // 缩放改由尺寸预设与自绘手柄承担（spike Q5 确认 resizable:false 下
      // 程序化 setBounds 仍然生效）。
      resizable: false,
      maximizable: false,
      minimizable: true,
      skipTaskbar: !w.showInTaskbar,
      hasShadow: false,
      backgroundColor: '#00000000',
      title: '摸鱼阅读'
    })
    this.win = win

    const chrome = new WebContentsView({
      webPreferences: {
        preload: this.deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    // 必须显式设成全透明：WebContentsView 默认背景是不透明白色（spike Q1/Q2）。
    // 漏掉这一行，整个透明方案就不成立。
    chrome.setBackgroundColor('#00000000')
    win.contentView.addChildView(chrome)
    this.chrome = chrome

    this.hitTester = new HitTester(win, cfg.stealth.hitTestStrategy)
    this.surface = new WindowSurface(win, this.hitTester, () => this.deps.config.get())
    this.animator = new OpacityAnimator(cfg.window.opacity, (value) => {
      this.surface?.apply(this.surfaceInput(value))
    })

    this.watcher = new WindowLeaveWatcher({
      getWindowId: () => this.win?.id ?? null,
      getBounds: () => this.win?.getBounds() ?? null,
      getLayout: () => this.layout,
      getZones: () => this.zones,
      getMode: () => this.mode,
      getConfig: () => this.deps.config.get(),
      surface: this.surface,
      registry: this.deps.registry,
      onInside: () => this.revealAll(),
      onOutside: () => this.autoHideAll()
    })

    this.deps.registry.add(win, {
      interactiveScreenRects: () => {
        if (!this.win) return null
        const b = this.win.getBounds()
        // 摸鱼窗口的可交互区域由状态机与分区共同决定，
        // 这里只声明整窗，真正的分区判定在 watcher 内进行。
        return [{ x: b.x, y: b.y, width: b.width, height: b.height }]
      },
      blocksAutoHide: false
    })

    win.on('resize', () => this.recomputeLayout())
    win.on('move', () => {
      this.persistBounds()
      // 跨显示器拖动会改变 DPI，layered 与 region 属性可能被系统丢弃
      this.reassert()
    })
    win.on('restore', () => {
      this.transitionTo('normal')
      this.reassert()
    })
    win.on('closed', () => {
      this.deps.registry.remove(win.id)
      this.win = null
    })

    this.loadChrome()

    const { width, height } = win.getBounds()
    this.recomputeLayout()
    this.layout = computeLayout(width, height, cfg.stealth.revealStripHeight)

    this.applySurface()
    this.watcher.start()
  }

  private loadChrome(): void {
    const chrome = this.chrome
    if (!chrome) return
    chrome.webContents.loadURL(this.deps.rendererUrl).catch((err) => {
      log.error('加载界面失败', err)
    })
    chrome.webContents.on('did-finish-load', () => {
      this.applySurface()
    })
  }

  // ------------------------------------------------------------ 版面

  getLayout(): Layout {
    return this.layout
  }

  getBodyRect(): Rect {
    return this.layout.body
  }

  getChromeView(): WebContentsView | null {
    return this.chrome
  }

  getWindow(): BaseWindow | null {
    return this.win
  }

  recomputeLayout(): void {
    const win = this.win
    if (!win) return
    const { width, height } = win.getBounds()
    this.layout = computeLayout(width, height, this.deps.config.get().stealth.revealStripHeight)

    this.chrome?.setBounds({ x: 0, y: 0, width, height })
    this.applySurface()
  }

  // ------------------------------------------------------------ 状态

  getMode(): WindowMode {
    return this.mode
  }

  getZones(): ZoneState {
    return this.zones
  }

  getRuntime(): WindowRuntime {
    const cfg = this.deps.config.get()
    return {
      mode: this.mode,
      zones: this.zones,
      opacity: cfg.window.opacity,
      suspended: false,
      hitTestStrategy: this.hitTester?.getStrategy() ?? 'shape',
      fadeStrategy: cfg.stealth.fadeStrategy
    }
  }

  transitionTo(next: WindowMode): void {
    if (next === this.mode) return
    if (!LEGAL_TRANSITIONS[this.mode].includes(next)) {
      log.warn(`非法状态迁移被拒绝：${this.mode} → ${next}`)
      return
    }

    const previous = this.mode
    this.mode = next
    log.info(`窗口状态：${previous} → ${next}`)

    this.applySurface()
    this.watcher?.bumpEpoch()
    this.deps.onStateChange()
  }

  // ------------------------------------------------------------ 动作

  /** 显示窗口。用 showInactive 避免抢走用户编辑器的焦点——那是最容易被发现的破绽。 */
  show(): void {
    const win = this.win
    if (!win) return
    if (this.mode === 'trayHidden' || this.mode === 'minimized') {
      this.transitionTo('normal')
    }
    // 被叫出来时必须完整可见，否则用户会以为窗口坏了
    this.revealAll()
    if (win.isMinimized()) win.restore()
    win.showInactive()
    this.reassert()
  }

  /** 藏进托盘。先淡出再 hide()，避免出现生硬的闪断。 */
  async hideToTray(): Promise<void> {
    const win = this.win
    if (!win) return
    if (this.mode === 'trayHidden') return

    const cfgOpacity = this.deps.config.get().window.opacity
    if (cfgOpacity > 0.01) {
      await this.animator?.fadeTo(0, 140)
    }
    this.transitionTo('trayHidden')
    win.hide()
    // 恢复时从 0 起淡入
    this.animator?.set(0)
  }

  minimize(): void {
    const win = this.win
    if (!win) return
    this.transitionTo('minimized')
    win.minimize()
  }

  setOpacity(value: number): void {
    this.deps.config.set((cfg) => ({ ...cfg, window: { ...cfg.window, opacity: value } }))
    if (this.mode === 'trayHidden' || this.mode === 'minimized') return
    this.animator?.set(value)
    this.deps.onStateChange()
  }

  /** 设置各区域显隐（顶部菜单栏 / 主体 / 底部工具栏） */
  applyZones(zones: ZoneState): ZoneState {
    this.setZones(zones)
    this.watcher?.bumpEpoch()
    return this.zones
  }

  setSize(input: { preset: SizePreset } | { width: number; height: number }): void {
    const win = this.win
    if (!win) return
    const { width, height } = 'preset' in input ? SIZE_PRESETS[input.preset] : input
    win.setBounds({ x: win.getBounds().x, y: win.getBounds().y, width, height })
    this.recomputeLayout()
  }

  setMiniMode(enabled: boolean): void {
    const win = this.win
    if (!win) return
    const cfg = this.deps.config.get()
    if (enabled === cfg.window.miniMode) return

    if (enabled) {
      const current = win.getBounds()
      this.deps.config.set((c) => ({
        ...c,
        window: {
          ...c.window,
          miniMode: true,
          lastNormalSize: { width: current.width, height: current.height }
        }
      }))
      const { width, height } = SIZE_PRESETS.mini
      win.setBounds({ x: current.x, y: current.y, width, height })
    } else {
      const { width, height } = cfg.window.lastNormalSize
      const current = win.getBounds()
      this.deps.config.set((c) => ({ ...c, window: { ...c.window, miniMode: false } }))
      win.setBounds({ x: current.x, y: current.y, width, height })
    }
    this.recomputeLayout()
  }

  reassert(): void {
    this.surface?.reassert()
  }

  setContentProtection(enabled: boolean): void {
    this.win?.setContentProtection(enabled)
  }

  destroy(): void {
    this.watcher?.stop()
    this.animator?.cancel()
    this.mode = 'quitting'
    try {
      this.chrome?.webContents.close()
    } catch {
      // 退出路径，忽略
    }
    this.win?.destroy()
    this.win = null
  }

  // ------------------------------------------------------------ 内部

  /** 光标回到窗口内：恢复所有区域 */
  private revealAll(): void {
    this.setZones({ top: 'shown', body: 'shown', bottom: 'shown' })
  }

  /** 光标离开：按配置隐藏开启了自动隐藏的区域 */
  private autoHideAll(): void {
    const s = this.deps.config.get().stealth
    this.setZones({
      top: s.autoHideTop ? 'hidden' : this.zones.top,
      body: s.autoHideBody ? 'hidden' : this.zones.body,
      bottom: s.autoHideBottom ? 'hidden' : this.zones.bottom
    })
  }

  /**
   * 区域显隐的唯一入口。
   *
   * 主体的显隐必须同步到窗口状态机（决定命中区域）与标签页视图（决定绘制与静音），
   * 顶栏与底栏只需重算命中区域与绘制。
   */
  private setZones(next: ZoneState): void {
    const bodyChanged = next.body !== this.zones.body
    const changed = bodyChanged || next.top !== this.zones.top || next.bottom !== this.zones.bottom
    if (!changed) return

    this.zones = next

    if (bodyChanged) {
      const visible = next.body === 'shown'
      // 先通知视图层，再切状态机——状态机的 applySurface 会立即用上新的显隐
      this.deps.onBodyVisibilityChange(visible)
      if (visible && this.mode === 'bodyHidden') this.transitionTo('normal')
      else if (!visible && this.mode === 'normal') this.transitionTo('bodyHidden')
    }

    this.applySurface()
    this.deps.onStateChange()
  }

  private applySurface(): void {
    this.surface?.apply(this.surfaceInput(this.animator?.current ?? this.deps.config.get().window.opacity))
  }

  private surfaceInput(opacity: number) {
    return { mode: this.mode, zones: this.zones, opacity, layout: this.layout }
  }

  private persistBounds(): void {
    const win = this.win
    if (!win || this.mode === 'quitting') return
    const b = win.getBounds()
    this.deps.config.set((cfg) => ({
      ...cfg,
      window: { ...cfg.window, x: b.x, y: b.y, width: b.width, height: b.height }
    }))
  }
}

function resolveInitialBounds(w: {
  x: number | null
  y: number | null
  width: number
  height: number
}): { x: number; y: number } {
  if (w.x !== null && w.y !== null) {
    return { x: w.x, y: w.y }
  }
  // 默认靠屏幕右侧摆放，不遮挡文档的正文区域
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + area.width - w.width - 48,
    y: area.y + Math.round((area.height - w.height) / 2)
  }
}
