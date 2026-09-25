/**
 * 把 `.impeccable/design.json` 里每个色标的 `tonalRamp` 按它自己的
 * `canonical` 重算一遍。
 *
 * 为什么要有这个脚本，而不是手填那二十条：一条 ramp 是**派生值**——
 * 它是「同一个色相、同一个彩度，明度从 15% 走到 95% 的八级」。写死之后
 * 唯一的用处是好看，唯一的风险是改配色时忘了改它，于是那份 sidecar 会拿
 * 上一套配色的 ramp 配这一套配色的名字，而看图看不出来。派生值就得派生。
 *
 * 这一步**只改 ramp**，别的字段一个字不动：那个文件里其余的数都是量出来的，
 * 这个脚本没有资格重算它们。
 *
 * 配方（从上一版那份 sidecar 反推出来并逐位核对过：`#2563eb` → `0.215 / 262.9`、
 * `#111827` → `0.032 / 264.7`、`#f3f4f6` → `0.003 / 264.5`，都对得上）：
 *   色彩照 sRGB → OKLCH 换出来，**C 与 H 原样**（ramp 说的是同一个色的深浅），
 *   明度取 15.0 → 95.0 之间八级等距（每级 +11.4286），
 *   写成 `oklch(15.0% 0.215 262.9)`：L 一位小数、C 三位、H 一位。
 *
 * 用法：node spike/design-tokens.js
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const fs = require('node:fs')
const path = require('node:path')

const FILE = path.join(__dirname, '..', '.impeccable', 'design.json')

/** sRGB 十六进制 → OKLCH。返回 { L, C, H }，L 为 0–1 的比例、H 为度 */
function toOklch(hex) {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/../g)
    .map((x) => parseInt(x, 16) / 255)
  // 先回线性光：OKLab 定义在**线性** sRGB 上，直接拿伽马后的值算会偏
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const [R, G, B] = [lin(r), lin(g), lin(b)]

  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const H = ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360
  return { L, C: Math.hypot(A, Bb), H }
}

/**
 * 八级。15.0 起、每级 +11.4286——不是四舍五入出来的常数，就是
 * (95 - 15) / 7，写开来是为了让「为什么是这一串」看得出来。
 */
const RAMP = Array.from({ length: 8 }, (_, i) => 15 + ((95 - 15) / 7) * i)

/**
 * 色标 → 一个能算 ramp 的十六进制。
 *
 * ramp 说的是**色相与彩度**，透明度不在其中，所以 `rgba(r, g, b, a)` 那种
 * 淡底要先剥成它的实色。剥法是按分量拼回去，不是切前七个字符——
 * `rgba(47, 74, 158, 0.1)` 的前七个字符是 `rgba(47`，切出来什么都不是。
 */
function solidHexOf(canonical) {
  const s = String(canonical).trim()
  const rgba = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (rgba) {
    return (
      '#' +
      rgba
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    )
  }
  return s.slice(0, 7)
}

function rampFor(canonical) {
  const hex = solidHexOf(canonical)
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`这不是一个能算 ramp 的颜色：${canonical}`)
  }
  const { C, H } = toOklch(hex)
  const c = C.toFixed(3)
  const h = H.toFixed(1)
  return RAMP.map((L) => `oklch(${L.toFixed(1)}% ${c} ${h})`)
}

const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const meta = doc.extensions?.colorMeta
if (!meta) throw new Error(`没有 extensions.colorMeta：${FILE}`)

let n = 0
for (const [key, entry] of Object.entries(meta)) {
  if (!entry?.canonical) throw new Error(`色标 ${key} 没有 canonical，算不出 ramp`)
  entry.tonalRamp = rampFor(entry.canonical)
  n += 1
}

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2), 'utf8')
console.log(`WROTE ${FILE}（${n} 条 ramp，各 8 级）`)
for (const key of ['accent', 'text', 'ground']) {
  const entry = meta[key]
  if (entry) console.log(`  ${key} ${entry.canonical} → ${entry.tonalRamp[0]} … ${entry.tonalRamp[7]}`)
}
