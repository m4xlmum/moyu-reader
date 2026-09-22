/**
 * 列表型 JSON 存储的共用基类：加载、变更、去抖持久化。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import path from 'node:path'
import { PERSIST_DEBOUNCE_MS } from '@shared/constants'
import { DebouncedWriter, readJson } from './jsonFile'

export abstract class JsonListStore<T> {
  protected items: T[]
  private readonly writer: DebouncedWriter<T[]>
  private readonly listeners = new Set<(items: T[]) => void>()

  constructor(userDataDir: string, fileName: string, normalize: (raw: unknown) => T[]) {
    const file = path.join(userDataDir, fileName)
    this.items = normalize(readJson<unknown>(file, []))
    this.writer = new DebouncedWriter<T[]>(file, PERSIST_DEBOUNCE_MS)
  }

  list(): T[] {
    return this.items
  }

  protected commit(next: T[]): T[] {
    this.items = next
    this.writer.schedule(next)
    for (const listener of this.listeners) {
      try {
        listener(next)
      } catch {
        // 监听器异常不应影响数据写入
      }
    }
    return next
  }

  subscribe(listener: (items: T[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  flush(): void {
    this.writer.flush()
  }
}

/** 生成一个可读且足够唯一的 id */
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
