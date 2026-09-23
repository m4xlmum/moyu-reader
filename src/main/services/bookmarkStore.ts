/**
 * 书签。仅本地生效，不做云同步。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { Bookmark } from '@shared/types'
import { JsonListStore, makeId } from './jsonListStore'

function normalizeBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return []
  const out: Bookmark[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Partial<Bookmark>
    if (typeof r.url !== 'string' || !r.url) continue
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : makeId('bm'),
      title: typeof r.title === 'string' && r.title ? r.title : r.url,
      url: r.url,
      faviconUrl: typeof r.faviconUrl === 'string' ? r.faviconUrl : undefined,
      order: typeof r.order === 'number' ? r.order : out.length,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now()
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

export class BookmarkStore extends JsonListStore<Bookmark> {
  constructor(userDataDir: string) {
    super(userDataDir, 'bookmarks.json', normalizeBookmarks)
  }

  update(id: string, patch: Partial<Bookmark>): Bookmark[] {
    return this.commit(
      this.items.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b))
    )
  }

  remove(id: string): Bookmark[] {
    return this.commit(this.items.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i })))
  }

  query(input: { query?: string } = {}): Bookmark[] {
    const q = input.query?.trim().toLowerCase()
    if (!q) return this.items
    return this.items.filter(
      (b) => b.url.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
    )
  }
}
