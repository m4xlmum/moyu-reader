/**
 * 光标有没有贴在窗口边框上的轮询器。
 *
 * 用来做什么：正文视图从窗口左沿（x = 0）一直铺到窗口底沿，于是**左边缘与下边缘
 * 那几像素归网页**。界面层（chrome 视图）画在标签页视图**之下**，收不到那里的
 * 按下事件——这两条边上的缩放手柄因此永远拖不动，拖动窗口同理（整块界面都能拖，
 * 而那两条边不在界面手里）。
 *
 * 解法是「提前把界面层架好」：光标靠近边框时把界面层抬到网页之上
 * （WindowController.syncChromeOrder），那两条边的手柄就收得到按下了；
 * 离开再让回去。
 *
 * 为什么只能靠「靠近」而不能靠「按下」：按下那一下的像素归网页，
 * 我们根本收不到它——等收到就已经晚了。于是只能先一步。
 * 判定带取 EDGE_HOT_BAND（8px），比手柄本身（4px）宽一倍：轮询最快也要
 * POLL_MS 才看一次，带子窄了就会出现「光标已经停在边上按下了，界面层还没抬起来」。
 *
 * 代价（README 里也写着）：界面层一旦压上去，**整扇窗**的点击都归它——
 * views 之间的命中测试在原生那一侧，CSS 的 pointer-events 管不着
 * （见 spike/vieworder.js 文件头）。因此光标停在边框那条带子上时，
 * 网页收不到点击。带子只有 8px，而那正是用户准备拖边框的位置。
 *
 * 与 WindowLeaveWatcher 同款（都是 POLL_MS 读一次全局光标），但**不共用**：
 * 那一个在关闭自动收起时会提前返回，而边框这条逻辑与自动收起毫无关系。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { screen } from 'electron'
import { EDGE_HOT_BAND, POLL_MS } from '@shared/constants'
import type { Rect } from '@shared/types'
import { nearWindowEdge } from './geometry'
import { log } from './logger'

export interface EdgeWatcherDeps {
  /**
   * 窗口此刻的屏幕矩形；不该盯边框时返回 null。
   *
   * 「不该盯」的几种情况（收起态是一颗球、最大化时四边贴着屏幕、最小化与托盘里
   * 根本没有指针）由调用方在那里滤掉，这里只管几何：拿到矩形就比，拿不到就当
   * 「不在边上」。
   */
  getBounds: () => Rect | null
  /** 贴上了 / 离开了。只在真的翻转时叫一次，不是每轮一次 */
  onHotChange: (hot: boolean) => void
}

export class EdgeWatcher {
  private timer: NodeJS.Timeout | null = null
  private hot = false

  constructor(private readonly deps: EdgeWatcherDeps) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), POLL_MS)
  }

  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    // 与 WindowLeaveWatcher 同一个理由：退出过程中窗口可能先于定时器被销毁，
    // 定时器回调里抛出去会冒到主进程的未捕获异常处理器上，弹框卡住退出流程。
    try {
      this.tickOnce()
    } catch (err) {
      log.warn('边框轮询中窗口已不可用，停止轮询', err)
      this.stop()
    }
  }

  private tickOnce(): void {
    const bounds = this.deps.getBounds()
    if (!bounds) {
      this.setHot(false)
      return
    }
    // 光标本来就是屏幕坐标，窗口矩形也是——nearWindowEdge 只要求两者同系
    const cursor = screen.getCursorScreenPoint()
    this.setHot(nearWindowEdge(cursor.x, cursor.y, bounds, EDGE_HOT_BAND))
  }

  private setHot(hot: boolean): void {
    if (hot === this.hot) return
    this.hot = hot
    this.deps.onHotChange(hot)
  }
}
