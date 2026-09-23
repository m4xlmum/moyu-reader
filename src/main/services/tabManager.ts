/**
 * 标签页管理：每个标签页一个 WebContentsView，叠加在 chrome 视图之上、限制在主体区域内。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { WebContentsView, type BaseWindow, type Session } from 'electron'
import { HOME_TITLE, HOME_URL, SETTINGS_TITLE, SETTINGS_URL } from '@shared/constants'
import type { Rect, TabState } from '@shared/types'
import { resolveInput } from '@shared/url'
import { uaFor, type UaMode } from '@shared/ua'
import { injectPageStyles } from './pageStyler'
import { rendererUrl } from './rendererUrl'
import { log } from './logger'

/**
 * 自家页面（带 preload，以伪地址示人）与访客页（纯网页，无 preload）。
 * 两者绝不共用视图：给访客页注入 preload 等于把主进程能力交给任意网页。
 */
export type TabKind = 'home' | 'settings' | 'guest'

/** 自家页面：渲染产物名、对外伪地址与标签标题 */
const OWN_PAGE: Record<'home' | 'settings', { page: 'home' | 'settings'; url: string; title: string }> =
  {
    home: { page: 'home', url: HOME_URL, title: HOME_TITLE },
    settings: { page: 'settings', url: SETTINGS_URL, title: SETTINGS_TITLE }
  }

const isOwnPage = (kind: TabKind): kind is 'home' | 'settings' => kind !== 'guest'

interface TabEntry {
  id: string
  kind: TabKind
  view: WebContentsView
  url: string
  title: string
  faviconUrl?: string
  isLoading: boolean
  uaMode: UaMode
  zoom: number
  muted: boolean
}

export interface TabManagerDeps {
  getWindow: () => BaseWindow | null
  getBodyRect: () => Rect
  getSession: () => Session
  /** 首页标签页需要 preload 才能读到站点与历史 */
  getPreloadPath: () => string
  getConfig: () => {
    browser: {
      defaultUaMode: UaMode
      defaultZoom: number
      hideScrollbars: boolean
      newWindowAsTab: boolean
      searchTemplate: string
    }
  }
  onStateChange: () => void
  onNavigated: (entry: { url: string; title: string; faviconUrl?: string }) => void
}

let seq = 0
const nextId = (): string => `tab-${Date.now().toString(36)}-${(seq++).toString(36)}`

export class TabManager {
  private tabs = new Map<string, TabEntry>()
  private order: string[] = []
  private activeId: string | null = null
  /** 主体隐藏时为 true，此时所有标签页视图都不绘制且静音 */
  private bodyVisible = true

  constructor(private readonly deps: TabManagerDeps) {}

  // ------------------------------------------------------------ 查询

  list(): TabState[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((t): t is TabEntry => Boolean(t))
      .map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title || t.url,
        faviconUrl: t.faviconUrl,
        isLoading: t.isLoading,
        canGoBack: this.canGoBack(t),
        canGoForward: this.canGoForward(t),
        isActive: t.id === this.activeId,
        uaMode: t.uaMode,
        zoom: t.zoom,
        muted: t.muted
      }))
  }

  getActiveId(): string | null {
    return this.activeId
  }

  /** 供会话恢复使用的网址列表。首页不是访客内容，不参与恢复。 */
  getOpenUrls(): string[] {
    const urls: string[] = []
    for (const id of this.order) {
      const entry = this.tabs.get(id)
      if (entry && entry.kind === 'guest' && entry.url) urls.push(entry.url)
    }
    return urls
  }

  private canGoBack(t: TabEntry): boolean {
    try {
      return t.view.webContents.navigationHistory.canGoBack()
    } catch {
      return false
    }
  }

  private canGoForward(t: TabEntry): boolean {
    try {
      return t.view.webContents.navigationHistory.canGoForward()
    } catch {
      return false
    }
  }

  // ------------------------------------------------------------ 生命周期

  create(input: { url?: string; activate?: boolean; kind?: TabKind } = {}): string {
    const win = this.deps.getWindow()
    if (!win) throw new Error('窗口尚未就绪')

    const cfg = this.deps.getConfig().browser
    const kind: TabKind = input.kind ?? 'guest'
    const id = nextId()

    const view = new WebContentsView({
      webPreferences: {
        // 访客页面不注入任何 preload，是纯网页。
        // 一切注入都走主进程的 insertCSS / executeJavaScript。
        // 只有自家页面（首页、个人中心）带 preload，且 preload 内部还会再校验来源。
        preload: isOwnPage(kind) ? this.deps.getPreloadPath() : undefined,
        session: this.deps.getSession(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    // 必须设成全透明，否则会在透明窗口里画出一块白底（spike Q1/Q2）
    view.setBackgroundColor('#00000000')

    const own = isOwnPage(kind) ? OWN_PAGE[kind] : null
    const entry: TabEntry = {
      id,
      kind,
      view,
      url: own ? own.url : 'about:blank',
      title: own ? own.title : '',
      isLoading: false,
      uaMode: cfg.defaultUaMode,
      zoom: cfg.defaultZoom,
      muted: false
    }
    this.tabs.set(id, entry)
    this.order.push(id)

    win.contentView.addChildView(view)
    this.layoutTab(entry)
    this.wireEvents(entry)

    if (own) {
      view.webContents.loadURL(rendererUrl(own.page)).catch((err) => {
        log.error(`加载${own.title}失败`, err)
      })
    } else if (input.url && input.url !== 'about:blank') {
      // about:blank 是视图的初始状态，再 loadURL 一次会被 Chromium 判为
      // 中止的导航并抛出 ERR_ABORTED，没有意义
      this.goto(id, input.url)
    }

    if (input.activate !== false) this.activate(id)

    view.setVisible(this.bodyVisible)
    this.deps.onStateChange()
    return id
  }

  /** 某一类自家页面的标签页 id（若存在） */
  private findOwnTabId(kind: 'home' | 'settings'): string | null {
    for (const id of this.order) {
      if (this.tabs.get(id)?.kind === kind) return id
    }
    return null
  }

  /**
   * 打开首页：已有首页标签页就切过去，否则新建一个。
   * 首页是常驻的一张标签页，不随导航消失——它是「回到起点」的落点。
   */
  openHome(): string {
    return this.openOwn('home')
  }

  /**
   * 打开个人中心。
   *
   * 与首页同一条路：它是窗口内的一页，而不是一扇独立窗口。独立窗口会出现在
   * 任务栏与 Alt+Tab 里，等于把「我在摸鱼」写在脸上——那正是它原来的样子。
   */
  openSettings(): string {
    return this.openOwn('settings')
  }

  private openOwn(kind: 'home' | 'settings'): string {
    const existing = this.findOwnTabId(kind)
    if (existing) {
      this.activate(existing)
      return existing
    }
    return this.create({ kind, activate: true })
  }

  close(tabId: string): void {
    const entry = this.tabs.get(tabId)
    if (!entry) return

    const win = this.deps.getWindow()
    try {
      win?.contentView.removeChildView(entry.view)
    } catch {
      // 窗口可能已在销毁中
    }
    // 关闭视图不会关闭其 webContents，必须显式关闭，
    // 否则渲染进程会残留（这是必然泄漏，不是偶发）。
    try {
      entry.view.webContents.close()
    } catch (err) {
      log.warn('关闭标签页 webContents 失败', err)
    }

    this.tabs.delete(tabId)
    this.order = this.order.filter((id) => id !== tabId)

    if (this.activeId === tabId) {
      this.activeId = null
      const next = this.order[this.order.length - 1]
      if (next) this.activate(next)
    }

    this.deps.onStateChange()
  }

  activate(tabId: string): void {
    const entry = this.tabs.get(tabId)
    if (!entry) return
    this.activeId = tabId

    for (const [id, t] of this.tabs) {
      const visible = id === tabId && this.bodyVisible
      try {
        t.view.setVisible(visible)
      } catch (err) {
        log.warn('切换标签页可见性失败', err)
      }
    }
    this.layoutTab(entry)
    this.deps.onStateChange()
  }

  reorder(tabId: string, toIndex: number): void {
    const from = this.order.indexOf(tabId)
    if (from < 0) return
    const clamped = Math.max(0, Math.min(this.order.length - 1, toIndex))
    this.order.splice(from, 1)
    this.order.splice(clamped, 0, tabId)
    this.deps.onStateChange()
  }

  // ------------------------------------------------------------ 主体显隐

  /**
   * 主体隐藏时把所有标签页视图设为不绘制并静音。
   * 仅仅是「不绘制」还不够——网页若在播放音频，用户会立刻发现。
   */
  setBodyVisible(visible: boolean, muteMedia: boolean): void {
    this.bodyVisible = visible
    for (const [id, t] of this.tabs) {
      try {
        t.view.setVisible(visible && id === this.activeId)
      } catch (err) {
        log.warn('同步主体显隐失败', err)
      }
      if (muteMedia) {
        try {
          t.view.webContents.setAudioMuted(!visible)
        } catch {
          // 页面可能已销毁
        }
      }
    }
  }

  // ------------------------------------------------------------ 广播

  /**
   * 把广播发给自家页面（首页、个人中心）。
   *
   * 只按 kind 挑选，而不是撒给全部 webContents：访客页面没有 preload，
   * 收不到也没人听，而自家页面需要跟着配置变化重绘——起始页换主题
   * 正是一条配置变更。
   */
  broadcastToOwnPages(channel: string, payload: unknown): void {
    for (const entry of this.tabs.values()) {
      if (!isOwnPage(entry.kind)) continue
      try {
        if (!entry.view.webContents.isDestroyed()) entry.view.webContents.send(channel, payload)
      } catch {
        // 页面可能正在销毁
      }
    }
  }

  // ------------------------------------------------------------ 导航

  goto(tabId: string, input: string): void {
    const entry = this.tabs.get(tabId)
    if (!entry) return

    // 自家页面不承载访客内容——它们带着 preload。
    // 在它们上面打开网址意味着另开一个访客标签页，原页面始终留在原处。
    if (entry.kind !== 'guest') {
      this.create({ url: input, activate: true })
      return
    }

    const url = resolveInput(input, this.deps.getConfig().browser.searchTemplate)
    entry.view.webContents.loadURL(url).catch((err) => {
      log.warn(`加载失败 ${url}`, err)
    })
  }

  back(tabId: string): void {
    const wc = this.tabs.get(tabId)?.view.webContents
    try {
      if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    } catch {
      // 忽略
    }
  }

  forward(tabId: string): void {
    const wc = this.tabs.get(tabId)?.view.webContents
    try {
      if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    } catch {
      // 忽略
    }
  }

  reload(tabId: string): void {
    try {
      this.tabs.get(tabId)?.view.webContents.reload()
    } catch {
      // 忽略
    }
  }

  stop(tabId: string): void {
    try {
      this.tabs.get(tabId)?.view.webContents.stop()
    } catch {
      // 忽略
    }
  }

  setZoom(tabId: string, op: 'in' | 'out' | 'reset' | 'set', value?: number): number {
    const entry = this.tabs.get(tabId)
    if (!entry) return 1
    const wc = entry.view.webContents
    let levels: number
    try {
      levels = wc.zoomLevel
    } catch {
      return entry.zoom
    }

    if (op === 'reset') levels = 0
    else if (op === 'in') levels = Math.min(5, levels + 0.5)
    else if (op === 'out') levels = Math.max(-4, levels - 0.5)
    else if (typeof value === 'number') {
      levels = Math.log(value) / Math.log(1.2)
    }

    try {
      wc.zoomLevel = levels
      entry.zoom = 1.2 ** levels
    } catch (err) {
      log.warn('设置缩放失败', err)
    }
    this.deps.onStateChange()
    return entry.zoom
  }

  setUa(tabId: string, mode: UaMode): string {
    const entry = this.tabs.get(tabId)
    if (!entry) return ''
    entry.uaMode = mode
    const ua = uaFor(mode)
    try {
      entry.view.webContents.setUserAgent(ua)
      // 改 UA 需要重新加载才生效
      entry.view.webContents.reload()
    } catch (err) {
      log.warn('设置 UA 失败', err)
    }
    this.deps.onStateChange()
    return ua
  }

  // ------------------------------------------------------------ 版面

  /** 主体区域变化时重新摆放所有标签页视图 */
  layoutAll(): void {
    for (const entry of this.tabs.values()) this.layoutTab(entry)
  }

  private layoutTab(entry: TabEntry): void {
    const r = this.deps.getBodyRect()
    try {
      entry.view.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height })
    } catch (err) {
      log.warn('摆放标签页视图失败', err)
    }
  }

  // ------------------------------------------------------------ 事件

  private wireEvents(entry: TabEntry): void {
    const wc = entry.view.webContents

    const refresh = (): void => this.deps.onStateChange()

    wc.on('did-start-loading', () => {
      entry.isLoading = true
      refresh()
    })
    wc.on('did-stop-loading', () => {
      entry.isLoading = false
      refresh()
    })
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      log.warn(`页面加载失败 [${errorCode} ${errorDescription}] ${validatedURL}`)
    })

    wc.on('did-navigate', (_e, url) => {
      // 自家页面对外始终以自己的伪地址示人。
      // 若不这样处理，did-navigate 会把真实文件路径写进 entry.url，
      // 地址栏就会显示出本机的目录结构。
      entry.url = entry.kind === 'guest' ? url : OWN_PAGE[entry.kind].url
      // 页面文档已重建，样式必须重新注入
      void injectPageStyles(wc, { hideScrollbars: this.deps.getConfig().browser.hideScrollbars })
      // UA 会随导航重置，需按本标签页的模式重新应用。
      // 桌面模式用的是空字符串（表示「用 Electron 默认值」），
      // 把空串交给 setUserAgent 会清掉 UA，因此只在手机模式下设置。
      const ua = uaFor(entry.uaMode)
      if (ua) {
        try {
          wc.setUserAgent(ua)
        } catch {
          // 忽略
        }
      }
      // 首页不进历史，否则「继续上次阅读」会指回首页自身
      if (entry.kind === 'guest') {
        this.deps.onNavigated({ url, title: entry.title, faviconUrl: entry.faviconUrl })
      }
      refresh()
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return
      entry.url = url
      // 首页不进历史，否则「继续上次阅读」会指回首页自身
      if (entry.kind === 'guest') {
        this.deps.onNavigated({ url, title: entry.title, faviconUrl: entry.faviconUrl })
      }
      refresh()
    })
    wc.on('page-title-updated', (_e, title) => {
      entry.title = title
      refresh()
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      entry.faviconUrl = favicons[0]
      refresh()
    })
    wc.on('did-finish-load', () => {
      void injectPageStyles(wc, { hideScrollbars: this.deps.getConfig().browser.hideScrollbars })
      refresh()
    })

    // target=_blank 必须变成标签页，否则会冒出一个不受管理的野生窗口
    wc.setWindowOpenHandler(({ url }) => {
      if (this.deps.getConfig().browser.newWindowAsTab) {
        this.create({ url, activate: true })
      }
      return { action: 'deny' }
    })
  }

  /** 窗口销毁时释放全部标签页 */
  destroyAll(): void {
    for (const id of [...this.order]) this.close(id)
  }
}
