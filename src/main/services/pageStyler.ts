/**
 * 注入到访客网页的样式。
 *
 * 注意：无极透明度不走这里——spike 证明 setOpacity 与透明窗口可以正常混合，
 * 因此不需要向网页注入 opacity。这里只处理「让网页本身透明」与「藏起滚动条」。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { WebContents } from 'electron'
import { log } from './logger'

/** 让页面背景透明，否则透明窗口里会残留一块不透明的网页底色 */
const TRANSPARENT_BACKGROUND = `
html, body { background: transparent !important; }
`

/** 藏起滚动条。长滚动条是「正在摸鱼」最明显的视觉证据 */
const HIDE_SCROLLBARS = `
::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
html { scrollbar-width: none !important; -ms-overflow-style: none !important; }
`

/**
 * 按 webContents 登记已注入样式的 key。
 *
 * 页面每次导航都会重建文档，之前注入的样式随文档一起消失，
 * 因此必须在每次 dom-ready 后重新注入——只注入一次是最常见的错误。
 */
const injectedKeys = new WeakMap<WebContents, string[]>()

function buildCss(opts: { hideScrollbars: boolean }): string {
  return TRANSPARENT_BACKGROUND + (opts.hideScrollbars ? HIDE_SCROLLBARS : '')
}

/** 在页面文档就绪后调用 */
export async function injectPageStyles(
  wc: WebContents,
  opts: { hideScrollbars: boolean }
): Promise<void> {
  try {
    await removePageStyles(wc)
    const key = await wc.insertCSS(buildCss(opts), { cssOrigin: 'user' })
    injectedKeys.set(wc, [key])
  } catch (err) {
    // 页面可能已在导航中被销毁，属于正常竞态
    log.warn('注入页面样式失败', err)
  }
}

/** 移除已注入的样式，避免切换「隐藏滚动条」后残留旧规则 */
export async function removePageStyles(wc: WebContents): Promise<void> {
  const keys = injectedKeys.get(wc)
  if (!keys) return
  for (const key of keys) {
    try {
      await wc.removeInsertedCSS(key)
    } catch {
      // 文档已销毁，无需处理
    }
  }
  injectedKeys.delete(wc)
}
