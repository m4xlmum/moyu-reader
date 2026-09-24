/**
 * 主题：把配置里的 ui.homeTheme 写成文档根上的 data-theme 与 data-world。
 *
 * 与 useBackgroundAlpha 同一个路数——四份文档（起始页、界面、弹出面板、系统设置）
 * 各自加载同一份 styles/themes.css，再各自在 documentElement 上写同一个属性，
 * 于是任一处换主题，四处一起变。
 *
 * 为什么不绑 class：属性选择器在样式表里更直白，也不会与作用域样式打架——
 * 作用域样式会给选择器末尾补一个 data-v 属性，属性选择器不参与那套改写。
 * （这条是起始页那边踩出来的，见 docs/spike-findings.md 的 Q10。）
 *
 * 网页永远不受影响：访客页面是另一个 WebContentsView，拿不到这份样式表，
 * 也拿不到这个属性。主题只管「我们自己画的那几块」。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { watchEffect, type Ref } from 'vue'
import { DEFAULT_HOME_THEME, worldOfTheme, type HomeTheme } from '@shared/constants'
import type { AppConfig } from '@shared/types'

/** 主题与形态都写在文档根上，样式表按属性挑变量组（见 styles/themes.css） */
export function applyThemeToDocument(theme: HomeTheme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.world = worldOfTheme(theme)
}

/**
 * 订阅配置，把当前主题写到本文档的根上。
 *
 * 配置还没读回来（null）时落到默认主题，而不是留着上一次的值：
 * 那一瞬间文档根上什么都没有，靠 themes.css 里 `:root` 那一组当兜底。
 */
export function useTheme(config: Ref<AppConfig | null>): void {
  watchEffect(() => {
    applyThemeToDocument(config.value?.ui.homeTheme ?? DEFAULT_HOME_THEME)
  })
}
