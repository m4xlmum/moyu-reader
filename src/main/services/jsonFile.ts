/**
 * JSON 文件读写：原子替换 + 损坏隔离。
 *
 * 不引入 electron-store 之类的依赖：其新版为纯 ESM，
 * 与本项目 CJS 的主进程产物冲突，而这里需要的逻辑并不多。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * 读取 JSON。文件不存在返回 fallback；
 * 文件损坏则改名隔离后返回 fallback，绝不因为一个坏文件而让应用起不来。
 */
export function readJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) throw new Error('空文件')
    return JSON.parse(raw) as T
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return fallback

    // 损坏文件隔离，便于事后排查，同时保证下次启动干净
    const quarantine = `${filePath}.corrupt-${Date.now()}`
    try {
      fs.renameSync(filePath, quarantine)
      console.error(`[jsonFile] ${filePath} 解析失败，已隔离为 ${quarantine}`)
    } catch {
      console.error(`[jsonFile] ${filePath} 解析失败且隔离失败：`, err)
    }
    return fallback
  }
}

/**
 * 原子写入：先写临时文件再 rename 覆盖。
 * 同一卷内 rename 是原子操作，因此不会出现「写了一半」的文件。
 */
export function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

/**
 * 带去抖的写入器。
 * 透明度滑块每次拖动都会产生几十次变更，逐次落盘会明显卡顿，
 * 因此合并写入，并保证进程退出前 flush。
 */
export class DebouncedWriter<T> {
  private timer: NodeJS.Timeout | null = null
  private pending: T | null = null

  constructor(
    private readonly filePath: string,
    private readonly delayMs: number
  ) {}

  schedule(value: T): void {
    this.pending = value
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.delayMs)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending === null) return
    const value = this.pending
    this.pending = null
    try {
      writeJsonAtomic(this.filePath, value)
    } catch (err) {
      console.error(`[jsonFile] 写入 ${this.filePath} 失败：`, err)
    }
  }
}
