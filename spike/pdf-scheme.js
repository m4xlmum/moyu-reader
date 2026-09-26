/**
 * 探针：本机 PDF 的阅读页。从「页面自己取字节」到「白纸逐像素透明、字随主题上色」。
 *
 * 内置阅读器那条死路已经量过（Q51）：那张纸是 PDFium 画在插件表面上的，注入的 CSS
 * 与 SVG 滤镜都落不到它头上（0/120000 个透明像素）。这一版换成自家阅读页，因此
 * 这一支探针要证的是一条**完整的链**，链上每一环都得自己说话：
 *
 *   Q1  通道本身：`moyu-pdf://doc/<token>` 取字节（整份 + Range 三种写法）、
 *       `moyu-pdf://asset/…` 取资源（内容类型、wasm 的魔术字）、以及两条「不许」：
 *       目录白名单之外的 404、`..` 穿目录的 400。
 *   Q2  页面真的把书取到手并画出来了：HUD 上那行「n / 总页」、画布尺寸、
 *       fit-width（画布的 CSS 宽 == 正文区宽）。
 *   Q3  白纸变成透明：**画布上**与**窗口上**分别数像素。窗口那一份才是这个程序
 *       对外的主张——桌面能透过来。
 *   Q4  字随主题：把配置推成暗夜主题，同一页重画，量字色有没有整体翻面
 *       （浅色墨多起来、深色墨归零），而透明区不受影响。
 *   Q5  深浅自动判对：深底浅字那两页（fixtures/dark 整页铺满、fixtures/slab 只占四成半）
 *       不许被抹平。它没有单独一问，而是靠换素材再跑一遍 Q3/Q4 量的——同一套判据
 *       在两种极性、两种画满程度的页面上都得成立（slab 那一份正是「画满没画满」这条
 *       界线为它量的，见 keying.ts 的 PAPER_SHARE 与 Q52）。
 *   Q6  缩放：右栏那条缩放改的是 zoomLevel，页面得跟着重排而不是被拉大
 *       （画布设备像素宽 ×1.2，而 CSS 宽度不变）。
 *   Q7  CSP 一条都没报：这一页的 CSP 比别的页多三条放行（wasm、blob worker、
 *       moyu-pdf:），漏一条就会在运行时被拦下来，而**被拦下来是不出声的**。
 *   Q8  preload 到手了（这一页要读配置才画得出墨色），且页面里没有异常。
 *   Q9  正文透明度（配置 ui.readerOpacity，右栏第三条滑块）：**合成之后的窗口上**
 *       画布那一条的最大 alpha 跟着值一起减半，而右下角那条浮层的纹丝不动
 *       ——浮层是控件，控件不跟着淡。CSS opacity 动不了画布里的像素，
 *       因此这一问只能量合成结果（getImageData 读回来一个字节都不变）。
 *
 * 一问一个进程：本仓库的探针在同一个进程里开第二扇窗加载 file:// 会 ERR_FAILED
 * （Q24 那条环境的脾气），而这一支每个素材都要重新 loadURL 一次。因此跑法是一串
 * 子进程，`all` 那一档自己把它们串起来。
 *
 * 还有一步台面下的机关：真跑之前会把自己**重开一次**，让 `app.getAppPath()` 指向
 * 一个像模像样的应用目录（有 package.json、有 node_modules）——pdf.js 那四样资源
 * 是主进程按这个值找的，直接跑会让它去 `spike/node_modules` 里翻。见 buildStage()。
 *
 * 用的是**真的** pdfReader.ts / sessionSetup.ts / 真的构建产物（esbuild 打成一包再
 * require，见 buildStage()），页面也是真的 out/renderer/pdf.html——探针不自己搭一个
 * 玩具页面，因为这一支量的正是「真页面在真通道上跑起来是什么样」。
 *
 * 跑法：
 *   npx electron spike/pdf-scheme.js                    （默认量 panel：画了纸的那一页）
 *   npx electron spike/pdf-scheme.js plain|panel|dark|photo|cjk|slab
 *   npx electron spike/pdf-scheme.js all [--shots]
 * 素材：npx electron spike/pdf-render.js fixtures（本探针不自己造，缺了会说）
 * 产出：终端一份 [Qn] 报告、spike/out/pdf-scheme-<素材>.json（有一问没过就以非零码退出）
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(__dirname, 'out')
const FIX = path.join(OUT, 'fixtures')
const STAGE = path.join(OUT, 'pdf-stage')
const SHOTS = process.argv.includes('--shots')

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const BOOK = args[0] ?? 'panel'

/** 纸白那一档的两个墨色（themes.css 里 --moyu-ink 的原值），Q4 靠它们分辨翻没翻面 */
const INK_PAPER = [0x15, 0x18, 0x1d]
const INK_NIGHT = [0xe7, 0xe9, 0xee]

const results = []
function ok(id, pass, detail) {
  results.push({ id, pass, detail })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id} ${detail}`)
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ 真模块

/**
 * 把「应用目录」摆出来，再把自己重开一次。
 *
 * 为什么要多这一步：pdf.js 那四样资源是主进程按 `app.getAppPath()` 找的
 * （services/pdfReader.ts 的 assetRoot()），而这个值是从**传给 electron 的那个路径**
 * 来的——直接跑 `electron spike/pdf-scheme.js`，应用目录就是 `spike/`，于是资源会去
 * `spike/node_modules/pdfjs-dist` 找，全 404。真程序里它是应用根目录（开发期是仓库根、
 * 打包后是 app.asar），要量真那条路，就得让探针跑在一个同样形状的目录里：有
 * package.json，有 node_modules（一条 junction 指回仓库那份，零拷贝）。
 *
 * 于是外层这一次只负责摆目录，然后 `electron <stage>` 重开——electron 拿目录当应用
 * 目录，认它 package.json 的 main。里层才是量东西的那一个，`__dirname` 仍是 spike/。
 *
 * 两件事是刻意的：
 *  · `outbase` 取 src，于是模块落在 <stage>/main/services 下；而 rendererUrl 是拿
 *    `__dirname` 拼的（'../renderer/pdf.html'），因此渲染产物要摆在
 *    <stage>/main/renderer——这正是下面那句 cpSync 在干的事。不这么做，就得让探针
 *    自己拼一个假地址，那它量的就不是真页面了。
 *  · 用 buildSync：注册特权协议只能在 app ready **之前**，而模块体是唯一来得及的地方
 *    （app.whenReady().then 里再注册是白注册）。
 */
function buildStage() {
  // 逐层铺开，**不整棵删掉**（`fs.rmSync` 也不行、shell 的 `rm -rf` 尤其不行）：
  // 那棵底下有一条 node_modules 的 junction 指回仓库，MSYS 的 rm 会**顺着它走进仓库**，
  // 把真的 node_modules 里删掉一批（实测删掉了 .bin 与 electron/dist，代价是重装一遍）。
  // 渲染产物那一层是覆盖着写的，旧哈希的文件留着无害——pdf.html 每次都被换成新那份。
  const renderer = path.join(ROOT, 'out', 'renderer')
  if (!fs.existsSync(path.join(renderer, 'pdf.html'))) {
    throw new Error('还没有构建产物：先跑一次 npx electron-vite build')
  }
  fs.mkdirSync(path.join(STAGE, 'main', 'renderer'), { recursive: true })
  esbuild.buildSync({
    entryPoints: [
      path.join(ROOT, 'src', 'main', 'services', 'pdfReader.ts'),
      path.join(ROOT, 'src', 'main', 'services', 'sessionSetup.ts'),
      path.join(ROOT, 'src', 'main', 'services', 'configStore.ts'),
      path.join(ROOT, 'src', 'shared', 'ipc.ts')
    ],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outdir: STAGE,
    outbase: path.join(ROOT, 'src'),
    outExtension: { '.js': '.cjs' },
    alias: { '@shared': path.join(ROOT, 'src', 'shared') },
    external: ['electron'],
    logLevel: 'silent'
  })
  fs.cpSync(renderer, path.join(STAGE, 'main', 'renderer'), { recursive: true })

  // 应用目录该有的样子：一份 package.json，一份 main，一条指回仓库的 node_modules
  fs.writeFileSync(
    path.join(STAGE, 'package.json'),
    JSON.stringify({ name: 'moyu-pdf-scheme-probe', version: '0.0.0', main: 'probe.cjs' }, null, 2)
  )
  fs.writeFileSync(path.join(STAGE, 'probe.cjs'), 'require(process.env.PDF_SCHEME_PROBE)\n')
  const link = path.join(STAGE, 'node_modules')
  if (!fs.existsSync(link)) fs.symlinkSync(path.join(ROOT, 'node_modules'), link, 'junction')
}

/** 里层：目录已经摆好，只把模块 require 进来 */
function loadStage() {
  const at = (...p) => path.join(STAGE, ...p)
  return {
    pdf: require(at('main', 'services', 'pdfReader.cjs')),
    session: require(at('main', 'services', 'sessionSetup.cjs')),
    config: require(at('main', 'services', 'configStore.cjs')),
    ipc: require(at('shared', 'ipc.cjs')),
    preload: path.join(ROOT, 'out', 'preload', 'index.js')
  }
}

/** 里层的进程长什么样：带一个环境变量把自己重开成 `electron <stage> …` */
function respawn(args) {
  return spawnSync(process.execPath, [STAGE, ...args], {
    stdio: 'inherit',
    env: { ...process.env, PDF_SCHEME_PROBE: __filename }
  })
}

/**
 * 失手就退。
 *
 * 主进程里抛出的异常**不会**让 Electron 退出：它只是不再往下走，于是变成一个没有
 * 窗口、也永远不结束的进程。这一支被这个坑埋过——摆目录那一步 EPERM 之后，探针在
 * 那儿挂到人去杀它，日志里只剩一段栈。凡是「一失手就再也回不来」的地方都走这一句。
 */
function fatal(what, err) {
  console.error(`FAIL ${what}：`, err)
  process.exit(1)
}

const INNER = Boolean(process.env.PDF_SCHEME_PROBE)
if (!INNER) {
  try {
    buildStage()
  } catch (err) {
    fatal('摆目录', err)
  }
  const child = respawn(process.argv.slice(2))
  process.exit(child.status ?? 1)
}

let mods
try {
  mods = loadStage()
} catch (err) {
  fatal('装载模块', err)
}

// 注册特权协议必须在 ready 之前；显示名与主程序一致，userData 才不会另起一处
app.setName('moyu-reader')
mods.pdf.registerPdfScheme()

// ------------------------------------------------------------------ 读页面

/**
 * 把页面里能看见的东西一次读回来。
 *
 * 逐像素那一段与页面自己的键控是同一个判据的两种写法。四档的分界是量出来的：
 *
 *   透明   a < 8             纸被键掉之后剩下的，也是这个程序对外的主张
 *   半透明 8 ≤ a < 200       字的边缘、以及本来就不是纯黑的墨
 *   墨     a ≥ 200 且贴着给定墨色   正文。**记下最实的那一个像素有多实**
 *   纸     a ≥ 200 且近白           一个都不该有
 *
 * `maxInk` 是这一趟最要紧的读数：键控若不在墨那一头把量程拉到 1，正文会停在
 * 93% 左右（#111 的墨在纸白上算出来就是 0.933），桌面上那 6.7% 从笔画里透出来
 * ——这正是当初量纸那一头时见过的同一个数。
 *
 * 另外：`getContext` 只读画布**画过之后**的（width > 1）。否则探针会抢在页面
 * 前面把上下文取走，而 getContext 的选项只认第一次——`willReadFrequently`
 * 会因此失效，控制台立刻报一句「getImageData 很慢」。这个坑真趟过。
 *
 * `hud` 那行「n / 总页」是**界面上的字**，用它当「画好了没有」的信号，
 * 比往页面里塞一个 data-ready 属性更诚实：探针读到的就是用户看到的那一行。
 */
async function readPage(win, ink) {
  const [r, g, b] = ink
  return win.webContents.executeJavaScript(
    `(() => {
      const c = document.querySelector('canvas')
      const stage = document.querySelector('.stage')
      const ctx = c && c.width > 1 ? c.getContext('2d') : null
      const d = ctx ? ctx.getImageData(0, 0, c.width, c.height).data : []
      let transparent = 0, paper = 0, soft = 0, mr = 0, mg = 0, mb = 0, maxInk = 0
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]
        if (a < 8) { transparent++; continue }
        if (a < 200) { soft++; continue }
        if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) paper++
        else if (Math.abs(d[i] - ${r}) < 24 && Math.abs(d[i + 1] - ${g}) < 24 && Math.abs(d[i + 2] - ${b}) < 24) {
          if (d[i] > 128) mr++; else mb++
          if (a > maxInk) maxInk = a
        }
      }
      const style = c ? getComputedStyle(c) : null
      const root = getComputedStyle(document.documentElement)
      return {
        ok: !!c,
        w: c ? c.width : 0, h: c ? c.height : 0,
        total: c ? c.width * c.height : 0,
        transparent, paper, soft, lightInk: mr, darkInk: mb, maxInk,
        cssW: c ? Math.round(parseFloat(style.width)) : 0,
        stageW: stage ? stage.clientWidth : 0,
        stageScrollW: stage ? stage.scrollWidth : 0,
        hud: (document.querySelector('.hud__count') || {}).textContent || null,
        keys: [...document.querySelectorAll('.hud__key')].map((b) => b.textContent.trim()),
        theme: document.documentElement.dataset.theme || null,
        ink: root.getPropertyValue('--moyu-ink').trim(),
        zoom: parseFloat(root.getPropertyValue('--moyu-zoom')) || 1,
        dpr: devicePixelRatio,
        hasApi: typeof window.moyu === 'object' && window.moyu !== null,
        note: (document.querySelector('.note') || {}).textContent || null
      }
    })()`,
    true
  )
}

/** 等到页面把第一页画好（HUD 出现就是画好了），最多等 25 秒 */
async function waitDrawn(win, ink, timeout = 25000) {
  const until = Date.now() + timeout
  let last = null
  while (Date.now() < until) {
    last = await readPage(win, ink)
    if (last && last.hud) return last
    await delay(150)
  }
  return last
}

// ------------------------------------------------------------------ 量一份素材

async function run(book) {
  const file = path.join(FIX, `${book}.pdf`)
  if (!fs.existsSync(file)) {
    throw new Error(`没有这份素材：${book}.pdf（先跑 npx electron spike/pdf-render.js fixtures）`)
  }
  const bytes = fs.readFileSync(file)
  const fileUrl = pathToFileURL(file).href
  const readerUrl = mods.pdf.pdfReaderUrl(fileUrl)
  const token = new URL(readerUrl).searchParams.get('doc')

  const ses = mods.session.setupSession()
  mods.pdf.registerPdfProtocol(ses)
  mods.session.hardenWebContents()

  // 页面要读配置才画得出墨色。真程序里这条 IPC 由 registerDataIpc 提供，
  // 探针给一份最小的替身：只填 ui 那一格，够 useTheme 用
  const cfg = { ...mods.config.defaultConfig(), ui: { homeTheme: 'paper', backgroundOpacity: 1 } }
  ipcMain.handle(mods.ipc.INVOKE.configGet, () => cfg)

  // -------------------------------------------------------------- Q1 通道
  const doc = `moyu-pdf://doc/${token}`
  const whole = await ses.fetch(doc)
  const wholeBytes = Buffer.from(await whole.arrayBuffer())
  ok(
    'Q1a doc 整份',
    whole.status === 200 &&
      whole.headers.get('content-type') === 'application/pdf' &&
      wholeBytes.length === bytes.length &&
      wholeBytes.equals(bytes),
    `${whole.status} ${whole.headers.get('content-type')} ${wholeBytes.length} 字节（原文件 ${bytes.length}）`
  )

  const ranges = [
    ['0-99', 0, 99],
    ['100-199', 100, 199],
    ['-50', bytes.length - 50, bytes.length - 1]
  ]
  for (const [spec, from, to] of ranges) {
    const res = await ses.fetch(doc, { headers: { Range: `bytes=${spec}` } })
    const got = Buffer.from(await res.arrayBuffer())
    const want = bytes.subarray(from, to + 1)
    ok(
      `Q1b Range bytes=${spec}`,
      res.status === 206 &&
        res.headers.get('content-range') === `bytes ${from}-${to}/${bytes.length}` &&
        got.equals(want),
      `${res.status} ${res.headers.get('content-range')} ${got.length} 字节，逐字节相同 ${got.equals(want)}`
    )
  }

  const cmap = await ses.fetch('moyu-pdf://asset/cmaps/UniGB-UCS2-H.bcmap')
  const cmapBytes = Buffer.from(await cmap.arrayBuffer())
  const wasm = await ses.fetch('moyu-pdf://asset/wasm/jbig2.wasm')
  const wasmBytes = Buffer.from(await wasm.arrayBuffer())
  ok(
    'Q1c asset 资源',
    cmap.status === 200 &&
      cmapBytes.length > 1000 &&
      wasm.status === 200 &&
      wasm.headers.get('content-type') === 'application/wasm' &&
      wasmBytes.subarray(0, 4).toString('hex') === '0061736d',
    `cmap ${cmap.status}/${cmapBytes.length} 字节；wasm ${wasm.status}/${wasm.headers.get('content-type')}/${wasmBytes.length} 字节，魔术字 ${wasmBytes.subarray(0, 4).toString('hex')}`
  )

  const escape = await ses.fetch('moyu-pdf://asset/cmaps/../../../package.json')
  const outside = await ses.fetch('moyu-pdf://asset/build/pdf.mjs')
  const unknown = await ses.fetch('moyu-pdf://doc/00000000-0000-0000-0000-000000000000')
  ok(
    'Q1d 该挡的挡住',
    escape.status === 400 && outside.status === 404 && unknown.status === 404,
    `穿目录 ${escape.status}、白名单外的目录 ${outside.status}、不认识的 token ${unknown.status}`
  )

  // -------------------------------------------------------------- 开页面
  const win = new BrowserWindow({
    show: false,
    width: 640,
    height: 904,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      session: ses,
      preload: mods.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.setBackgroundColor('#00000000')

  const complaints = []
  win.webContents.on('console-message', (event) => {
    // Electron 35 起这个事件只有一个对象参数；旧写法是三段位置参数，两种都收
    const level = event?.level ?? arguments[1]
    const message = event?.message ?? arguments[2]
    if (level === 'error' || level === 'warning' || level === 2 || level === 3) {
      complaints.push(String(message))
    }
  })
  let failed = null
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    failed = `${code} ${desc} ${url}`
  })

  await win.webContents.loadURL(readerUrl)
  const first = await waitDrawn(win, INK_PAPER)

  ok('Q2a 页面画出来了', !!first?.hud, first?.hud ? `HUD「${first.hud}」` : `没等到，页面写着「${first?.note}」`)
  const pages = Number((first?.hud ?? '0 / 0').split('/')[1]?.trim() ?? 0)
  ok(
    'Q2b fit-width',
    !!first && first.w > 0 && Math.abs(first.cssW - first.stageW) <= 1 && first.w === Math.round(first.cssW * first.dpr),
    `画布 ${first?.w}×${first?.h} 设备像素，CSS 宽 ${first?.cssW}，正文区宽 ${first?.stageW}，dpr ${first?.dpr}`
  )

  const share = (n, total) => (total ? +((n / total) * 100).toFixed(1) : 0)
  const inkCount = (p) => (p ? p.darkInk + p.lightInk : 0)
  ok(
    'Q3a 画布上白纸没了',
    !!first &&
      share(first.transparent, first.total) > 50 &&
      first.paper === 0 &&
      inkCount(first) > 200 &&
      first.maxInk >= 250,
    `透明 ${first?.transparent}（${share(first?.transparent, first?.total)}%）、一张不透明的白纸 ${first?.paper}、墨 ${inkCount(first)} 个像素（最实的 ${first?.maxInk}/255）`
  )

  await delay(250)
  const shot = await win.webContents.capturePage()
  const size = shot.getSize()
  const bmp = shot.toBitmap()
  let winTransparent = 0
  for (let i = 0; i < bmp.length; i += 4) if (bmp[i + 3] < 8) winTransparent++
  ok(
    'Q3b 窗口上白纸没了',
    share(winTransparent, size.width * size.height) > 50,
    `窗口 ${size.width}×${size.height}，透明 ${winTransparent}（${share(winTransparent, size.width * size.height)}%）`
  )
  if (SHOTS) fs.writeFileSync(path.join(OUT, `pdf-scheme-${book}-paper.png`), shot.toPNG())

  // -------------------------------------------------------------- Q4 换主题
  const beforeInk = await readPage(win, INK_PAPER)
  Object.assign(cfg, { ui: { homeTheme: 'night', backgroundOpacity: 1 } })
  win.webContents.send(mods.ipc.BROADCAST.configChanged, cfg)
  await delay(900)
  const dark = await readPage(win, INK_NIGHT)
  ok(
    'Q4 字随主题',
    !!dark &&
      dark.theme === 'night' &&
      dark.ink.toLowerCase() === '#e7e9ee' &&
      dark.lightInk > 200 &&
      dark.maxInk >= 250 &&
      dark.paper === 0,
    `主题 ${beforeInk?.theme} → ${dark?.theme}，墨色 ${beforeInk?.ink} → ${dark?.ink}，浅色墨 ${beforeInk?.lightInk} → ${dark?.lightInk}（最实的 ${dark?.maxInk}/255），白纸 ${dark?.paper}，透明 ${share(dark?.transparent, dark?.total)}%`
  )
  if (SHOTS) fs.writeFileSync(path.join(OUT, `pdf-scheme-${book}-night.png`), (await win.webContents.capturePage()).toPNG())

  // 回到纸白，后面的读数与截图都按默认主题
  Object.assign(cfg, { ui: { homeTheme: 'paper', backgroundOpacity: 1 } })
  win.webContents.send(mods.ipc.BROADCAST.configChanged, cfg)
  await delay(900)

  // -------------------------------------------------------------- Q6 缩放
  const was = await readPage(win, INK_PAPER)
  win.webContents.zoomLevel = 1 // 1.2 倍
  await delay(900)
  const zoomed = await readPage(win, INK_PAPER)
  const ratio = zoomed.w / was.w
  ok(
    'Q6 缩放是重排不是拉伸',
    Math.abs(zoomed.dpr / was.dpr - 1.2) < 0.02 &&
      Math.abs(ratio - 1.2) < 0.05 &&
      Math.abs(zoomed.cssW - was.cssW) <= 2 &&
      zoomed.stageScrollW > zoomed.stageW,
    `dpr ${was.dpr} → ${zoomed.dpr}，画布宽 ${was.w} → ${zoomed.w}（×${ratio.toFixed(3)}），CSS 宽 ${was.cssW} → ${zoomed.cssW}，--moyu-zoom ${was.zoom} → ${zoomed.zoom}，正文区 ${zoomed.stageScrollW}/${zoomed.stageW}`
  )
  win.webContents.zoomLevel = 0

  // -------------------------------------------------------------- Q9 正文透明度
  //
  // 右栏第三条滑块（ui.readerOpacity）改的是这一页的**正文**：画布上乘一道
  // CSS opacity。量的是合成之后的窗口，不是画布里的像素——CSS opacity 由合成器
  // 做，getImageData 读回来的字节一个都不变（这正是选它、而不选「把 alpha 乘进
  // 键控那一趟」的原因：后者要整页重算 50–100ms，一条滑块拖不动）。
  //
  // 两处各取一个矩形：
  //   · 画布顶上那一条 —— 里面只有字，最大 alpha 应当跟着值一起降；
  //   · 右下角那条浮层 —— 它是控件，最大 alpha 应当纹丝不动。
  // 量浮层之前先按一下 Shift 把它叫醒（它静止 2.6 秒就自己淡出去，
  // 淡出去之后那一块当然是透明的，量出来是一条**假通过**）。
  const 叫醒 = `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))`
  const 取矩形 = `(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const c = document.querySelector('canvas')
    const hud = document.querySelector('.hud')
    return JSON.stringify({
      canvas: box(c),
      hud: hud && !hud.classList.contains('off') ? box(hud) : null,
      canvasOpacity: parseFloat(getComputedStyle(c).opacity),
      hudOpacity: hud ? parseFloat(getComputedStyle(hud).opacity) : null,
      视口: { w: window.innerWidth, h: window.innerHeight }
    })
  })()`

  /** 一个矩形里最实的那一点。alpha 的最大值就是「有没有被淡掉」这一个数 */
  async function maxAlpha(rect, 视口) {
    // 与视口求交：画布比窗口高（一页要滚着看），越界的矩形交给 capturePage 是自找麻烦
    const x = Math.max(0, Math.round(rect.x))
    const y = Math.max(0, Math.round(rect.y))
    const shot = await win.webContents.capturePage({
      x,
      y,
      width: Math.max(1, Math.min(Math.round(rect.width), 视口.w - x)),
      height: Math.max(1, Math.min(Math.round(rect.height), 视口.h - y))
    })
    const bmp = shot.toBitmap()
    let max = 0
    for (let i = 3; i < bmp.length; i += 4) if (bmp[i] > max) max = bmp[i]
    return max
  }

  /**
   * 量一轮：叫醒浮层 → 读矩形与两处 opacity → 各取一次最大 alpha。
   *
   * 叫醒与读矩形必须是两次调用，中间还得等**比它那条过渡更长**的一会儿
   * （浮层的 opacity 有 220ms 的 transition）：Vue 把 `hudOn` 画到 class 上是在
   * 微任务里，同一个任务里读到的还是「淡出去」的那一帧；而等不够的话量到的是
   * 淡入到一半的浮层（实测 150ms 时读到 0.79），那一条读数就成了「浮层自己
   * 在淡」，与这条滑块一点关系都没有。
   */
  async function 量正文() {
    await win.webContents.executeJavaScript(叫醒)
    await delay(450)
    const 几何 = JSON.parse(await win.webContents.executeJavaScript(取矩形))
    const 画布条 = { ...几何.canvas, height: Math.min(160, 几何.canvas.height) }
    return {
      几何,
      画布最大alpha: await maxAlpha(画布条, 几何.视口),
      浮层最大alpha: 几何.hud ? await maxAlpha(几何.hud, 几何.视口) : null
    }
  }

  const 不淡 = await 量正文()
  const 淡到 = 0.4
  Object.assign(cfg, { ui: { homeTheme: 'paper', backgroundOpacity: 1, readerOpacity: 淡到 } })
  win.webContents.send(mods.ipc.BROADCAST.configChanged, cfg)
  await delay(700)
  const 淡了 = await 量正文()

  // 回到 1：这一问还要证「拉回来就真的回来了」——注入过的那条 opacity 不许赖着
  Object.assign(cfg, { ui: { homeTheme: 'paper', backgroundOpacity: 1, readerOpacity: 1 } })
  win.webContents.send(mods.ipc.BROADCAST.configChanged, cfg)
  await delay(700)
  const 拉回 = await 量正文()
  if (SHOTS) fs.writeFileSync(path.join(OUT, `pdf-scheme-${book}-dim.png`), (await win.webContents.capturePage()).toPNG())

  {
    const 应到 = Math.round(不淡.画布最大alpha * 淡到)
    const 到了 = Math.abs(淡了.画布最大alpha - 应到) <= 6
    const 浮层没动 =
      不淡.浮层最大alpha !== null &&
      淡了.浮层最大alpha !== null &&
      Math.abs(淡了.浮层最大alpha - 不淡.浮层最大alpha) <= 2
    const 拉得回来 = Math.abs(拉回.画布最大alpha - 不淡.画布最大alpha) <= 4
    ok(
      'Q9 正文透明度只淡正文',
      不淡.几何.canvasOpacity === 1 &&
        淡了.几何.canvasOpacity === 淡到 &&
        到了 &&
        浮层没动 &&
        拉得回来,
      `画布 opacity ${不淡.几何.canvasOpacity} → ${淡了.几何.canvasOpacity} → ${拉回.几何.canvasOpacity}；` +
        `画布最大 alpha ${不淡.画布最大alpha} → ${淡了.画布最大alpha}（按 ${淡到} 应当到 ${应到}）→ ${拉回.画布最大alpha}；` +
        `浮层（控件）最大 alpha ${不淡.浮层最大alpha} → ${淡了.浮层最大alpha}，自身 opacity ${不淡.几何.hudOpacity}`
    )
  }

  // -------------------------------------------------------------- Q7 Q8
  const csp = complaints.filter((m) => /Content Security Policy|Refused to/i.test(m))
  ok(
    'Q7 CSP 一条都没报',
    csp.length === 0,
    csp.length === 0 ? `页面共 ${complaints.length} 条警告/错误，没有一条是 CSP` : csp.join(' | ')
  )
  ok(
    'Q8 preload 与页面状态',
    !!first && first.hasApi === true && !failed && complaints.length === 0,
    `window.moyu ${first?.hasApi}，加载 ${failed ?? '没失败'}，控制台 ${complaints.length} 条：${complaints.join(' | ').slice(0, 300)}`
  )

  fs.writeFileSync(
    path.join(OUT, `pdf-scheme-${book}.json`),
    JSON.stringify(
      {
        book,
        readerUrl,
        pages,
        first,
        night: dark,
        zoomed,
        dim: { 不淡, 淡了, 拉回 },
        complaints,
        results
      },
      null,
      2
    )
  )
  win.destroy()
}

// ------------------------------------------------------------------ 入口

async function main() {
  if (BOOK === 'all') {
    // 一问一个进程：本进程已经开过一扇窗了，再 loadURL 一次 file:// 会 ERR_FAILED。
    // 直接生成里层那一形（带环境变量），省掉每次重摆一遍目录
    let bad = 0
    for (const name of ['plain', 'panel', 'dark', 'photo', 'cjk', 'slab']) {
      const child = respawn(SHOTS ? [name, '--shots'] : [name])
      if (child.status !== 0) bad++
    }
    app.exit(bad === 0 ? 0 : 1)
    return
  }

  await run(BOOK)
  const bad = results.filter((r) => !r.pass)
  console.log(`\n[${BOOK}] ${results.length - bad.length}/${results.length} 通过`)
  app.exit(bad.length === 0 ? 0 : 1)
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('FAIL', err)
    app.exit(1)
  })
)
