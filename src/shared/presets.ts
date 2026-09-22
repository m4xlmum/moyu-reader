/**
 * 内置的热门站点列表。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { PresetSite } from './types'

/**
 * 只收录无需登录即可浏览首页的站点，避免用户一进来就撞上登录墙。
 * 需要登录才能阅读的站点（微信读书、粉笔等）留给用户自行添加。
 */
export const PRESET_SITES: PresetSite[] = [
  { id: 'weread', title: '微信读书', url: 'https://weread.qq.com/', category: '阅读' },
  { id: 'jjwxc', title: '晋江文学城', url: 'https://www.jjwxc.net/', category: '阅读' },
  { id: 'qidian', title: '起点中文网', url: 'https://www.qidian.com/', category: '阅读' },
  { id: 'fanqie', title: '番茄小说', url: 'https://fanqienovel.com/', category: '阅读' },
  { id: 'jdread', title: '京东读书', url: 'https://e.jd.com/ebook.html', category: '阅读' },
  { id: 'qqread', title: 'QQ 阅读', url: 'https://book.qq.com/', category: '阅读' },
  { id: 'zhihu', title: '知乎', url: 'https://www.zhihu.com/', category: '资讯' },
  { id: 'douban', title: '豆瓣', url: 'https://www.douban.com/', category: '资讯' },
  { id: 'bilibili', title: '哔哩哔哩', url: 'https://www.bilibili.com/', category: '影音' },
  { id: 'xiaohongshu', title: '小红书', url: 'https://www.xiaohongshu.com/', category: '资讯' },
  { id: 'douyin', title: '抖音', url: 'https://www.douyin.com/', category: '影音' },
  { id: 'fenbi', title: '粉笔', url: 'https://www.fenbi.com/', category: '刷题' },
  { id: 'nowcoder', title: '牛客网', url: 'https://www.nowcoder.com/', category: '刷题' },
  { id: 'leetcode-cn', title: '力扣', url: 'https://leetcode.cn/', category: '刷题' }
]
