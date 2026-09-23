/**
 * 摸鱼窗口的编排者：拥有窗口、视图树与状态机。
 *
 * 隐藏策略只有两条路：
 *   - 展开：完整界面，顶栏 + 正文 + 底栏
 *   - 收起：整个窗口缩小成一颗悬浮球
 *
 * 「收起」是真的把窗口缩到 52×52，而不是把内容藏起来留一块空壳。
 * 这样屏幕上不会存在「看不见却仍占着一大块」的区域，
 * 原先那套靠裁剪命中区域实现的点击穿透因此不再需要。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { BaseWindow, WebContentsView, screen } from 'electron'
import {
  BALL_MARGIN,
  DRAG_TICK_MS,
  SIZE_PRESETS,
  TOP_BAR_H,
  BOTTOM_BAR_H,
  type SizePreset
} from '@shared/constants'
import { ballDockRect, effectiveBallSize } from '@shared/ball'
import type { BallCorner, Rect, WindowMode, WindowRuntime } from '@shared/types'
import type { ConfigStore } from './configStore'
import { computeLayout, type Layout } from './geometry'
import { log } from './logger'
import { WindowLeaveWatcher } from './windowLeaveWatcher'
import { WindowSurface } from './windowSurface'

/** 合法状态迁移表。未列出的迁移会被拒绝并记录，避免状态机被悄悄改坏。 */
const LEGAL_TRANSITIONS: Record<WindowMode, WindowMode[]> = {
  expanded: ['collapsed', 'trayHidden', 'minimized', 'quitting'],
  collapsed: ['expanded', 'trayHidden', 'minimized', 'quitting'],
  minimized: ['expanded', 'collapsed', 'trayHidden', 'quitting'],
  trayHidden: ['expanded', 'collapsed', 'minimized', 'quitting'],
  quitting: []
}

export interface ControllerDeps {
  config: ConfigStore
  registry: import('./windowRegistry').WindowRegistry
  preloadPath: string
  rendererUrl: string
  /** 收起或展开时通知外部（用于同步标签页视图的显隐与静音） */
  onVisibilityChange: (visible: boolean) => void
  onStateChange: () => void
}

export class WindowController {
  private win: BaseWindow | null = null
  private chrome: WebContentsView | null = null
  private surface: WindowSurface | null = null
  private watcher: WindowLeaveWatcher | null = null

  private mode: WindowMode = 'expanded'
  /**
   * 展开态的窗口矩形。
   *
   * 绝不从 win.getBounds() 反推：切换状态的过程中窗口还停在旧尺寸上，
   * 反推会把「记住的展开尺寸」覆盖成球的尺寸，展开就再也长不回去了。
   * 这个值只由真实的尺寸变化维护（create / resize / move / collapse 前）。
   */
  private expandedBounds: Rect | null = null
  private layout: Layout = computeLayout(960, 540, TOP_BAR_H, BOTTOM_BAR_H)

  /** 拖动中的锚点：按下那一刻的光标位置与窗口位置 */
  private dragAnchor: { cursorX: number; cursorY: number; winX: number; winY: number } | null = null
  private dragTimer: NodeJS.Timeout | null = null

  constructor(private readonly deps: ControllerDeps) {}

  // ------------------------------------------------------------ 生命周期

  create(): void {
    const cfg = this.deps.config.get()
    const w = cfg.window
    const origin = resolveInitialOrigin(w)
    const bounds: Rect = { x: origin.x, y: origin.y, width: w.width, height: w.height }

    const win = new BaseWindow({
      ...bounds,
      frame: false,
      transparent: true,
      show: false,
      alwaysOnTop: w.alwaysOnTop,
      // 透明窗口不能最大化；且 resizable:true 会让透明在某些 Windows 版本上失效。
      // 尺寸改由预设与自绘手柄承担（spike Q5 确认 resizable:false 下
      // 程序化 setBounds 仍然生效）——收起成球正是靠它。
      resizable: false,
      maximizable: false,
      minimizable: true,
      skipTaskbar: !w.showInTaskbar,
      hasShadow: false,
      backgroundColor: '#00000000',
      title: '摸鱼阅读'
    })
    this.win = win
    this.expandedBounds = bounds

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

    this.surface = new WindowSurface(win, () => this.deps.config.get())

    this.watcher = new WindowLeaveWatcher({
      getWindowId: () => this.win?.id ?? null,
      getBounds: () => (this.mode === 'expanded' ? this.expandedBounds : null),
      getMode: () => this.mode,
      getConfig: () => this.deps.config.get(),
      registry: this.deps.registry,
      onCollapse: () => this.collapse()
    })

    this.deps.registry.add(win, { blocksAutoHide: false })

    win.on('resize', () => {
      if (this.mode === 'expanded') this.expandedBounds = win.getBounds()
      this.recomputeLayout()
    })
    win.on('move', () => {
      // 拖动窗口时每次 setPosition 都会触发本事件。这时绝不能 reassert()：
      // 它会重放整套窗口属性（置顶、焦点、任务栏、阴影、透明度），
      // 每 16ms 来一遍就是持续闪烁。拖动只需移动位置，属性一个都不用碰。
      if (this.dragAnchor) return

      if (this.mode === 'expanded') {
        this.expandedBounds = win.getBounds()
        this.persistExpandedBounds()
      }
      this.reassert()
    })
    win.on('restore', () => {
      if (this.mode === 'minimized') this.transitionTo('expanded')
      this.reassert()
    })
    win.on('closed', () => {
      this.deps.registry.remove(win.id)
      this.win = null
    })

    this.loadChrome()

    // 必须显式撑开 chrome 视图。WebContentsView 默认是 0×0，
    // 不设置的话顶栏、底栏与悬浮球全都不会绘制——
    // 而标签页是另一层视图，所以「网页能显示」会掩盖这个问题。
    this.recomputeLayout()
    this.watcher.start()
  }

  private loadChrome(): void {
    const chrome = this.chrome
    if (!chrome) return
    chrome.webContents.loadURL(this.deps.rendererUrl).catch((err) => {
      log.error('加载界面失败', err)
    })
    chrome.webContents.on('did-finish-load', () => this.applySurface())
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
    // 收起态下不重算版面：那时的 52×52 不是版面尺寸
    if (this.mode === 'collapsed') return

    this.layout = computeLayout(width, height, TOP_BAR_H, BOTTOM_BAR_H)
    this.chrome?.setBounds({ x: 0, y: 0, width, height })
    this.applySurface()
  }

  // ------------------------------------------------------------ 状态

  getMode(): WindowMode {
    return this.mode
  }

  getRuntime(): WindowRuntime {
    const cfg = this.deps.config.get()
    return {
      mode: this.mode,
      opacity: cfg.window.opacity,
      ballCorner: cfg.stealth.ballCorner
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

    // 标签页视图只在展开态绘制。收起时它们必须让位给悬浮球，
    // 否则球的位置会露出网页内容的一角。
    this.deps.onVisibilityChange(next === 'expanded')

    this.applySurface()
    this.deps.onStateChange()
  }

  // ------------------------------------------------------------ 收起 / 展开

  /** 收起成悬浮球。整个界面缩到屏幕角落的一颗球。 */
  collapse(): void {
    const win = this.win
    if (!win || this.mode === 'collapsed') return
    if (this.mode !== 'expanded') return

    // 记下展开时的矩形，展开时原样恢复
    this.expandedBounds = win.getBounds()
    this.persistExpandedBounds()

    const cfg = this.deps.config.get()
    const ball = this.ballBounds()

    this.transitionTo('collapsed')
    this.surface?.apply({
      mode: 'collapsed',
      windowRect: ball,
      opacity: cfg.window.opacity
    })

    this.resizeChromeToWindow()
    this.watcher?.rearm()
  }

  /** 展开回完整界面，恢复收起前的尺寸与位置。 */
  expand(): void {
    const win = this.win
    if (!win) return
    if (this.mode === 'collapsed') this.transitionTo('expanded')

    const target = this.expandedBounds ?? defaultExpandedBounds(this.deps.config.get())
    this.surface?.apply({
      mode: 'expanded',
      windowRect: target,
      opacity: this.deps.config.get().window.opacity
    })

    this.recomputeLayout()
    this.resizeChromeToWindow()
    // 重新开始计时，避免刚展开就被判定为「光标在外」而立刻收起
    this.watcher?.rearm()

    win.showInactive()
    this.reassert()
  }

  /**
   * 悬浮球当前的屏幕矩形。
   *
   * 由「展开态的窗口矩形 + 停靠角」推出来，而不是另外挑一个屏幕角落：
   * 球本来就画在窗口的那个角上，收起只是把窗口缩到它身上。
   */
  private ballBounds(): Rect {
    const cfg = this.deps.config.get()
    const base = this.expandedBounds ?? this.win?.getBounds() ?? {
      x: 0,
      y: 0,
      width: SIZE_PRESETS.medium.width,
      height: SIZE_PRESETS.medium.height
    }
    const size = effectiveBallSize(cfg.stealth.ballSize, cfg.stealth.ballCorner)
    return ballDockRect(cfg.stealth.ballCorner, base, size)
  }

  /** 隐藏窗口时，chrome 视图要铺满当前窗口尺寸 */
  private resizeChromeToWindow(): void {
    const win = this.win
    if (!win || !this.chrome) return
    const b = win.getBounds()
    this.chrome.setBounds({ x: 0, y: 0, width: b.width, height: b.height })
  }

  /** 换一个停靠角。若当前正处于收起态，窗口要跟着挪到新的球位上。 */
  setBallCorner(corner: BallCorner): void {
    this.deps.config.set((cfg) => ({ ...cfg, stealth: { ...cfg.stealth, ballCorner: corner } }))
    if (this.mode === 'collapsed') {
      const ball = this.ballBounds()
      this.surface?.apply({
        mode: 'collapsed',
        windowRect: ball,
        opacity: this.deps.config.get().window.opacity
      })
    }
    this.deps.onStateChange()
  }

  // ------------------------------------------------------------ 动作

  /**
   * 把窗口叫回来。用 showInactive 避免抢走用户编辑器的焦点——
   * 那是最容易被发现的破绽。
   *
   * 从托盘或最小化恢复时，若停在收起态则一并展开：
   * 用户按托盘「现形」想看的是完整界面，不是一颗球。
   */
  show(): void {
    const win = this.win
    if (!win) return
    if (win.isMinimized()) win.restore()
    if (this.mode !== 'expanded') this.transitionTo('expanded')
    win.showInactive()
    this.reassert()
  }

  /** 藏进托盘。先淡出再 hide()，避免出现生硬的闪断。 */
  async hideToTray(): Promise<void> {
    const win = this.win
    if (!win || this.mode === 'trayHidden') return

    // 从收起态直接进托盘时不做淡出：那时窗里只有一颗球，渐隐反而更扎眼
    if (this.mode !== 'collapsed') {
      this.surface?.apply({
        mode: this.mode,
        windowRect: win.getBounds(),
        opacity: 0
      })
      await delay(140)
    }
    this.transitionTo('trayHidden')
    win.hide()
  }

  minimize(): void {
    const win = this.win
    if (!win) return
    this.transitionTo('minimized')
    win.minimize()
  }

  setOpacity(value: number): void {
    this.deps.config.set((cfg) => ({ ...cfg, window: { ...cfg.window, opacity: value } }))
    if (this.mode !== 'expanded') return
    const win = this.win
    if (!win) return
    this.surface?.apply({ mode: 'expanded', windowRect: win.getBounds(), opacity: value })
    this.deps.onStateChange()
  }

  setSize(input: { preset: SizePreset } | { width: number; height: number }): void {
    const win = this.win
    if (!win || this.mode !== 'expanded') return
    const { width, height } = 'preset' in input ? SIZE_PRESETS[input.preset] : input
    const b = win.getBounds()
    win.setBounds({ x: b.x, y: b.y, width, height })
    this.recomputeLayout()
  }

  setMiniMode(enabled: boolean): void {
    const win = this.win
    if (!win || this.mode !== 'expanded') return
    const cfg = this.deps.config.get()
    if (enabled === cfg.window.miniMode) return

    const current = win.getBounds()
    if (enabled) {
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
    // 先停轮询与拖动跟踪，再拆窗口：反过来的话定时器会在窗口销毁后继续 tick
    this.watcher?.stop()
    if (this.dragTimer) {
      clearInterval(this.dragTimer)
      this.dragTimer = null
    }
    this.dragAnchor = null
    if (this.mode === 'quitting') return
    this.mode = 'quitting'
    try {
      this.chrome?.webContents.close()
    } catch {
      // 退出路径，忽略
    }
    try {
      this.win?.destroy()
    } catch {
      // 窗口可能已随进程退出被系统回收
    }
    this.win = null
  }

  // ------------------------------------------------------------ 拖动

  /**
   * 拖动窗口。
   *
   * 不用 `-webkit-app-region: drag`：那个原生拖动会吞掉点击，而悬浮球正是靠
   * 点击来切换收起与展开的，两者不能共存。
   *
   * 因此自己实现，并且**由主进程驱动**：主进程读得到全局光标位置，
   * 每 16ms 把窗口挪到「光标位移」对应的位置上。窗口跟着光标走，
   * 光标就一直停在球上，松开事件也就不会丢失——这是渲染进程自己
   * 跟踪 mousemove 做不到的（指针一旦离开窗口，渲染进程就收不到事件了，
   * 窗口会僵在原地，拖动当场断掉）。
   */
  beginDrag(): void {
    const win = this.win
    if (!win || this.dragAnchor) return
    const cursor = screen.getCursorScreenPoint()
    const b = win.getBounds()
    this.dragAnchor = { cursorX: cursor.x, cursorY: cursor.y, winX: b.x, winY: b.y }
    this.dragTimer = setInterval(() => this.tickDrag(), DRAG_TICK_MS)
  }

  endDrag(): void {
    if (this.dragTimer) {
      clearInterval(this.dragTimer)
      this.dragTimer = null
    }
    if (!this.dragAnchor) return
    this.dragAnchor = null
    this.syncBoundsMemory()
  }

  private tickDrag(): void {
    const win = this.win
    const anchor = this.dragAnchor
    if (!win || !anchor) return

    const cursor = screen.getCursorScreenPoint()
    const x = anchor.winX + (cursor.x - anchor.cursorX)
    const y = anchor.winY + (cursor.y - anchor.cursorY)

    const b = win.getBounds()
    if (b.x === x && b.y === y) return

    // 拖动期间光标在球上（窗口跟着它走），但仍要清掉「离开计时」，
    // 免得自动收起在一个拖动刚结束时被触发
    this.watcher?.rearm()

    try {
      win.setPosition(x, y)
    } catch {
      // 窗口可能在拖动途中被销毁，忽略
    }
  }

  /**
   * 把当前窗口位置记进「展开态矩形」并落盘。
   *
   * 收起态下窗口就是一颗球，它的矩形不能直接当作展开尺寸，
   * 需要反推出「球停在原处时，展开的窗口该在哪」，再记下来。
   */
  private syncBoundsMemory(): void {
    const win = this.win
    if (!win) return
    const b = win.getBounds()

    if (this.mode === 'expanded') {
      this.expandedBounds = b
    } else {
      const cfg = this.deps.config.get()
      const { width, height } = cfg.window
      const corner = cfg.stealth.ballCorner
      const size = effectiveBallSize(cfg.stealth.ballSize, corner)
      const offX = corner.endsWith('right') ? width - size - BALL_MARGIN : BALL_MARGIN
      const bar = corner.startsWith('bottom') ? BOTTOM_BAR_H : TOP_BAR_H
      const offY = corner.startsWith('bottom')
        ? height - bar + Math.round((bar - size) / 2)
        : Math.round((bar - size) / 2)
      this.expandedBounds = { x: b.x - offX, y: b.y - offY, width, height }
    }

    this.persistExpandedBounds()
  }

  /** 把展开态矩形落盘 */
  private persistExpandedBounds(): void {
    const target = this.expandedBounds
    if (!target) return
    this.deps.config.set((cfg) => ({
      ...cfg,
      window: {
        ...cfg.window,
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height
      }
    }))
  }

  // ------------------------------------------------------------ 内部

  private applySurface(): void {
    const win = this.win
    if (!win) return
    const cfg = this.deps.config.get()
    const windowRect =
      this.mode === 'collapsed' ? this.ballBounds() : (this.expandedBounds ?? win.getBounds())
    this.surface?.apply({ mode: this.mode, windowRect, opacity: cfg.window.opacity })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveInitialOrigin(w: { x: number | null; y: number | null }): { x: number; y: number } {
  if (w.x !== null && w.y !== null) return { x: w.x, y: w.y }
  const area = screen.getPrimaryDisplay().workArea
  const { width, height } = SIZE_PRESETS.medium
  return {
    x: area.x + area.width - width - 48,
    y: area.y + Math.round((area.height - height) / 2)
  }
}

function defaultExpandedBounds(cfg: { window: { width: number; height: number } }): Rect {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + area.width - cfg.window.width - 48,
    y: area.y + Math.round((area.height - cfg.window.height) / 2),
    width: cfg.window.width,
    height: cfg.window.height
  }
}
