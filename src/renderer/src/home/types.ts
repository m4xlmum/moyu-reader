/**
 * 起始页两套世界共用的数据形状。
 *
 * 两套世界的渲染完全不同（卡片 / 命令行），但它们要回答的是同一个问题：
 * 「这个站点叫什么、去哪、图标在哪」。因此站点条目只在这里定义一次。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/** 一个可打开的站点条目 */
export interface HomeTile {
  key: string
  name: string
  url: string
  domain: string
  icon?: string
}
