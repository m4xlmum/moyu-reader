/**
 * 起始页两套世界共用的数据形状。
 *
 * 两套世界的皮完全不同（现代行式列表 / 命令行），但它们要回答的是同一个问题：
 * 「这个站点叫什么、去哪、图标在哪」。因此站点条目只在这里定义一次。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { SiteSection } from '@shared/constants'

/** 一个可打开的站点条目 */
export interface HomeTile {
  key: string
  name: string
  url: string
  domain: string
  icon?: string
  /**
   * 这个站点归在哪一栏（见 @shared/presets 的 sectionOfUrl）。
   *
   * null 是「认不出来」，不是「没有这一栏」：用户自己加的站点与他不常走的
   * 那些域名都可能落在这里。这样的条目只出现在「全部」里——宁可让它在
   * 「全部」中多占一行，也不要按关键词猜一个可能猜错的栏目。
   */
  section: SiteSection | null
}
