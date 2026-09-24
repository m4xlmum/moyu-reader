/**
 * 自动检查更新。
 *
 * 三件事：知道有新版本（查 latest.yml）→ 让人看得见（窗口内的一条提示，
 * 见 renderer/src/chrome/UpdateNotice.vue）→ 装得上（下载、校验、起安装程序）。
 *
 * ## 为什么不用 electron-updater
 *
 * 这是「装个库就完了」的典型需求，但在这个仓库里不是：
 *
 * 1. 运行时依赖现在只有两个（都是 @electron-toolkit 的），而它会带进来八九个
 *    （fs-extra / js-yaml / semver / lodash.* / tiny-typed-emitter…），
 *    externalizeDepsPlugin() 让它们全都要打进 app.asar。为一个「一年点几次」
 *    的功能换掉这个形状，不划算。
 * 2. 它的安装那一步与本项目的退出流程打架。quitAndInstall() 走的是它挂在
 *    app.on('quit') 上的处理器，且要求 exitCode === 0；而本项目的 will-quit
 *    结尾是 app.exit(0)——那是有意为之的（那台机器上 Electron 的默认退出会卡
 *    四十多秒，见 src/main/index.ts 的 will-quit）。也就是说「退出时自动装」
 *    在这里本来就不可靠，而绕开它只能自己 spawn 安装程序。
 * 3. 它最值钱的是差量下载（.blockmap），代价是要一直维护 .blockmap 并把它的
 *    下载器一起吞下来。本项目的更新是「用户点一下才下」，全量可接受。
 *
 * 自己写的代价是**每次更新都全量下载**（1.0.0 的安装包 111MB）。换来的是零新
 * 依赖、退出流程不动、以及安装那一步完全在自己手里。
 *
 * ## 状态只有一份
 *
 * 这个类持有 UpdateState，界面（提示条与设置页）都只是它的投影。因此下载进度
 * 在哪个文档里看都是同一个数。**提示条是否占版面**是另一回事，那是窗口控制器
 * 持有的版面状态（WindowRuntime.noticeVisible），由这里的 setNoticeVisible 拨动。
 *
 * ## 失败是安静的
 *
 * 查不到、下不动、校验不过——一律只在设置页那一行里写一句，**界面上不弹任何
 * 东西**。这是个隐身软件：一次网络抖动不该在屏幕上冒出一条东西来。唯一的例外
 * 是「已经知道有新版本、用户按了下载、下载失败」——那时提示条本来就在，
 * 它改成说一句「下载失败」，并给一个去发布页的出口。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { net } from 'electron'
import type { ClientRequest } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { spawn as nodeSpawn } from 'node:child_process'
import { join } from 'node:path'
import { UPDATE_CHECK_TIMEOUT_MS, UPDATE_STALL_MS } from '@shared/constants'
import type { UpdateState } from '@shared/types'
import { isNewer, parseVersion } from '@shared/version'
import type { ConfigStore } from './configStore'
import { log } from './logger'

/** latest.yml 里我们要的那几行。electron-builder 写的就这一份形状 */
export interface UpdateManifest {
  version: string
  file: {
    /** 资产文件名，比如 moyu-reader-1.0.0-x64.exe */
    url: string
    /** 文件的 sha512，base64 编码（electron-builder 写的就是 base64） */
    sha512: string
    size: number
  }
}

/** 起安装程序。抽成类型是为了探针能换掉它——探针验到「该起的时候才起」为止 */
export type SpawnFn = (
  file: string,
  args: readonly string[],
  options: { detached: true; stdio: 'ignore' }
) => { unref(): void }

export interface UpdateDeps {
  config: ConfigStore
  /** 更新源，见 constants 的 UPDATE_FEED_BASE */
  feedBase: string
  /** 正在运行的这个版本 */
  currentVersion: string
  /** 这个构建能不能查更新。开发模式下为 false——不联网，也不提示 */
  enabled: boolean
  /** 安装包下到哪儿 */
  downloadDir: string
  onState: (state: UpdateState) => void
  setNoticeVisible: (visible: boolean) => void
  quit: () => void
  spawn?: SpawnFn
}

/**
 * 解析 latest.yml。
 *
 * 刻意**不写通用 YAML 解析器**：认的只有 electron-builder 写出来的那一份形状
 * （顶层 version，files 列表的第一项里 url / sha512 / size）。多认一种写法就多
 * 一种判错的可能，而判错的方向只能是「以为有个新版本」或者「以为没有」——
 * 两者都由不得猜。读不懂就返回 null，上层当作「这次没查到」。
 *
 * url 里不许出现路径分隔符与 `..`：它既会被拼进下载地址，也会被当作本地文件名
 * （见 downloadFile）。这一条是安全边界，不是格式洁癖。
 */
export function parseManifest(text: string): UpdateManifest | null {
  let version = ''
  let url = ''
  let sha512 = ''
  let size = 0
  let inFiles = false
  let entryIndent = -1

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const indent = raw.length - raw.trimStart().length

    if (indent === 0 && line.startsWith('version:')) {
      version = unquote(line.slice('version:'.length).trim())
      continue
    }
    if (indent === 0 && line.startsWith('files:')) {
      inFiles = true
      continue
    }
    if (inFiles) {
      if (line.startsWith('- ')) {
        // 只认第一项：本项目每次只发一个安装包
        if (url !== '') {
          inFiles = false
          continue
        }
        entryIndent = indent
        const first = line.slice(2).trim()
        if (first.startsWith('url:')) url = unquote(first.slice('url:'.length).trim())
        continue
      }
      if (url !== '' && indent > entryIndent) {
        if (line.startsWith('sha512:')) sha512 = unquote(line.slice('sha512:'.length).trim())
        else if (line.startsWith('size:')) size = Number(line.slice('size:'.length).trim())
        continue
      }
      inFiles = false
    }
  }

  if (version === '' || url === '' || sha512 === '') return null
  if (/[/\\]/.test(url) || url.includes('..')) {
    log.warn(`发布信息里的文件名不可信，忽略：${url}`)
    return null
  }
  if (!Number.isFinite(size) || size <= 0) return null
  return { version, file: { url, sha512, size } }
}

function unquote(value: string): string {
  const m = /^['"]?(.*?)['"]?$/.exec(value)
  return m ? m[1] : value
}

/** 一次失败说给人听是什么失败。认不出来的原样带出去，别把它吞掉 */
function reasonOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  if (/ERR_(INTERNET|CONNECTION|NAME|PROXY|TIMED)/.test(text)) return '网络不通'
  return text === '' ? '未知错误' : text
}

export class UpdateService {
  private state: UpdateState
  private manifest: UpdateManifest | null = null
  /** 下载完成并通过校验的安装包路径。只有它是真的才算「能装」 */
  private installerPath: string | null = null
  private checking = false
  private downloading = false
  private inflight: ClientRequest | null = null

  constructor(private readonly deps: UpdateDeps) {
    this.state = {
      phase: deps.enabled ? 'idle' : 'disabled',
      enabled: deps.enabled,
      currentVersion: deps.currentVersion,
      version: null,
      percent: 0,
      message: deps.enabled ? '' : '开发模式下不检查更新',
      ignored: false
    }
  }

  getState(): UpdateState {
    return { ...this.state }
  }

  /**
   * 查一次。
   *
   * `manual` 是从设置页那个按钮来的：**开关管的是自动检查，不管手动**
   * ——用户关掉「自动检查更新」的意思是「别自己联网」，不是「把这个功能删掉」。
   */
  async check(options: { manual?: boolean } = {}): Promise<UpdateState> {
    if (!this.deps.enabled) return this.getState()
    if (!options.manual && !this.deps.config.get().update.autoCheck) return this.getState()
    // 正在查或正在下时不叠第二次：并发请求对这件事没有任何好处
    if (this.checking || this.downloading) return this.getState()

    this.checking = true
    this.setState({ phase: 'checking', message: '' })
    try {
      const text = await this.fetch(
        `${this.deps.feedBase}/releases/latest/download/latest.yml`,
        UPDATE_CHECK_TIMEOUT_MS
      )
      const manifest = parseManifest(text)
      if (!manifest || !parseVersion(manifest.version)) throw new Error('发布信息读不出来')

      // 先把上一个版本的残留下载清掉，再判要不要下
      await this.sweep(manifest.file.url)
      this.manifest = manifest

      if (!isNewer(manifest.version, this.deps.currentVersion)) {
        this.installerPath = null
        this.manifest = null
        this.setState({ phase: 'none', version: null, percent: 0, message: '' })
        return this.getState()
      }

      // 下过、且还对得上就不重下（112MB 不值得重来一遍）
      const cached = join(this.deps.downloadDir, manifest.file.url)
      if (await this.matchesHash(cached, manifest.file.sha512)) {
        this.installerPath = cached
        this.setState({ phase: 'ready', version: manifest.version, percent: 100, message: '' })
        return this.getState()
      }

      this.installerPath = null
      this.setState({ phase: 'available', version: manifest.version, percent: 0, message: '' })
    } catch (err) {
      log.warn(`检查更新失败：${reasonOf(err)}`)
      this.manifest = null
      this.installerPath = null
      this.setState({ phase: 'error', version: null, percent: 0, message: reasonOf(err) })
    } finally {
      this.checking = false
    }
    return this.getState()
  }

  /** 下那个安装包，边下边算 sha512，下完比对 */
  async download(): Promise<UpdateState> {
    if (!this.deps.enabled) return this.getState()
    if (this.downloading || this.checking) return this.getState()
    const manifest = this.manifest
    if (!manifest) return this.getState()

    this.downloading = true
    this.setState({ phase: 'downloading', version: manifest.version, percent: 0, message: '' })
    try {
      await mkdir(this.deps.downloadDir, { recursive: true })
      const target = join(this.deps.downloadDir, manifest.file.url)
      const got = await this.downloadFile(target, manifest)
      if (got !== manifest.file.sha512) {
        // 校验不过的东西不许留在盘上——尤其不许留在「下一步就要执行它」的位置
        await rm(target, { force: true })
        throw new Error('下载的文件校验不过，已删除')
      }
      this.installerPath = target
      this.setState({ phase: 'ready', percent: 100, message: '' })
    } catch (err) {
      log.warn(`下载更新失败：${reasonOf(err)}`)
      this.installerPath = null
      this.setState({ phase: 'error', percent: 0, message: reasonOf(err) })
    } finally {
      this.downloading = false
    }
    return this.getState()
  }

  /**
   * 起安装程序，然后退出。
   *
   * 只有 phase 是 ready（这一版**下完并且校验通过**）才允许走到这里。别的状态
   * 下一律拒绝并且什么都不做——一个没校验过的可执行文件不值得信任。
   *
   * 不传 `/S`、也不传 electron-updater 那套 `--updated`：nsis 是 oneClick: false
   * 且允许改安装目录，用户装过一次、知道那个向导长什么样，升级就走同一个向导
   * （安装目录会记住上次选的那个）。静默安装等于绕过用户。
   *
   * 顺序是「先起、后退出」，这里唯一一处靠时序成立的地方：安装向导要用户点几下
   * 才会真正复制文件，那时本进程早已退出，不存在 exe 被锁住覆盖不了的问题。
   * detached 让安装程序在 app.exit(0) 之后活着；不 detach 会被一起带走。
   */
  install(): void {
    if (this.state.phase !== 'ready' || !this.installerPath) {
      log.warn(`当前状态（${this.state.phase}）不允许安装，已拒绝`)
      return
    }
    const spawn = this.deps.spawn ?? ((f, a, o) => nodeSpawn(f, a as string[], o))
    log.info(`起安装程序：${this.installerPath}`)
    const child = spawn(this.installerPath, [], { detached: true, stdio: 'ignore' })
    child.unref()
    this.deps.quit()
  }

  /**
   * 忽略某个版本（`version` 传 null 是撤销）。
   *
   * 只忽略这一个版本：下一个版本照常提示。落盘，因此下次启动不再冒出来。
   */
  ignore(version: string | null): UpdateState {
    this.deps.config.set((c) => ({ ...c, update: { ...c.update, ignoredVersion: version } }))
    this.setState({})
    return this.getState()
  }

  // ------------------------------------------------------------ 内部

  /**
   * 状态只有这一个出口：改状态 → 广播 → 拨提示条。
   *
   * 提示条的判据是**「有一个已知的新版本、且没被忽略」**，而不是逐个 phase 列举：
   * 下载失败时 version 仍在，提示条就还在，于是它能改口说「下载失败」并给一个
   * 去发布页的出口；查更新失败时 version 是 null（我们确实不知道有没有新版），
   * 提示条自己就收了——不必在界面上弹任何东西。
   */
  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.state.ignored = this.state.version !== null && this.isIgnored(this.state.version)
    this.deps.onState(this.getState())
    this.deps.setNoticeVisible(this.state.version !== null && !this.state.ignored)
  }

  private isIgnored(version: string): boolean {
    return this.deps.config.get().update.ignoredVersion === version
  }

  /** 取一份文本（latest.yml 就几行）。超时用定时器，Electron 的 ClientRequest 没有 setTimeout */
  private fetch(url: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = net.request(url)
      this.inflight = req
      let settled = false
      const finish = (err: Error | null, text?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.inflight === req) this.inflight = null
        if (err) reject(err)
        else resolve(text ?? '')
      }
      const timer = setTimeout(() => {
        req.abort()
        finish(new Error('连接超时'))
      }, timeoutMs)

      req.on('response', (res) => {
        if (res.statusCode !== 200) {
          finish(new Error(`服务器返回 ${res.statusCode}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')))
        res.on('error', (err: Error) => finish(err))
      })
      req.on('error', (err: Error) => finish(err))
      req.end()
    })
  }

  /**
   * 下文件。返回它的 sha512（base64），比对由调用方做。
   *
   * 先写 `<名字>.part`、下完再改名：**半截文件绝不以上面那个名字出现在盘上**。
   * 于是「盘上有这个文件」永远等于「它是完整的」，缓存判断与清理都只需要看一个名字。
   *
   * 卡住的判据是「多久没有数据」而不是总时长：安装包 100MB 以上，网慢的人下
   * 几分钟是正常的，设总时长等于让他们永远更新不了。每收到一块就把表重置。
   */
  private downloadFile(target: string, manifest: UpdateManifest): Promise<string> {
    const part = `${target}.part`
    const url = `${this.deps.feedBase}/releases/download/v${manifest.version}/${manifest.file.url}`
    return new Promise((resolve, reject) => {
      const req = net.request(url)
      this.inflight = req
      const hash = createHash('sha512')
      let received = 0
      let percent = 0
      let settled = false
      const out = createWriteStream(part)

      const cleanup = (): void => {
        clearTimeout(stall)
        out.destroy()
      }
      const fail = (err: Error): void => {
        if (settled) return
        settled = true
        cleanup()
        req.abort()
        void rm(part, { force: true })
        if (this.inflight === req) this.inflight = null
        reject(err)
      }
      const stall = setTimeout(() => fail(new Error('下载中断')), UPDATE_STALL_MS)
      const bump = (): void => {
        stall.refresh()
      }

      req.on('response', (res) => {
        if (res.statusCode !== 200) {
          fail(new Error(`服务器返回 ${res.statusCode}`))
          return
        }
        const header = Number(res.headers['content-length'])
        const total = Number.isFinite(header) && header > 0 ? header : manifest.file.size
        res.on('data', (chunk: Buffer) => {
          bump()
          const buf = Buffer.from(chunk)
          received += buf.length
          hash.update(buf)
          out.write(buf)
          const next = Math.min(99, Math.floor((received / total) * 100))
          if (next !== percent) {
            percent = next
            this.setState({ percent: next })
          }
        })
        res.on('end', () => {
          if (settled) return
          out.end(() => {
            if (settled) return
            settled = true
            cleanup()
            if (this.inflight === req) this.inflight = null
            rename(part, target).then(
              () => {
                this.setState({ percent: 100 })
                resolve(hash.digest('base64'))
              },
              (err: Error) => {
                void rm(part, { force: true })
                reject(err)
              }
            )
          })
        })
        res.on('error', (err: Error) => fail(err))
      })
      req.on('error', (err: Error) => fail(err))
      out.on('error', (err: Error) => fail(err))
      req.end()
    })
  }

  /** 盘上那份文件是不是就是这一份（sha512 对得上）。流式读，不把 100MB 读进内存 */
  private matchesHash(file: string, expected: string): Promise<boolean> {
    return new Promise((resolve) => {
      const hash = createHash('sha512')
      const input = createReadStream(file)
      input.on('data', (chunk) => hash.update(chunk))
      input.on('error', () => {
        resolve(false)
      })
      input.on('end', () => {
        resolve(hash.digest('base64') === expected)
      })
    })
  }

  /** 清掉下载目录里不是这一版的东西（只动我们自己的那个目录） */
  private async sweep(keep: string): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(this.deps.downloadDir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry === keep || entry === `${keep}.part`) continue
      await rm(join(this.deps.downloadDir, entry), { force: true, recursive: true })
    }
  }
}
