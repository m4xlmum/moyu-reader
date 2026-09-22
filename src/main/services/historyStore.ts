/**
 * 浏览历史。按 URL 去重，同一地址重复访问只累加次数并前移。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { HISTORY_LIMIT } from '@shared/constants'
import type { HistoryEntry } from '@shared/types'
import { JsonListStore, makeId } from './jsonListStore'

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
      title: typeof r.title === 'string' ? r.title : r.url,
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
        title: entry.title || existing.title,
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
      title: entry.title || entry.url,
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
