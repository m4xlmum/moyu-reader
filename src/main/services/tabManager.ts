/**
 * 标签页管理：每个标签页一个 WebContentsView，叠加在 chrome 视图之上、限制在主体区域内。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { WebContentsView, type BaseWindow, type Session } from 'electron'
import type { Rect, TabState } from '@shared/types'
import { resolveInput } from '@shared/url'
import { uaFor, type UaMode } from '@shared/ua'
import { injectPageStyles } from './pageStyler'
import { log } from './logger'

interface TabEntry {
  id: string
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

  getOpenUrls(): string[] {
    return this.order.map((id) => this.tabs.get(id)?.url ?? '').filter(Boolean)
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

  create(input: { url?: string; activate?: boolean } = {}): string {
    const win = this.deps.getWindow()
    if (!win) throw new Error('窗口尚未就绪')

    const cfg = this.deps.getConfig().browser
    const id = nextId()
    const view = new WebContentsView({
      webPreferences: {
        // 访客页面不注入任何 preload，是纯网页。
        // 一切注入都走主进程的 insertCSS / executeJavaScript。
        session: this.deps.getSession(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    // 必须设成全透明，否则会在透明窗口里画出一块白底（spike Q1/Q2）
    view.setBackgroundColor('#00000000')

    const entry: TabEntry = {
      id,
      view,
      url: 'about:blank',
      title: '',
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

    // about:blank 是视图的初始状态，再 loadURL 一次会被 Chromium 判为
    // 中止的导航并抛出 ERR_ABORTED，没有意义
    if (input.url && input.url !== 'about:blank') this.goto(id, input.url)
    if (input.activate !== false) this.activate(id)

    view.setVisible(this.bodyVisible)
    this.deps.onStateChange()
    return id
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

  // ------------------------------------------------------------ 导航

  goto(tabId: string, input: string): void {
    const entry = this.tabs.get(tabId)
    if (!entry) return
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
    wc.on('did-navigate', (_e, url) => {
      entry.url = url
      // 页面文档已重建，样式必须重新注入
      void injectPageStyles(wc, { hideScrollbars: this.deps.getConfig().browser.hideScrollbars })
      // UA 会随导航重置，需按本标签页的模式重新应用
      try {
        wc.setUserAgent(uaFor(entry.uaMode))
      } catch {
        // 忽略
      }
      this.deps.onNavigated({ url, title: entry.title, faviconUrl: entry.faviconUrl })
      refresh()
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return
      entry.url = url
      this.deps.onNavigated({ url, title: entry.title, faviconUrl: entry.faviconUrl })
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
