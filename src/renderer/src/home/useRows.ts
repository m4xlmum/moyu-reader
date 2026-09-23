/**
 * 起始页的行模型：两套世界共用的一份数据与一套交互。
 *
 * 三个主题现在共用同一套划分（页眉 / 输入行 / 内容行 / 状态行），差别只在皮上。
 * 骨架既然是同一个，行怎么建、怎么筛、选中哪一行、回车做什么就不该各写一遍——
 * 两份实现迟早会在某一次改动里分家，而分家之后的症状是「某一套主题里回车
 * 打开的不是选中的那一行」这类只在一边复现的怪事。
 *
 * 因此：这个文件负责**行为**，两个世界组件只负责**画**。
 * 唯一留给世界自己的是按实测高度算出「这一屏放得下几行」——行高是皮的一部分。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, ref, watch, type ComputedRef } from 'vue'
import type { HistoryEntry } from '@shared/types'
import { hostOf } from '@shared/url'
import type { HomeTile } from './types'

export interface HomeRow {
  key: string
  /**
   * 这一行是「继续上次」还是「打开某个站点」。
   *
   * 终端世界把它印在行首（`resume` / `open`），现代世界只给继续那行一个「继续」，
   * 站点行留白——但两者是同一件事，因此动词存在数据里，而不是各印各的。
   */
  verb: 'resume' | 'open'
  label: string
  host: string
  url: string
  /** 站点图标，来自历史或书签。终端世界不画它 */
  icon?: string
  /** 过滤用的一整串，省得每次比较都现拼 */
  haystack: string
}

/** 站点与「继续上次」排成一份行。继续上次永远在第一行——它是这个页面上最常发生的事 */
export function rowsOf(tiles: HomeTile[], lastRead: HistoryEntry | null): HomeRow[] {
  const rows: HomeRow[] = []
  if (lastRead) {
    const label = lastRead.title || lastRead.url
    // 站点那一列显示的是可注册域名（qq.com，不是 weread.qq.com），
    // 继续上次这一行也照同一把尺子裁，两行的域名才对得齐
    const host = (hostOf(lastRead.url) ?? '').replace(/^www\./, '')
    rows.push({
      key: 'resume',
      verb: 'resume',
      label,
      host,
      url: lastRead.url,
      // 历史里存过图标就带上：这一行说的是「回上次那个站」，那就该是那个站的图标
      icon: lastRead.faviconUrl,
      haystack: `${label} ${lastRead.url}`.toLowerCase()
    })
  }
  for (const tile of tiles) {
    rows.push({
      key: tile.key,
      verb: 'open',
      label: tile.name,
      host: tile.domain,
      url: tile.url,
      icon: tile.icon,
      haystack: `${tile.name} ${tile.domain} ${tile.url}`.toLowerCase()
    })
  }
  return rows
}

/**
 * 输入框里的文字既当命令也当过滤器。
 *
 * `open x` 只拿 x 去过滤——用户已经说清楚要的是站点，再拿 "open" 这两个字母
 * 去比就什么都比不中了。
 */
export function needleOf(query: string): string {
  const q = query.trim().toLowerCase()
  const open = /^(?:open|o)\s+(.*)$/i.exec(q)
  if (open) return open[1].trim()
  if (/^(?:resume|r)$/i.test(q)) return ''
  return q
}

export function filterRows(rows: HomeRow[], query: string): HomeRow[] {
  const needle = needleOf(query)
  if (!needle) return rows
  return rows.filter((row) => row.haystack.includes(needle))
}

/** 回车要做的事 */
export type RowIntent =
  | { kind: 'resume' }
  | { kind: 'open'; url: string }
  | { kind: 'text'; text: string }

function intentForRow(row: HomeRow): RowIntent {
  return row.verb === 'resume' ? { kind: 'resume' } : { kind: 'open', url: row.url }
}

/**
 * 回车。顺序是「先认命令，再认站点，最后才当网址或关键词」：
 * 敲 `bili` 的人要的多半是 B 站而不是「搜索 bili」；而想搜「如何做红烧肉」
 * 这种匹配不上任何站点的话，才落到搜索上——那一层交给外面，因为它要用配置里的
 * 搜索引擎模板。
 *
 * 挑中的行取自**过滤后的全部行**，而不是当前这一屏显示出来的那几行：
 * 在迷你档里搜一个排在第 8 位的站点，它没被显示出来，但用户的意思很明确。
 */
export function intentOf(query: string, rows: HomeRow[], selected: number): RowIntent | null {
  const q = query.trim()
  if (!q) {
    const row = rows[selected] ?? rows[0]
    return row ? intentForRow(row) : null
  }
  if (/^(?:resume|r)$/i.test(q)) return { kind: 'resume' }

  const open = /^(?:open|o)\s+(.*)$/i.exec(q)
  if (open) {
    const rest = open[1].trim()
    if (rest) return { kind: 'text', text: rest }
    return rows[0] ? intentForRow(rows[0]) : null
  }

  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+/.test(q)
  const hit = rows[selected] ?? rows[0]
  if (hit && !looksLikeUrl) return intentForRow(hit)
  return { kind: 'text', text: q }
}

export interface RowListHandlers {
  open: (url: string) => void
  resume: () => void
  submit: (text: string) => void
  clearQuery: () => void
}

/**
 * 行列表的交互：一屏显示几行、选中哪一行、上下键与回车。
 *
 * `limit` 由调用方按各自的行高与实测高度算出来——只有世界自己知道它的行有多高。
 */
export function useRowList(
  rows: ComputedRef<HomeRow[]>,
  limit: ComputedRef<number>,
  handlers: RowListHandlers
) {
  const visible = computed(() => rows.value.slice(0, Math.max(1, limit.value)))
  const sel = ref(0)

  // 过滤之后行会变少，光标可能停在已经不存在的那一行上
  watch([rows, visible], () => {
    if (sel.value > visible.value.length - 1) {
      sel.value = Math.max(0, visible.value.length - 1)
    }
  })

  function move(delta: number): void {
    const last = Math.max(0, visible.value.length - 1)
    sel.value = Math.max(0, Math.min(sel.value + delta, last))
  }

  function pick(row: HomeRow): void {
    if (row.verb === 'resume') handlers.resume()
    else handlers.open(row.url)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Escape') {
      handlers.clearQuery()
      sel.value = 0
    }
  }

  /** 提示行里按下回车：执行完就把它清空——免得同一条命令被按两次 */
  function onSubmit(query: string): void {
    const intent = intentOf(query, rows.value, sel.value)
    if (query.trim()) handlers.clearQuery()
    if (!intent) return
    if (intent.kind === 'resume') handlers.resume()
    else if (intent.kind === 'open') handlers.open(intent.url)
    else handlers.submit(intent.text)
  }

  return { visible, sel, pick, move, onKeydown, onSubmit }
}
