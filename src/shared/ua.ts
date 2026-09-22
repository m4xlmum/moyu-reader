/**
 * 浏览器 User-Agent 预设，用于「手机模式 / 电脑模式」切换。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/** 与 Electron 内置 Chromium 一致的桌面 UA（留空即用默认值） */
export const DESKTOP_UA = ''

export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

export const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

export type UaMode = 'desktop' | 'mobile'

export function uaFor(mode: UaMode): string {
  return mode === 'mobile' ? MOBILE_UA : DESKTOP_UA
}
