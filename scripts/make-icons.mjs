/**
 * 生成应用图标与托盘图标。
 *
 * 不引入任何图形库：手写 PNG 编码（zlib 压缩 + CRC32）并封装成 ICO。
 * 全部按 4 倍超采样绘制再降采样，边缘才不会有锯齿。
 *
 * 运行：node scripts/make-icons.mjs
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SS = 4 // 超采样倍数

// ---------------------------------------------------------------- PNG 编码

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

/** rgba: Uint8ClampedArray，长度 w*h*4 */
function encodePng(rgba, w, h) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // 颜色类型 RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // 每行前置一个过滤器字节（0 = None）
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** 把多张 PNG 封进 ICO（Vista 起支持 PNG 负载） */
function encodeIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 类型：图标
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = 6 + 16 * entries.length

  entries.forEach((entry, i) => {
    const base = i * 16
    directory[base] = entry.size >= 256 ? 0 : entry.size
    directory[base + 1] = entry.size >= 256 ? 0 : entry.size
    directory[base + 2] = 0
    directory[base + 3] = 0
    directory.writeUInt16LE(1, base + 4)
    directory.writeUInt16LE(32, base + 6)
    directory.writeUInt32LE(entry.png.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += entry.png.length
  })

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)])
}

// ---------------------------------------------------------------- 绘制

/** 圆角矩形的内部判定。原点在左上角 (ox, oy)，尺寸 w×h，圆角半径 r。坐标归一化到 0..1 */
function inRoundedRect(x, y, ox, oy, w, h, r) {
  const lx = x - ox
  const ly = y - oy
  if (lx < 0 || ly < 0 || lx > w || ly > h) return false
  const cx = Math.min(Math.max(lx, r), w - r)
  const cy = Math.min(Math.max(ly, r), h - r)
  const dx = lx - cx
  const dy = ly - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * 图形：一本摊开的书。两页之间留出书脊的空隙。
 * 造型刻意保持轴对称且无斜线，这样降到 16px 仍能辨认。
 */
function drawShape(nx, ny) {
  const left = inRoundedRect(nx, ny, 0.13, 0.24, 0.34, 0.54, 0.055)
  const right = inRoundedRect(nx, ny, 0.53, 0.24, 0.34, 0.54, 0.055)
  return left || right
}

function render(size, { background, foreground }) {
  const big = size * SS
  const acc = new Float64Array(size * size * 4)

  for (let by = 0; by < big; by++) {
    for (let bx = 0; bx < big; bx++) {
      const nx = bx / big
      const ny = by / big

      let r = 0
      let g = 0
      let b = 0
      let a = 0

      // 底板
      if (background && inRoundedRect(nx, ny, 0, 0, 1, 1, 0.22)) {
        r = background[0]
        g = background[1]
        b = background[2]
        a = 255
      }

      // 前景图形
      if (drawShape(nx, ny)) {
        r = foreground[0]
        g = foreground[1]
        b = foreground[2]
        a = 255
      }

      // 累积到目标像素
      const tx = Math.floor(bx / SS)
      const ty = Math.floor(by / SS)
      const o = (ty * size + tx) * 4
      acc[o] += (r * a) / 255
      acc[o + 1] += (g * a) / 255
      acc[o + 2] += (b * a) / 255
      acc[o + 3] += a
    }
  }

  const out = new Uint8ClampedArray(size * size * 4)
  const n = SS * SS
  for (let i = 0; i < size * size; i++) {
    const o = i * 4
    const alpha = acc[o + 3] / n
    if (alpha <= 0) continue
    // 颜色按 alpha 加权平均，避免透明边缘发黑
    out[o] = acc[o] / (acc[o + 3] / 255)
    out[o + 1] = acc[o + 1] / (acc[o + 3] / 255)
    out[o + 2] = acc[o + 2] / (acc[o + 3] / 255)
    out[o + 3] = alpha
  }
  return encodePng(out, size, size)
}

// ---------------------------------------------------------------- 输出

const ACCENT = [47, 111, 208]
const WHITE = [255, 255, 255]

mkdirSync(join(root, 'resources'), { recursive: true })
mkdirSync(join(root, 'build'), { recursive: true })

// 应用图标：蓝色底板 + 白书
const appSizes = [16, 32, 48, 64, 128, 256]
const appEntries = appSizes.map((size) => ({
  size,
  png: render(size, { background: ACCENT, foreground: WHITE })
}))
writeFileSync(join(root, 'build', 'icon.ico'), encodeIco(appEntries))
writeFileSync(join(root, 'build', 'icon.png'), render(512, { background: ACCENT, foreground: WHITE }))

// 托盘图标：透明底 + 白书，在深浅两种任务栏上都看得清
const trayEntries = [16, 32, 48].map((size) => ({
  size,
  png: render(size, { background: null, foreground: WHITE })
}))
writeFileSync(join(root, 'resources', 'tray.ico'), encodeIco(trayEntries))

console.log('已生成：build/icon.ico, build/icon.png, resources/tray.ico')
