/**
 * 起始页的主题：把配置里的 ui.homeTheme 写成**起始页**文档根上的
 * data-theme 与 data-world。
 *
 * **只有起始页这一份文档调它。** 界面（顶栏、地址栏、右栏、悬浮球）、弹出面板、
 * 系统设置页与 PDF 阅读页那四份文档虽然加载着同一份 styles/themes.css，却从不
 * 写这个属性——于是它们永远落在 `:root` 那一组（纸白）上，配色与形态不随主题变。
 * 这是设计，不是漏了：主题管的是起始页那一屏；顶栏与右栏是**工具**，工具的样子
 * 不该因为一页换了皮就跟着变。更要紧的是 PDF 那一页——它画的是**内容**，墨色
 * 跟着主题走的话，磷绿下整本书的字都会变成荧光绿（1.5.0 的实装就是这样，
 * 1.5.1 修掉了）。
 *
 * 为什么不绑 class：属性选择器在样式表里更直白，也不会与作用域样式打架——
 * 作用域样式会给选择器末尾补一个 data-v 属性，属性选择器不参与那套改写。
 * （这条是起始页那边踩出来的，见 docs/spike-findings.md 的 Q10。）
 *
 * 网页永远不受影响：访客页面是另一个 `WebContentsView`，拿不到这份样式表，
 * 也拿不到这个属性。
 *
 * 文件名仍是 useTheme：构建产物里那份样式表的 chunk 就叫 `useTheme-<哈希>.css`
 * ——名字来自把它拉进依赖图的那个模块（见 Q32），改名会让那一条例子失效。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { worldOfTheme, type HomeTheme } from '@shared/constants'

/** 主题与形态都写在文档根上，样式表按属性挑变量组（见 styles/themes.css） */
export function applyThemeToDocument(theme: HomeTheme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.world = worldOfTheme(theme)
}
