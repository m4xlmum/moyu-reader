/**
 * 内置的热门站点列表。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { registrableDomain } from './url'
import type { SiteSection } from './constants'
import type { PresetSite } from './types'

/**
 * 只收录无需登录即可浏览首页的站点，避免用户一进来就撞上登录墙。
 * 需要登录才能阅读的站点（微信读书、粉笔等）留给用户自行添加。
 *
 * `section` 是这一栏归属的**唯一一份**声明：起始页按栏目排条目，
 * 而「这个域名属于哪一栏」就由这张表反查（见 sectionOfUrl）。
 */
export const PRESET_SITES: PresetSite[] = [
  { id: 'weread', title: '微信读书', url: 'https://weread.qq.com/', section: 'reading' },
  { id: 'jjwxc', title: '晋江文学城', url: 'https://www.jjwxc.net/', section: 'reading' },
  { id: 'qidian', title: '起点中文网', url: 'https://www.qidian.com/', section: 'reading' },
  { id: 'fanqie', title: '番茄小说', url: 'https://fanqienovel.com/', section: 'reading' },
  { id: 'jdread', title: '京东读书', url: 'https://e.jd.com/ebook.html', section: 'reading' },
  { id: 'qqread', title: 'QQ 阅读', url: 'https://book.qq.com/', section: 'reading' },
  { id: 'zhihu', title: '知乎', url: 'https://www.zhihu.com/', section: 'news' },
  { id: 'douban', title: '豆瓣', url: 'https://www.douban.com/', section: 'news' },
  { id: 'xiaohongshu', title: '小红书', url: 'https://www.xiaohongshu.com/', section: 'news' },
  { id: 'bilibili', title: '哔哩哔哩', url: 'https://www.bilibili.com/', section: 'video' },
  { id: 'douyin', title: '抖音', url: 'https://www.douyin.com/', section: 'video' },
  { id: 'iqiyi', title: '爱奇艺', url: 'https://www.iqiyi.com/', section: 'video' },
  { id: 'youku', title: '优酷', url: 'https://www.youku.com/', section: 'video' },
  { id: 'kuaishou', title: '快手', url: 'https://www.kuaishou.com/', section: 'video' },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', section: 'video' },
  { id: 'fenbi', title: '粉笔', url: 'https://www.fenbi.com/', section: 'quiz' },
  { id: 'nowcoder', title: '牛客网', url: 'https://www.nowcoder.com/', section: 'quiz' },
  { id: 'leetcode-cn', title: '力扣', url: 'https://leetcode.cn/', section: 'quiz' }
]

/**
 * 由域名反查这一页属于哪一栏。
 *
 * 用户自己加的站点与历史记录都**不需要改数据结构**：有域名就自动归栏，
 * 认不出来就返回 null，只出现在「全部」里。刻意不按关键词猜——猜错的代价
 * 是用户在自己的「阅读」栏里看见一个视频站，而他没有任何办法纠正；
 * 宁可让它留在「全部」。
 *
 * 按注册域比对（同一家的 www / m / book 子域算同一栏），与起始页去重
 * 用的是同一套判据（见 url.ts 的 registrableDomain）。
 *
 * 反查走的是这张表的**顺序**：表里先出现的赢。腾讯视频（v.qq.com）因此
 * 没有收进表里——它与 QQ 阅读（book.qq.com）同属 qq.com，收进来就会被
 * 这条规则静默吃掉，读起来像是漏了，不如不收。
 */
export function sectionOfUrl(url: string): SiteSection | null {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  const domain = registrableDomain(host)
  if (!domain) return null
  for (const site of PRESET_SITES) {
    let siteHost: string
    try {
      siteHost = new URL(site.url).hostname
    } catch {
      continue
    }
    if (registrableDomain(siteHost) === domain) return site.section
  }
  return null
}
