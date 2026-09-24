/**
 * 主进程入口。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { app, BrowserWindow, type Session } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { BROADCAST } from '@shared/ipc'
import type { OpenPopoverRequest } from '@shared/ipc'
import type { Rect } from '@shared/types'
import type { AppContext } from './context'
import { registerBrowserIpc } from './ipc/registerBrowserIpc'
import { registerDataIpc } from './ipc/registerDataIpc'
import { registerWindowIpc } from './ipc/registerWindowIpc'
import { BookmarkStore } from './services/bookmarkStore'
import { BallIconStore } from './services/ballIconStore'
import { BossKeyService } from './services/bossKeyService'
import { ConfigStore } from './services/configStore'
import { HistoryStore } from './services/historyStore'
import { initLogger, log } from './services/logger'
import { PopoverWindowService } from './services/popoverWindow'
import { rendererUrl } from './services/rendererUrl'
import { hardenWebContents, setupSession } from './services/sessionSetup'
import { SiteStore } from './services/siteStore'
import { TabManager } from './services/tabManager'
import { TrayService } from './services/trayService'
import { WindowController } from './services/windowController'
import { WindowRegistry } from './services/windowRegistry'

// 必须是模块体的第一条语句。
// 注意 import 声明会被提升到它之前执行，所以上面那些模块都不能在
// 被导入时读取 userData —— 它们只接收目录作为构造参数，正是为此。
// Electron 的 userData 目录取自 app.getName()，打包后会变成 productName；
// 若显示名用中文，目录就成了 %APPDATA%\摸鱼阅读，非 ASCII 路径会破坏
// Chromium 的缓存与分区目录，且数据一旦落在那里很难迁回。
app.setName('moyu-reader')

// 窗口是置顶且透明的。Chromium 的原生遮挡检测可能判定它被遮挡而停止合成，
// 表现为画面空白或闪烁，因此关闭该检测。
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

const userDataDir = app.getPath('userData')

if (!app.requestSingleInstanceLock()) {
  // 第二个实例的唯一作用是把已有窗口叫出来
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  initLogger(userDataDir)
  log.info(`userData 目录：${userDataDir}`)

  const preloadPath = join(__dirname, '../preload/index.js')
  const trayIconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.ico')
    : join(__dirname, '../../resources/tray.ico')

  const config = new ConfigStore(userDataDir)
  const registry = new WindowRegistry()
  const sites = new SiteStore(userDataDir)
  const history = new HistoryStore(userDataDir)
  const bookmarks = new BookmarkStore(userDataDir)
  const ballIcon = new BallIconStore(userDataDir)
  const bossKeys = new BossKeyService()

  // session.fromPartition 只能在 app ready 之后调用，
  // 因此这里只留一个占位，真正的创建放在 whenReady 内。
  let ses: Session | null = null
  hardenWebContents()

  function broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
    const chrome = controller.getChromeView()
    if (chrome && !chrome.webContents.isDestroyed()) {
      chrome.webContents.send(channel, payload)
    }
    // 自家页面（首页、系统设置）也是渲染进程，只是住在标签页那一层视图里，
    // 不在上面两个集合中。起始页换主题靠的就是这条配置广播。
    tabsRef?.broadcastToOwnPages(channel, payload)
  }

  // tabs 与 controller 互相引用，用可变引用打破声明顺序上的死结
  let tabsRef: TabManager | null = null

  const controller = new WindowController({
    config,
    registry,
    preloadPath,
    rendererUrl: rendererUrl('index'),
    onVisibilityChange: (visible) => {
      tabsRef?.setBodyVisible(visible, config.get().stealth.muteMediaOnCollapse)
    },
    // 正文区是原生视图，版面一变就得显式重摆——它不跟着 CSS 走
    onLayoutChange: () => {
      tabsRef?.layoutAll()
    },
    onStateChange: () => {
      broadcast(BROADCAST.windowState, controller.getRuntime())
    }
  })

  const tabs = new TabManager({
    getWindow: () => controller.getWindow(),
    getBodyRect: () => controller.getBodyRect(),
    getSession: () => {
      if (!ses) throw new Error('会话尚未就绪，标签页只能在 app ready 之后创建')
      return ses
    },
    getPreloadPath: () => preloadPath,
    getConfig: () => config.get(),
    onStateChange: () => {
      broadcast(BROADCAST.tabsState, { tabs: tabs.list(), activeTabId: tabs.getActiveId() })
    },
    onNavigated: (entry) => history.record(entry)
  })
  tabsRef = tabs

  const popover = new PopoverWindowService(
    registry,
    preloadPath,
    (): Rect | null => controller.getWindow()?.getBounds() ?? null
  )

  /**
   * 打开系统设置。
   *
   * 它是窗口内的一页（与起始页同一种标签页），不是一扇独立窗口——
   * 独立窗口会出现在任务栏与 Alt+Tab 里，等于把「我在摸鱼」写在脸上。
   * 窗口若正缩成球或藏在托盘里，先叫回来：用户要的是看到设置。
   */
  function showSettings(): void {
    tabs.openSettings()
    controller.showForeground()
  }

  function quit(): void {
    app.quit()
  }

  const tray = new TrayService({
    // 单击图标是在「现形」与「收回托盘」之间切换，判据由窗口控制器持有
    onClickIcon: () => controller.toggleFromTray(),
    // 双击的第二次点击不切换，只补一次「提到最前」
    onRepeatedClick: () => controller.raiseFromTray(),
    // 菜单里的「现形」意图明确，只把它提到最前，不切换
    onReveal: () => controller.showForeground(),
    onOpenSettings: () => showSettings(),
    onQuit: () => quit()
  })

  const ctx: AppContext = {
    userDataDir,
    config,
    registry,
    sites,
    history,
    bookmarks,
    ballIcon,
    controller,
    tabs,
    bossKeys,
    tray,
    broadcast,
    openSettings: () => showSettings(),
    openPopover: (req: OpenPopoverRequest) => popover.open(req),
    closePopover: () => popover.close(),
    quit
  }

  function registerBossKeys(): void {
    const cfg = config.get()

    const minResult = bossKeys.register('bossMinimize', cfg.hotkeys.bossMinimize, () => {
      const win = controller.getWindow()
      if (!win) return
      if (controller.getMode() === 'minimized' || win.isMinimized()) controller.show()
      else controller.minimize()
    })
    if (!minResult.ok) log.warn(`老板键 1（${cfg.hotkeys.bossMinimize}）注册失败，用户需在设置中更换`)

    const hideResult = bossKeys.register('bossHideToTray', cfg.hotkeys.bossHideToTray, () => {
      void controller.hideToTray()
    })
    if (!hideResult.ok) log.warn(`老板键 2（${cfg.hotkeys.bossHideToTray}）注册失败，用户需在设置中更换`)
  }

  app.whenReady().then(() => {
    // 持久化会话必须在这里创建：app ready 之前 session 模块不可用
    ses = setupSession()

    electronApp.setAppUserModelId('com.m4xlmum.moyu-reader')
    app.on('browser-window-created', (_e, win) => optimizer.watchWindowShortcuts(win))

    registerDataIpc(ctx)
    registerBrowserIpc(ctx)
    registerWindowIpc(ctx)

    controller.create()
    tray.create(trayIconPath)
    registerBossKeys()

    // 首页常驻：它是「回到起点」的落点，也是启动后的第一屏
    tabs.openHome()

    // 恢复上次的访客标签页
    const restored = config.get().lastSession.openUrls
    if (restored.length > 0) {
      for (const url of restored) tabs.create({ url, activate: false })
      const list = tabs.list()
      const index = Math.min(config.get().lastSession.activeIndex, list.length - 1)
      if (list[index]) tabs.activate(list[index].id)
    }

    controller.show()

    // explorer.exe 重启会带走托盘图标，而 Electron 没有任务栏重建事件。
    // 在每次显示窗口时重建一次，成本很低；托盘没了用户可能再也找不回窗口。
    //
    // 重建挪到下一个事件循环：这条路径经常是从托盘自己的 click 处理器里走过来的
    // （点图标 → 现形 → show 事件），在托盘事件的分发过程中把 Tray 对象销毁掉
    // 会动到当时还在执行的那段原生回调。
    controller.getWindow()?.on('show', () => {
      setImmediate(() => tray.rebuild(trayIconPath))
    })
  })

  app.on('second-instance', () => {
    controller.show()
  })

  // 托盘应用：窗口全关也不退出，退出只走托盘菜单。
  // 这里必须什么都不做——若在此处再调 app.quit()，而 app.quit() 本身就会
  // 关闭窗口并触发本事件，就会递归调用自己，把退出的状态机搅住，
  // 表现为所有退出钩子都跑完了、进程却一直不退。
  app.on('window-all-closed', () => {
    // 有意留空
  })

  app.on('before-quit', () => {
    // 关窗之后仍要把这次的会话记下来，供下次启动恢复
    config.set((cfg) => ({
      ...cfg,
      lastSession: { openUrls: tabs.getOpenUrls(), activeIndex: 0 }
    }))
    config.flush()
    sites.flush()
    history.flush()
    bookmarks.flush()
  })

  app.on('will-quit', () => {
    // 顺序有讲究：先停掉还在轮询的定时器，再拆窗口。
    // 反过来的话，定时器会在窗口销毁后继续 tick，撞上已销毁的对象，
    // 异常会冒到主进程的未捕获异常处理器上，弹框把退出流程卡住。
    controller.destroy()
    // 不注销的话，退出后这些组合键仍被本进程占用，别的程序用不了
    bossKeys.unregisterAll()
    tabs.destroyAll()
    tray.destroy()

    // 收尾全部由我们自己完成，因此由我们负责终止进程，不再依赖
    // Electron 的默认退出：实测在这台机器上 will-quit 之后主进程的事件
    // 循环会被卡住四十多秒，进程迟迟不退，用户看到的是「点了退出但没反应」。
    app.exit(0)
  })
}
