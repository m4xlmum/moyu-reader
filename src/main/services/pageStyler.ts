/**
 * 注入到访客页面的样式。
 *
 * 注意：**窗口的**无极透明度不走这里——spike 证明 setOpacity 与透明窗口可以
 * 正常混合，因此不需要向网页注入 opacity。这里处理三件事：
 *
 *   1. 让网页本身透明（否则透明窗口里会残留一块不透明的网页底色）；
 *   2. 藏起滚动条；
 *   3. 离线阅读的透明度（applyReaderOpacity）——这一条**只给本机文件**
 *      用，网页永远不许吃到它。第 1、2 条不分对象，第 3 条分；而且第 3 条
 *      还要**撤得回来**，因此它不走 insertCSS（原因见 applyReaderOpacity），
 *      与上面两块不是一条路。
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

/**
 * 离线阅读的透明度。**调用方必须先判定这一页是本机文件**
 * （TabManager 用 @shared/url 的 isLocalFile）——网页永远不许吃到它。
 *
 * 这一页（本机 TXT / 网页文件）的底由 Chromium 自己画，我们碰不到它，能碰的
 * 只有最外面这一层，因此整页 `opacity` 就是「字淡下去、桌面从笔画里透过来」。
 * 同一条滑块在 **PDF 那一页**落的是另一处：那一页的纸是我们自己画进画布的，
 * 于是它把纸**补回来**（画布的底色，alpha 由同一条滑块给），字始终实心
 * （见 pdf/PdfApp.vue）。两处落点不一样的原因写在 @shared/constants 的
 * READER_OPACITY_MIN 里。
 *
 * ## 为什么不是 insertCSS（这一条摔过一跤）
 *
 * 原本走的是 `wc.insertCSS(…, { cssOrigin: 'user' })` + 换值时
 * `removeInsertedCSS(旧 key)`。**撤不掉**：在 Electron 44.4.3 上实测，
 * `removeInsertedCSS` 对 user origin 注入的表**不报错、也不生效**——删掉之后
 * 页面自己算出来的 opacity 还是旧值（default origin 的同一对调用则一切正常。
 * 见 spike/css-remove.js：默认来源 0.4 → 1，user 来源 0.4 → 0.4）。
 * 于是「拉回 100%」这一半当着用户的面失效，而且不报错——只有量合成之后的像素
 * 加上读页面自己算出的 opacity，才分得开「没撤掉」与「撤了没重画」两种坏法
 * （live-app.js 的 A12 就是这么问出来的，见 spike-findings.md 的 Q49）。
 *
 * ## 现在走的是 CSSOM 上的行内声明
 *
 * `document.documentElement.style.setProperty('opacity', v, 'important')`，
 * 回到 1 时 `removeProperty('opacity')`。三条理由：
 *
 *   · **撤得掉**——自己写的属性自己删，不必求 removeInsertedCSS；
 *   · **拿到的最强**——行内的 !important 压过页面自己样式表里的任何 !important
 *     （换成一枚 <style> 的话，同是作者来源，就得跟页面的规则比分量和先后）；
 *   · **不碰 CSP**——CSP 只管从标记里解析出来的样式与 <style> 元素，
 *     不管 CSSOM 上直接写的属性，因此本机那些自带 CSP 的 HTML 也一样淡得下去。
 *
 * 文档一导航就重建，这一条随之消失，由 did-navigate → applyPageStyles 再写一次
 * ——与上面两块样式的重注入同一时机。传 1 表示「不淡」：此时只删、不写。
 */
export async function applyReaderOpacity(wc: WebContents, value: number): Promise<void> {
  // 这一段会进样式，因此不信任调用方：非数就当作 1，再夹到 0–1。
  // 定到四位小数是为了让它一定写成 `0.4` 这样的十进制——直接把数插进脚本的话，
  // 极小值会写成 `1e-7`，那不是 CSS 数值该有的写法。
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1

  const 脚本 = `(() => {
    const 行内 = document.documentElement.style
    if (${v >= 1}) 行内.removeProperty('opacity')
    else 行内.setProperty('opacity', '${v.toFixed(4)}', 'important')
  })()`

  try {
    await wc.executeJavaScript(脚本)
  } catch (err) {
    // 页面可能已在导航中被销毁，属于正常竞态
    log.warn('注入阅读透明度失败', err)
  }
}
