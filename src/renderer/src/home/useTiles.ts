/**
 * 起始页的站点编排：从「我的站点 / 历史 / 预置」拼出这一页能打开的站点，
 * 再按栏目摊成行。
 *
 * 为什么单独放一个文件而不是留在 HomeApp.vue 里：这段是**纯数据**，却又是这一页
 * 最要紧的一条规矩（一栏里该有谁、认不出的域名落在哪儿、读数数的是什么）。
 * 而 HomeApp 是单文件组件，探针 require 不了它——留在那边就只能由探针另抄一份，
 * 抄本会跟着源本一起漂，验出来的结论不算数（这正是 spike/ 那一堆注释反复讲的
 * 「验真的，不验抄本」）。搬到这里之后，spike/home-sections.js 打包的就是真跑在
 * 界面里的那一份。
 *
 * 这里不引 vue：全是纯函数，进出都是普通数据，因此探针不必把整个框架拉起来。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { PRESET_SITES, sectionOfUrl } from '@shared/presets'
import type { SectionId } from '@shared/constants'
import type { Bookmark, HistoryEntry, SiteRecord } from '@shared/types'
import { hostOf, registrableDomain } from '@shared/url'
import { localRowsOf, rowsOf, type HomeRow } from './useRows'
import type { HomeTile } from './types'

/**
 * 域名到可注册域名（`weread.qq.com` → `qq.com`）。
 *
 * 认不出就是 null：不是网址、没有主机名、或者本机文件那种没有域名的地址。
 * 归栏与去重都靠它，因此「认不出」必须是一条干净的路，不能拿整条 URL 顶上。
 */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  const host = hostOf(url)
  return host ? registrableDomain(host) : null
}

/** 域名 → 图标地址。历史与书签里存过图标的直接复用，这是浏览器的做法 */
export function iconByDomainOf(
  history: HistoryEntry[],
  bookmarks: Bookmark[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of [...history, ...bookmarks]) {
    const domain = domainOf(entry.url)
    const icon = 'faviconUrl' in entry ? entry.faviconUrl : undefined
    if (domain && icon && !map.has(domain)) map.set(domain, icon)
  }
  return map
}

/** 按访问次数排序的常访问站点，一个域名只留访问最多的那一条 */
export function mostVisitedOf(history: HistoryEntry[]): HistoryEntry[] {
  const byDomain = new Map<string, HistoryEntry>()
  for (const entry of history) {
    const domain = domainOf(entry.url)
    if (!domain) continue
    const existing = byDomain.get(domain)
    if (!existing || entry.visitCount > existing.visitCount) byDomain.set(domain, entry)
  }
  return [...byDomain.values()].sort((a, b) => b.visitCount - a.visitCount)
}

/**
 * 上限只是防着一份用了很久的历史把 DOM 撑起来：任何一档窗口都显示不了这么多行，
 * 因此这个截断不会被看见。
 */
export const MAX_TILES = 36

/**
 * 候选站点。顺序即优先级：自己固定的 → 常访问的 → 预置的热门站点。
 *
 * 同一个域名只出现一次（先去的有理）：起始页是一份入口清单，
 * 「知乎」出现两遍不提供任何信息。
 *
 * `sectionOfUrl` 认不出栏目的站点 `section` 是 null——它只出现在「全部」里。
 * 这里**不做关键词猜测**，理由见 @shared/presets 里那个函数。
 */
export function tilesOf(
  sites: SiteRecord[],
  history: HistoryEntry[],
  bookmarks: Bookmark[]
): HomeTile[] {
  const icons = iconByDomainOf(history, bookmarks)
  const seen = new Set<string>()
  const out: HomeTile[] = []

  const push = (name: string, url: string, key: string): void => {
    const domain = domainOf(url)
    if (!domain || seen.has(domain)) return
    seen.add(domain)
    out.push({
      key,
      name,
      url,
      domain,
      icon: icons.get(domain),
      section: sectionOfUrl(url)
    })
  }

  for (const site of sites) push(site.title, site.url, site.id)
  for (const entry of mostVisitedOf(history)) push(entry.title || entry.url, entry.url, entry.id)
  for (const preset of PRESET_SITES) push(preset.title, preset.url, preset.id)

  return out.slice(0, MAX_TILES)
}

/**
 * 一栏里该有哪些行。
 *
 * 「全部」把「继续上次」摆在第一行——它是这个页面上最常发生的事；
 * 单栏不摆它：在「视频」栏里顶着一本上周读的书，说的不是这一栏的事。
 * 「离线阅读」整栏另走一条路（见 useRows 的 localRowsOf）。
 */
export function plateRowsOf(
  tiles: HomeTile[],
  history: HistoryEntry[],
  lastRead: HistoryEntry | null,
  plate: SectionId
): HomeRow[] {
  if (plate === 'local') return localRowsOf(history)
  if (plate === 'all') return rowsOf(tiles, lastRead)
  // 单栏只放本栏的站点。认不出栏目（section 为 null）的只在「全部」里出现
  return rowsOf(
    tiles.filter((tile) => tile.section === plate),
    null
  )
}

/** 状态行左端的读数：这一栏里数的是什么、有多少 */
export interface PlateStat {
  kind: 'site' | 'local' | 'match'
  count: number
}

/**
 * 读数。
 *
 * 数的是这一栏里有多少东西——「站点 0」摆在离线阅读那一栏里是句错话，
 * 那边的数是本机文件。而「打开文件…」那一行不是一本书，因此本机那一栏要减掉它：
 * 读数是给别人判断「这一栏里有多少东西」用的，把一个动作算进去就是虚报。
 *
 * 搜索时数的是命中的行（`matchCount`），因为底下显示的就是那些。
 */
export function statOf(input: {
  tiles: HomeTile[]
  history: HistoryEntry[]
  plate: SectionId
  /** 正在搜索时传命中的行数，否则传 null */
  matchCount: number | null
}): PlateStat {
  const { tiles, history, plate, matchCount } = input
  if (matchCount !== null) return { kind: 'match', count: matchCount }
  if (plate === 'local') return { kind: 'local', count: localRowsOf(history).length - 1 }
  const count =
    plate === 'all' ? tiles.length : tiles.filter((tile) => tile.section === plate).length
  return { kind: 'site', count }
}
