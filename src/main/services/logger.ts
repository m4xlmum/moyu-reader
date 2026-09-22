/**
 * 简易文件日志。写往 userData/logs/main.log，超过上限则截断重来。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 512 * 1024

let logPath: string | null = null

export function initLogger(userDataDir: string): void {
  const dir = path.join(userDataDir, 'logs')
  try {
    fs.mkdirSync(dir, { recursive: true })
    logPath = path.join(dir, 'main.log')
  } catch {
    logPath = null
  }
}

function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args
    .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
    .join(' ')}\n`

  if (level === 'ERROR') console.error(line.trimEnd())
  else console.log(line.trimEnd())

  if (!logPath) return
  try {
    const stat = fs.existsSync(logPath) ? fs.statSync(logPath) : null
    if (stat && stat.size > MAX_BYTES) fs.writeFileSync(logPath, '')
    fs.appendFileSync(logPath, line, 'utf8')
  } catch {
    // 日志失败不应影响应用运行
  }
}

function safeStringify(value: unknown): string {
  if (value instanceof Error) return `${value.message}\n${value.stack ?? ''}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const log = {
  info: (...args: unknown[]) => write('INFO', args),
  warn: (...args: unknown[]) => write('WARN', args),
  error: (...args: unknown[]) => write('ERROR', args)
}
