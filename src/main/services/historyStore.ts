/**
 * 浏览历史。按 URL 去重，同一地址重复访问只累加次数并前移。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { HISTORY_LIMIT } from '@shared/constants'
import type { HistoryEntry } from '@shared/types'
import { fileNameOf } from '@shared/url'
import { JsonListStore, makeId } from './jsonListStore'

/**
 * 一条记录该显示什么标题。
 *
 * 本机文件（`file:`）一律取**文件名**，不取候选标题。这一条比它看起来重要：
 * `did-navigate` 早于 `page-title-updated`，一本 TXT 落库时标题常常还是空的，
 * 于是「标题」那一栏里装进去的是整条 `file:///C:/Users/…`；而历史面板直接印它，
 * 等于把用户名和目录习惯摊在屏幕上——这个程序的全部意义是别人看不出你在干什么。
 *
 * 取名字这件事只在这里做一次：落库时与读盘时走的是同一个函数，旧记录里
 * 已经存成路径的那些（`candidate` 是一条路径）在下次读盘或下次访问时被就地改回来。
 */
function titleOf(url: string, candidate: string): string {
  const file = fileNameOf(url)
  if (file) return file
  return candidate || url
}

function normalizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const out: HistoryEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Partial<HistoryEntry>
    if (typeof r.url !== 'string' || !r.url) continue
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : makeId('hist'),
      url: r.url,
      title: titleOf(r.url, typeof r.title === 'string' ? r.title : ''),
      faviconUrl: typeof r.faviconUrl === 'string' ? r.faviconUrl : undefined,
      visitedAt: typeof r.visitedAt === 'number' ? r.visitedAt : 0,
      visitCount: typeof r.visitCount === 'number' ? r.visitCount : 1
    })
  }
  return out.sort((a, b) => b.visitedAt - a.visitedAt).slice(0, HISTORY_LIMIT)
}

export class HistoryStore extends JsonListStore<HistoryEntry> {
  constructor(userDataDir: string) {
    super(userDataDir, 'history.json', normalizeHistory)
  }

  /** 记录一次访问。同一 URL 不新增条目，只累加次数并前移 */
  record(entry: { url: string; title: string; faviconUrl?: string }): void {
    // about:blank 之类的内部地址没有记录价值
    if (!entry.url || entry.url === 'about:blank') return

    const existing = this.items.find((h) => h.url === entry.url)
    const now = Date.now()

    if (existing) {
      const updated: HistoryEntry = {
        ...existing,
        title: titleOf(entry.url, entry.title || existing.title),
        faviconUrl: entry.faviconUrl ?? existing.faviconUrl,
        visitedAt: now,
        visitCount: existing.visitCount + 1
      }
      this.commit([updated, ...this.items.filter((h) => h.id !== existing.id)])
      return
    }

    const fresh: HistoryEntry = {
      id: makeId('hist'),
      url: entry.url,
      title: titleOf(entry.url, entry.title),
      faviconUrl: entry.faviconUrl,
      visitedAt: now,
      visitCount: 1
    }
    this.commit([fresh, ...this.items].slice(0, HISTORY_LIMIT))
  }

  query(input: { query?: string; limit?: number; offset?: number } = {}): HistoryEntry[] {
    const q = input.query?.trim().toLowerCase()
    const filtered = q
      ? this.items.filter(
          (h) => h.url.toLowerCase().includes(q) || h.title.toLowerCase().includes(q)
        )
      : this.items
    const offset = input.offset ?? 0
    const limit = input.limit ?? 200
    return filtered.slice(offset, offset + limit)
  }

  clear(): void {
    this.commit([])
  }
}
