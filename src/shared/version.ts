/**
 * 版本号比较。
 *
 * 全应用只有这一处判断「谁更新」。它服务的场景很窄：把 `latest.yml` 里读到的
 * 版本与正在运行的这个版本比一比。因此**不引 semver**——为一个比较带进来一个包
 * 不划算，而这里要认的形状比 semver 窄得多。
 *
 * 规则（逐条都有探针断言，见 spike/update-check.js）：
 *
 *   - `v` 前缀忽略：`v1.0.1` 与 `1.0.1` 是同一个版本；
 *   - 缺段按 0 补：`1.1` 就是 `1.1.0`；
 *   - 逐段比数字，先分出大小的一段落定；
 *   - 段数不同（`1.0.0.1`）：多出来的段里有非零，就更大；
 *   - **带后缀的预发布版低于同号的正式版**：`1.1.0-beta < 1.1.0`。
 *     这条最要紧：本仓库发过 `v0.1.0-alpha`，若按「多一段就更大」去比，
 *     一个 alpha 会被判成比它自己的正式版还新；
 *   - 两个都是预发布版且同号时按后缀字符串的字典序比（`-alpha < -beta < -rc`）。
 *
 * **认不出来的一律判为「不比当前新」**（`parseVersion` 返回 null，
 * `isNewer` 返回 false）：宁可漏报一次更新，不可误报一次——误报会让用户
 * 去下载一个根本不存在的包。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

export interface ParsedVersion {
  /** 数字段，缺的已按 0 补齐到至少三段 */
  nums: number[]
  /** 预发布后缀（`1.1.0-beta` 里的 `beta`），没有则为 null */
  pre: string | null
}

/**
 * 解析版本号。认不出来返回 null。
 *
 * 只收 ASCII 数字、点、以及一个可选的后缀：字母、数字、点、连字符。
 * 这里刻意不去猜更花哨的写法（`1.0.0+build`、`1.0.0.rc1`）——猜错的方向
 * 只能是「把旧的当新的」，那正是上面说要避免的那一种错。
 */
export function parseVersion(input: string): ParsedVersion | null {
  if (typeof input !== 'string') return null
  const text = input.trim().replace(/^v/i, '')
  const [core, ...rest] = text.split('-')
  const nums = core.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : NaN))
  if (nums.length === 0 || nums.some((n) => !Number.isFinite(n))) return null

  const pre = rest.length > 0 ? rest.join('-') : null
  if (pre !== null && !/^[0-9A-Za-z.]+$/.test(pre)) return null

  while (nums.length < 3) nums.push(0)
  return { nums, pre }
}

/**
 * candidate 是否比 current 新。
 *
 * 任何一边认不出来都返回 false（理由见文件头）。
 */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  return compare(a, b) > 0
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  const len = Math.max(a.nums.length, b.nums.length)
  for (let i = 0; i < len; i += 1) {
    const x = a.nums[i] ?? 0
    const y = b.nums[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  // 数字段完全相同，此时预发布版更旧（1.1.0-beta < 1.1.0）
  if (a.pre === b.pre) return 0
  if (a.pre === null) return 1
  if (b.pre === null) return -1
  return a.pre < b.pre ? -1 : 1
}
