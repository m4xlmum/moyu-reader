/**
 * 悬浮球的自定义图标：一张用户上传并裁剪过的图。
 *
 * 它不放在 config.json 里。配置是「一变就全量广播」的东西——透明度滑块每动一格
 * 都会让整份配置走过一次 IPC，而这张图编成 WebP 也有几 KB 到几十 KB。
 * 把它塞进配置，等于每次调透明度都顺带推一遍图片。于是单独一个文件、
 * 单独一组通道（`ballIcon:get` / `ballIcon:set` / `ballIcon:changed`）。
 *
 * 存的是 data URI 而不是图片文件：它在界面里只以 `background-image` / `<img>`
 * 的形式出现，一个字符串就够了，不必再管文件路径、清理时机与「文件被用户删了」这件事。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import path from 'node:path'
import { BALL_IMAGE_MAX_BYTES } from '@shared/constants'
import { readJson, writeJsonAtomic } from './jsonFile'
import { log } from './logger'

interface BallIconFile {
  dataUrl: string | null
  updatedAt: number
}

/**
 * 只收这几种内联图。
 *
 * 裁剪弹窗导出的是 WebP；png / jpeg 留着手工放进来的值。
 * 白名单而不是黑名单：这个字符串会被渲染进程直接当作图片来源，
 * 而它是从磁盘上读回来的——磁盘上的东西不归我们管，收窄入口比事后过滤便宜。
 */
const DATA_URL_RE = /^data:image\/(?:webp|png|jpeg|jpg);base64,[A-Za-z0-9+/]+={0,2}$/

/** 越界的值一律当作「没有图」，而不是抛错：图标画不出来不该让应用起不来 */
function sanitize(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length > BALL_IMAGE_MAX_BYTES) {
    log.warn(`自定义悬浮球图标超过上限（${value.length} 字符），已丢弃`)
    return null
  }
  return DATA_URL_RE.test(value) ? value : null
}

export class BallIconStore {
  private readonly file: string
  private dataUrl: string | null

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'ball-icon.json')
    const raw = readJson<Partial<BallIconFile> | null>(this.file, null)
    this.dataUrl = sanitize(raw?.dataUrl)
  }

  get(): string | null {
    return this.dataUrl
  }

  /** 传 null 表示清除。返回真正存下来的值（不合法输入的结果是 null） */
  set(dataUrl: string | null): string | null {
    this.dataUrl = sanitize(dataUrl)
    try {
      writeJsonAtomic(this.file, {
        dataUrl: this.dataUrl,
        updatedAt: Date.now()
      } satisfies BallIconFile)
    } catch (err) {
      log.error('写入自定义悬浮球图标失败', err)
    }
    return this.dataUrl
  }
}
