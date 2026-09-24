/**
 * 视图管理：每个标签页一个 WebContentsView，叠加在 chrome 视图之上、限制在主体区域内。
 *
 * 这里管两种视图，它们不共用同一本账：
 *
 * - **网页标签**（kind = 'guest'）：标签条画的就是它们，`order` 记着它们的次序；
 * - **自家的两屏**（起始页、系统设置）：也在这一层视图里（独立窗口会进任务栏与
 *   Alt+Tab，等于把「我在摸鱼」写在脸上），但**不是标签页**——不进 `order`、
 *   没有关闭键、各有各的入口（起始页是顶栏左上角那颗键，设置是右栏栏底那一格）。
 *
 * 两者共用同一套机制（视图、可见性、版面、广播），差别只在上面那本账。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import {
  WebContentsView,
  type BaseWindow,
  type Session,
  type WebContents,
  type WebFrameMain
} from 'electron'
import {
  DEFAULT_NEW_TAB_URL,
  HOME_TITLE,
  HOME_URL,
  SETTINGS_TITLE,
  SETTINGS_URL
} from '@shared/constants'
import type { TabsStatePayload } from '@shared/ipc'
import type { OwnScreen, Rect, TabState } from '@shared/types'
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
const OWN_PAGE: Record<OwnScreen, { page: 'home' | 'settings'; url: string; title: string }> = {
  home: { page: 'home', url: HOME_URL, title: HOME_TITLE },
  settings: { page: 'settings', url: SETTINGS_URL, title: SETTINGS_TITLE }
}

const isOwnPage = (kind: TabKind): kind is OwnScreen => kind !== 'guest'

/**
 * 暂停网页里正在播放的音视频。**暂停，不是静音。**
 *
 * 收起成球或藏进托盘时窗口虽然不在屏幕上，网页那一侧仍是一个活着的渲染进程：
 * 视频会照常往下播，用户回来时进度已经跑掉了。`setAudioMuted` 只解决听得到
 * 的那一半（它仍然要留着——Web Audio 与我们暂停不到的播放器都靠它闭麦）。
 *
 * 记号打成一个展开属性（`__moyuPaused`）而不是 `data-` 属性：后者会出现在 DOM 里，
 * 页面自己能看见。也正因为记号在元素上，页面换了播放器元素、或者整页导航走了，
 * 这份账就自然作废，不会出现「恢复了一个已经不存在的播放器」。
 */
const PAUSE_PLAYING_MEDIA = `(() => {
  let n = 0
  for (const el of document.querySelectorAll('video, audio')) {
    if (el.paused || el.ended) continue
    el.__moyuPaused = true
    el.pause()
    n += 1
  }
  return n
})()`

/**
 * 恢复**我们自己**按下去的暂停。
 *
 * 只认那个记号：用户自己按了暂停的视频，展开时不该被我们放起来——那比不暂停更烦。
 * 万一 `play()` 被拦下来（自动播放策略、DRM），就让它停着：停在原处总比误放强。
 */
const RESUME_PAUSED_MEDIA = `(() => {
  let n = 0
  for (const el of document.querySelectorAll('video, audio')) {
    if (el.__moyuPaused !== true) continue
    delete el.__moyuPaused
    n += 1
    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }
  return n
})()`

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
      newTabUrl: string
    }
  }
  onStateChange: () => void
  onNavigated: (entry: { url: string; title: string; faviconUrl?: string }) => void
  /**
   * 刚刚有一个标签页视图被加到最上层。
   *
   * 界面层（chrome 视图）有时必须压在网页之上——最大化时右上角那组控件、
   * 光标贴到窗口边框时左 / 下两条边的手柄（见 WindowController.syncChromeOrder）。
   * 而新建视图永远是加到最上层的，那一下就会把界面层盖住；改次序的只可能是
   * 界面层那一侧（它拿着 chrome 视图），于是这里只负责通知一声。
   */
  onViewAdded: () => void
  /**
   * 有标签页进了（true）或全部退出了（false）网页全屏。
   *
   * 只在**跃变**上报：从「没有页面在全屏」变成「有」，或反过来。
   * 后台标签页进出全屏不该掀动窗口，因此判据是整个集合的空 / 非空，
   * 而不是「谁进去了」。
   */
  onPageFullscreen: (active: boolean) => void
}

let seq = 0
const nextId = (): string => `tab-${Date.now().toString(36)}-${(seq++).toString(36)}`

export class TabManager {
  /** 全部视图：网页标签与自家那两屏都在这里（版面、显隐、广播按它走） */
  private tabs = new Map<string, TabEntry>()
  /** **标签条的次序**：只有网页标签。自家那两屏不进来，于是 list/reorder/会话恢复都不必再过滤 */
  private order: string[] = []
  /** 此刻画着的那一个（含自家那两屏）；对外只说成 activeTabId / screen 两份 */
  private activeId: string | null = null
  /** 自家那两屏的视图 id。各自只建一个，常驻不关 */
  private ownIds = new Map<OwnScreen, string>()
  /**
   * 上一次看着的那张网页。
   *
   * 从起始页 / 设置「原路返回」回的就是它。不需要另存一份「进屏之前的快照」：
   * 进这两屏不改动它，只有切到别张网页（或它被关掉）才会变。
   */
  private lastGuestId: string | null = null
  /** 主体隐藏时为 true，此时所有标签页视图都不绘制且静音 */
  private bodyVisible = true
  /**
   * 此刻停在网页全屏的标签页（按 webContents.id 记）。
   *
   * 记的是一个集合而不是一个布尔：同一时刻可能有好几个页面都在全屏
   * （用户切走了，先前那个还留在全屏态）。窗口那一侧只关心「有没有」，
   * 而退出全屏时要逐个退，因此这里必须记全。
   */
  private fullscreenTabs = new Set<number>()

  constructor(private readonly deps: TabManagerDeps) {}

  // ------------------------------------------------------------ 查询

  /** 标签条的内容。次序就是 `order` 的次序，自家那两屏不在其中 */
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

  /**
   * 正在看着的那张**网页**的 id；停在起始页 / 设置上时为 null。
   *
   * 自家那两屏在内部也占着 `activeId`（谁在上面只有一份账），但它们不是标签，
   * 对外不该以 id 示人——界面拿着那个 id 只会想切它、关它。
   */
  getActiveId(): string | null {
    const entry = this.activeId ? this.tabs.get(this.activeId) : null
    return entry && entry.kind === 'guest' ? entry.id : null
  }

  /** 正文区此刻是网页还是自家某一屏。看网页时为 null */
  getScreen(): OwnScreen | null {
    const entry = this.activeId ? this.tabs.get(this.activeId) : null
    return entry && isOwnPage(entry.kind) ? entry.kind : null
  }

  /**
   * 一份对外快照。
   *
   * 广播（index.ts）与 `tabs:list` 这两个出口共用它，省得两处各拼一份、
   * 哪天加了一个字段只补了一边。
   */
  snapshot(): TabsStatePayload {
    return { tabs: this.list(), activeTabId: this.getActiveId(), screen: this.getScreen() }
  }

  /** 供会话恢复使用的网址列表。起始页与设置不是访客内容，不参与恢复 */
  getOpenUrls(): string[] {
    const urls: string[] = []
    for (const id of this.order) {
      const entry = this.tabs.get(id)
      if (entry?.url) urls.push(entry.url)
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
        // 只有自家页面（首页、系统设置）带 preload，且 preload 内部还会再校验来源。
        preload: isOwnPage(kind) ? this.deps.getPreloadPath() : undefined,
        session: this.deps.getSession(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        /*
         * 网页进全屏时不让 Chromium 自己去改窗口尺寸，改由我们接管
         * （见 WindowController.setPageFullscreen）。
         *
         * 不关掉的话两边会同时动手：Chromium 按自己的算法摆一次窗口，
         * 我们再按「铺满工作区」摆一次，肉眼上是一次跳。关掉之后页面照常收到
         * requestFullscreen（视频照样铺满），只有窗口那一侧的动作归我们。
         */
        disableHtmlFullscreenWindowResize: true
      }
    })
    // 必须设成全透明，否则会在透明窗口里画出一块白底（spike Q1/Q2）
    view.setBackgroundColor('#00000000')

    const own = isOwnPage(kind) ? OWN_PAGE[kind] : null
    /*
     * 访客标签没给地址就是「新建标签页」：打开配置里的那一格（默认 google.com）。
     * 原先这一种退到 about:blank——透明窗口里那是一块透出桌面的空档，没有意义。
     * 地址仍走 goto 那条路解析，因此 `douyin.com` 这种不带协议的写法照旧认。
     */
    const url = own ? own.url : (input.url ?? this.newTabUrl())
    const entry: TabEntry = {
      id,
      kind,
      view,
      url,
      title: own ? own.title : '',
      isLoading: false,
      uaMode: cfg.defaultUaMode,
      zoom: cfg.defaultZoom,
      muted: false
    }
    this.tabs.set(id, entry)
    /*
     * 只有网页标签进标签条。自家那两屏在外面的身份是「屏」：各有各的入口、
     * 没有关闭键，因此不进 order；它们的 id 记在 ownIds 里，各自只建一个。
     */
    if (isOwnPage(kind)) this.ownIds.set(kind, id)
    else this.order.push(id)

    win.contentView.addChildView(view)
    this.layoutTab(entry)
    this.wireEvents(entry)
    // 新视图压在最上层，界面层若正需要待在上面就得重新抬一次（见 deps.onViewAdded）
    this.deps.onViewAdded()

    if (own) {
      view.webContents.loadURL(rendererUrl(own.page)).catch((err) => {
        log.error(`加载${own.title}失败`, err)
      })
    } else if (url && url !== 'about:blank') {
      // about:blank 是视图的初始状态，再 loadURL 一次会被 Chromium 判为
      // 中止的导航并抛出 ERR_ABORTED，没有意义
      this.goto(id, url)
    }

    if (input.activate !== false) this.activate(id)

    view.setVisible(this.bodyVisible)
    this.deps.onStateChange()
    return id
  }

  /**
   * 进起始页：顶栏左上角那颗键的落点。
   *
   * 它是常驻的一屏，不随导航消失——「回到起点」回到的就是它。
   */
  openHome(): void {
    this.openOwn('home')
  }

  /**
   * 进系统设置。
   *
   * 与起始页同一条路：窗口内的一屏，而不是一扇独立窗口。独立窗口会出现在
   * 任务栏与 Alt+Tab 里，等于把「我在摸鱼」写在脸上——那正是它原来的样子。
   */
  openSettings(): void {
    this.openOwn('settings')
  }

  /**
   * 从这两屏原路返回：回到进来之前那张网页。
   *
   * 那张网页要么已经不在了、要么从来就没有（刚启动，或者用户把它们全关了），
   * 这时落回起始页——正文区不能空着（透明窗口里空着就是一块透出桌面的空档）。
   *
   * 只在自家某一屏上时才动：看着网页时调它什么也不该发生，否则会莫名其妙
   * 切到「上一次那张网页」上去。
   */
  leaveScreen(): void {
    if (!this.getScreen()) return
    const back = this.lastGuestId ? this.tabs.get(this.lastGuestId) : null
    if (back && back.kind === 'guest') this.activate(back.id)
    else this.openHome()
  }

  private openOwn(kind: OwnScreen): void {
    const existing = this.ownIds.get(kind)
    if (existing && this.tabs.has(existing)) {
      this.activate(existing)
      return
    }
    this.create({ kind, activate: true })
  }

  /**
   * 「新建标签页」要打开的地址。
   *
   * 用户把设置里那一格写成空的时候回落到默认值——兜底只在这一处，
   * 设置页与界面都不必各自再判一次空。
   */
  private newTabUrl(): string {
    return this.deps.getConfig().browser.newTabUrl.trim() || DEFAULT_NEW_TAB_URL
  }

  /**
   * 关掉一张网页标签。
   *
   * 自家那两屏关不掉：界面上没有它们的关闭键，也就无从发出它们的 id；
   * 退出时由 destroyAll 直接拆。这条守卫是防着哪天多出一条路来。
   */
  close(tabId: string): void {
    const entry = this.tabs.get(tabId)
    if (!entry) return
    if (isOwnPage(entry.kind)) return

    this.dispose(entry)
    if (this.lastGuestId === tabId) this.lastGuestId = null

    if (this.activeId === tabId) {
      this.activeId = null
      const next = this.order[this.order.length - 1]
      /*
       * 关掉的是正在看着的那一张：还有网页就切到最后一张（既有规矩，不动），
       * 一张都不剩就落回起始页——正文区不能空着，透明窗口里空着就是一块
       * 透出桌面的空档。
       */
      if (next) this.activate(next)
      else this.openHome()
    }

    this.deps.onStateChange()
  }

  /** 拆掉一个视图：从窗口上摘下来、关掉它的 webContents、退掉全屏记账 */
  private dispose(entry: TabEntry): void {
    // 视图下面就要被关掉了，全屏记账要用的 id 得先拿到手
    const wcId = this.webContentsId(entry)
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

    this.tabs.delete(entry.id)
    if (isOwnPage(entry.kind)) this.ownIds.delete(entry.kind)
    else this.order = this.order.filter((id) => id !== entry.id)

    /*
     * 关掉一个正在全屏的标签页，与用户自己按退出全屏是一回事：
     * 场上已经没有全屏的页面了，窗口不该继续铺满工作区。
     * 交给同一个入口，判据（跃变）与所有权（autoMaximized）都只有那一条。
     */
    if (wcId !== null) this.setPageFullscreen(wcId, false)
  }

  activate(tabId: string): void {
    const entry = this.tabs.get(tabId)
    if (!entry) return
    this.activeId = tabId
    // 记下「刚才看着的是哪张网页」，起始页 / 设置上的「原路返回」回的就是它
    if (entry.kind === 'guest') this.lastGuestId = tabId

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
   * 主体隐藏时把所有标签页视图设为不绘制、暂停正在播放的媒体并静音。
   *
   * 仅仅是「不绘制」远远不够：网页那一侧照常活着，视频会继续往下播，
   * 用户回来时进度已经跑掉了（音视频一起，见那两个脚本）。
   */
  setBodyVisible(visible: boolean, muteMedia: boolean): void {
    this.bodyVisible = visible
    for (const [id, t] of this.tabs) {
      try {
        t.view.setVisible(visible && id === this.activeId)
      } catch (err) {
        log.warn('同步主体显隐失败', err)
      }
      if (!muteMedia) continue
      try {
        t.view.webContents.setAudioMuted(!visible)
      } catch {
        // 页面可能已销毁
      }
      this.setMediaPaused(t.view.webContents, !visible)
    }
  }

  /**
   * 让一页里所有框架一起暂停 / 恢复媒体。
   *
   * 逐帧跑，而不是只跑主框架：视频常常住在 iframe 里（各家网站的嵌入播放器都是），
   * 而跨源 iframe 的文档从顶层脚本够不着——主进程从 `framesInSubtree` 走没有这个限制。
   * 一次页面动作发一帧，互不等待；单帧失败（正在销毁、已拆掉）不该拖住其余的。
   */
  private setMediaPaused(wc: WebContents, paused: boolean): void {
    if (wc.isDestroyed()) return
    const script = paused ? PAUSE_PLAYING_MEDIA : RESUME_PAUSED_MEDIA
    let frames: WebFrameMain[]
    try {
      frames = wc.mainFrame.framesInSubtree
    } catch {
      return
    }
    for (const frame of frames) {
      try {
        const done = frame.executeJavaScript(script)
        if (done && typeof done.catch === 'function') done.catch(() => {})
      } catch {
        // 框架可能正在销毁
      }
    }
  }

  // ------------------------------------------------------------ 广播

  /**
   * 把广播发给自家页面（首页、系统设置）。
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

  /**
   * 在某个视图里打开一个地址。
   *
   * `tabId` 为 null 指的是「正文区此刻不在任何一张网页上」——停在起始页或
   * 系统设置上时就是这样。两条路都另开一张网页标签并切过去：
   *
   * - 没有当前视图；
   * - 当前视图是自家那两屏。它们不承载访客内容——带着 preload，
   *   网页进去就等于把主进程能力交给任意网页。原屏始终留在原处。
   *
   * 于是停在起始页上时，地址栏回车、点书签、点历史都是「新开一张网页」。
   * 解析仍走 resolveInput，`douyin.com` 那种写法照旧认。
   */
  goto(tabId: string | null, input: string): void {
    const entry = tabId ? this.tabs.get(tabId) : undefined

    if (!entry || entry.kind !== 'guest') {
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

  // ------------------------------------------------------------ 叠放次序

  /**
   * 把当前标签页的视图重新加到最上层。
   *
   * 界面层压到网页之上之后要让回去（见 WindowController.syncChromeOrder），
   * 而「场上有哪些视图、哪个是当前标签页」只有这一侧知道，因此由这里代劳。
   * 重新 addChildView 就是把它重排到最上层，不会多出一份（spike/vieworder.js Q1）。
   */
  raiseActive(): void {
    const win = this.deps.getWindow()
    const entry = this.activeId ? this.tabs.get(this.activeId) : null
    if (!win || !entry) return
    try {
      win.contentView.addChildView(entry.view)
    } catch {
      // 窗口可能已在销毁中
    }
  }

  // ------------------------------------------------------------ 网页全屏

  /**
   * 标签页的 webContents id。视图可能已在销毁中，取不到就当没有——
   * 要它的是全屏记账，而取不到 id 的那个标签页本来也快没了。
   */
  private webContentsId(entry: TabEntry): number | null {
    try {
      return entry.view.webContents.id
    } catch {
      return null
    }
  }

  /**
   * 记下这一刻哪个页面在全屏，并**只在跃变时**通知窗口那一侧。
   *
   * 跃变 = 集合从空变非空、或从非空变空。后台标签页进出全屏不该掀动窗口
   * （用户切走了，那个页面还留在全屏态），而「最后一个全屏的页面退出了」
   * 与「第一个页面进了全屏」正是窗口该动的两个时刻。
   */
  private setPageFullscreen(wcId: number, on: boolean): void {
    const had = this.fullscreenTabs.size > 0
    if (on) this.fullscreenTabs.add(wcId)
    else this.fullscreenTabs.delete(wcId)
    const has = this.fullscreenTabs.size > 0
    if (had === has) return
    this.deps.onPageFullscreen(has)
  }

  /**
   * 让所有停在网页全屏的标签页退出来。
   *
   * 窗口那一侧不再铺满工作区时（还原、收起成球）由它调用，见
   * WindowController.deps.onLeavePageFullscreen。
   *
   * `document.exitFullscreen()` 不要求用户手势（要手势的是 requestFullscreen），
   * 因此这里可以直接调。退出是异步的：它随后走到 leave-html-full-screen，
   * 而那条路是幂等的——集合里已经没有它了，不会再报一次跃变。
   *
   * 遍历的是标签页表而不是那个集合：退出带来的记账发生在事件到达时（异步），
   * 这一次同步遍历不会被它改到。
   */
  exitPageFullscreen(): void {
    for (const entry of this.tabs.values()) {
      const wcId = this.webContentsId(entry)
      if (wcId === null || !this.fullscreenTabs.has(wcId)) continue
      entry.view.webContents.executeJavaScript('document.exitFullscreen?.()').catch(() => {
        // 页面已经不在了、或者没允许脚本：那它也就没有全屏可退，忽略
      })
    }
  }

  // ------------------------------------------------------------ 事件

  /**
   * 给标签页注入网页样式。
   *
   * **自家页面必须跳过。** 注入的「背景透明」是 user origin 的 !important，
   * 在层叠顺序里压过作者样式表（含作者的 !important），而起始页与系统设置的
   * 底色正是写在 `html, body` 上的——于是自家页面的底板被一起抹掉，
   * 透明窗口里就露出桌面：打开系统设置时背景全透明就是这么来的。
   * 实测见 `spike/ownpage-bg.js`（注入前后各读一次 getComputedStyle）。
   *
   * 隐藏滚动条同理：自家页面 `overflow: hidden`，本来就不滚。
   */
  private applyPageStyles(entry: TabEntry): void {
    if (entry.kind !== 'guest') return
    void injectPageStyles(entry.view.webContents, {
      hideScrollbars: this.deps.getConfig().browser.hideScrollbars
    })
  }

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
      this.applyPageStyles(entry)
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
      this.applyPageStyles(entry)
      refresh()
    })

    /*
     * 网页自己的全屏。视频播放器右下角那枚键走的就是这条路，
     * 用户要的是「点它，软件窗口也跟着最大化」（见 setPageFullscreen）。
     *
     * 这两个事件此前没有任何监听者——网页进全屏之后，窗口原样不动，
     * 于是视频只铺满了正文那一块，而窗口还留着顶栏与右栏。
     */
    wc.on('enter-html-full-screen', () => this.setPageFullscreen(wc.id, true))
    wc.on('leave-html-full-screen', () => this.setPageFullscreen(wc.id, false))

    // target=_blank 必须变成标签页，否则会冒出一个不受管理的野生窗口
    wc.setWindowOpenHandler(({ url }) => {
      if (this.deps.getConfig().browser.newWindowAsTab) {
        this.create({ url, activate: true })
      }
      return { action: 'deny' }
    })
  }

  /**
   * 窗口销毁时释放全部视图。
   *
   * 遍历的是视图总表而不是标签条那一份次序：自家那两屏不在 order 里，
   * 照着 order 关就会漏掉它们——漏掉视图不拆、webContents 不关，
   * 那是两个渲染进程。
   */
  destroyAll(): void {
    for (const entry of [...this.tabs.values()]) this.dispose(entry)
    this.ownIds.clear()
    this.order = []
    this.activeId = null
    this.lastGuestId = null
  }
}
