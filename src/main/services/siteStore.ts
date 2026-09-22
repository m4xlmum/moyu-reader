/**
 * 「我的站点」：用户自行维护的站点列表。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import type { SiteRecord } from '@shared/types'
import { JsonListStore, makeId } from './jsonListStore'

function normalizeSites(raw: unknown): SiteRecord[] {
  if (!Array.isArray(raw)) return []
  const out: SiteRecord[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Partial<SiteRecord>
    if (typeof r.url !== 'string' || !r.url) continue
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : makeId('site'),
      title: typeof r.title === 'string' && r.title ? r.title : r.url,
      url: r.url,
      iconUrl: typeof r.iconUrl === 'string' ? r.iconUrl : undefined,
      order: typeof r.order === 'number' ? r.order : out.length,
      pinned: Boolean(r.pinned),
      uaMode: r.uaMode === 'mobile' || r.uaMode === 'desktop' ? r.uaMode : null,
      zoom: typeof r.zoom === 'number' ? r.zoom : null,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now()
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

export class SiteStore extends JsonListStore<SiteRecord> {
  constructor(userDataDir: string) {
    super(userDataDir, 'sites.json', normalizeSites)
  }

  add(input: { title?: string; url: string }): SiteRecord[] {
    const now = Date.now()
    const record: SiteRecord = {
      id: makeId('site'),
      title: input.title?.trim() || input.url,
      url: input.url,
      order: this.items.length,
      pinned: false,
      uaMode: null,
      zoom: null,
      createdAt: now,
      updatedAt: now
    }
    return this.commit([...this.items, record])
  }

  update(id: string, patch: Partial<SiteRecord>): SiteRecord[] {
    return this.commit(
      this.items.map((s) => (s.id === id ? { ...s, ...patch, id: s.id, updatedAt: Date.now() } : s))
    )
  }

  remove(id: string): SiteRecord[] {
    return this.commit(this.items.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })))
  }

  reorder(ids: string[]): SiteRecord[] {
    const byId = new Map(this.items.map((s) => [s.id, s]))
    const next: SiteRecord[] = []
    ids.forEach((id, index) => {
      const s = byId.get(id)
      if (s) {
        next.push({ ...s, order: index })
        byId.delete(id)
      }
    })
    // 未出现在 ids 中的项按原顺序追加，避免因为一次排序丢数据
    for (const s of this.items) {
      if (byId.has(s.id)) next.push({ ...s, order: next.length })
    }
    return this.commit(next)
  }
}
