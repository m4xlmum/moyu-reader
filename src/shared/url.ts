/**
 * 地址栏输入的解析与域名工具。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/**
 * 自家页面用的伪协议。
 *
 * 起始页与系统设置对外都只以 moyu:// 示人，真实的 file:// 路径既不显示，
 * 也不该显示——那会暴露本机目录结构。
 */
const OWN_SCHEME = 'moyu://'

/** 这个地址是不是自家页面（起始页、系统设置） */
export function isOwnUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(OWN_SCHEME)
}

/** 形如 example.com、www.example.com:8080/path 的裸域名 */
const BARE_HOST = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/
/**
 * 带协议的绝对地址。
 *
 * 不能用「必须含 ://」来判断：about:blank、data:、view-source: 这些
 * 都是合法的、不带双斜杠的地址，按 :// 判断会把它们误当成搜索词。
 * 同时也不能只看「有没有冒号」——example.com:8080 会被错认成协议。
 * 因此这里列白名单。
 */
const HAS_SCHEME = /^(https?|about|file|data|blob|chrome|view-source|ftp|mailto):/i
/** 可以安全当作站内搜索的输入：含中文，或含空格 */
const LIKELY_SEARCH = /[一-鿿\s]/

/**
 * 判断地址栏输入是否应该被当成网址。
 * 规则保守：只有明确像域名的才当网址，其余一律走搜索，
 * 避免把「红楼梦 在线阅读」这类查询拼成一个不存在的域名。
 */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim()
  if (!s) return false
  if (HAS_SCHEME.test(s)) return true
  if (s.startsWith('localhost')) return true
  if (LIKELY_SEARCH.test(s)) return false
  return BARE_HOST.test(s)
}

/** 把地址栏输入解析为最终要加载的 URL */
export function resolveInput(input: string, searchTemplate: string): string {
  const s = input.trim()
  if (!s) return 'about:blank'
  if (HAS_SCHEME.test(s)) return s
  if (looksLikeUrl(s)) return `https://${s}`
  return searchTemplate.replace('%s', encodeURIComponent(s))
}

/** 从 URL 中取出主机名，失败返回 null */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/** 常见的二级后缀，用于粗略求出 eTLD+1 */
const MULTI_PART_SUFFIXES = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'co.uk', 'org.uk', 'ac.uk', 'co.jp', 'ne.jp', 'or.jp',
  'com.hk', 'com.tw', 'com.au', 'co.kr'
])

/**
 * 粗略求「可注册域名」（eTLD+1），用于按站点记住 UA、缩放等偏好。
 *
 * 需要它而不是直接用 hostname，是因为 weread.qq.com 与 qq.com
 * 应当被视作同一站点，否则用户在两者之间的偏好会不一致。
 * 这里不引入公共后缀列表（体积大且需更新），用一份够用的后缀集近似。
 */
export function registrableDomain(host: string): string {
  const parts = host.split('.')
  if (parts.length <= 2) return host
  const lastTwo = parts.slice(-2).join('.')
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.')
  return lastTwo
}

/** 同一站点判断，用于按站点存偏好 */
export function sameSite(a: string, b: string): boolean {
  const ha = hostOf(a)
  const hb = hostOf(b)
  if (!ha || !hb) return false
  return registrableDomain(ha) === registrableDomain(hb)
}
