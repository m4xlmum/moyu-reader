/**
 * 探针：主题管到了哪些界面，以及界面那层「透明中部」有没有被弄坏。
 *
 * 起因是一次范围变更：主题过去只管起始页那一份文档，现在要管到整个界面
 * （顶栏、地址栏、标签条、右栏、悬浮球、弹出面板、系统设置页），**连终端形态
 * 一起**——磷绿时界面也要变直角、换等宽字体。
 *
 * 四份文档各自加载同一份 styles/themes.css，再各自把主题名写到 html[data-theme]
 * 上（文档之间没有继承路径，只能各写一遍）。于是这里有三种问法：
 *
 * 1. **默认零回归**：paper 下界面的每一条 --moyu-* 与改动前硬编码的值逐条相同。
 *    主题层是重写，重写最怕的就是顺手改了默认色，而这种改动在截图上看不出来。
 * 2. **三套主题真的各自生效**：调色板两两不同，且四份文档都拿到了当前主题
 *    （少了任意一份，"改了没反应"就会从那里冒出来）。
 * 3. **透明中部没被弄坏**——本次最要紧的一条。窗口是逐像素透明的，chrome 视图的
 *    中部必须什么也不画，好让下面的网页或桌面露出来。终端世界的扫描线/暗角是
 *    铺满视口的覆盖层，它**绝不能跟着主题进 chrome**：那是机制，不是审美。
 * 4. **新加的那一条「更新提示条」也站得住**。它是一行 30px 的实底，占的是版面
 *    （网页要让出这一行），因此它比这一层里别的任何东西都更容易把中部染上色；
 *    同时它的底、字、强调色必须逐条取自当前主题的令牌——写死一个白底的话，
 *    纸白下看着完全正常，夜与磷绿下当场就是一块白条。这一组单独加载：真机上
 *    提示条只在有新版时才占版面，一直挂着会让上面那几条基准漂移。
 * 5. **停在自家那一屏上时界面没散架**。起始页与系统设置不再是标签页：它们不进
 *    标签条，各有各的入口键。这一态也是一种**没有当前网页**的状态，因此单独加载
 *    两次（Q13）：标签条一格不多、一格不亮，两颗入口键各亮各的，地址栏开关上
 *    写着那一屏的名字。
 *
 * 颜色一律经 canvas 归一后比对：getPropertyValue 拿回来的是计算值，写法
 * （`rgb(255 255 255 / 1)` 还是 `#ffffff`）随主题层怎么写出入很大，比字符串
 * 等于是在比实现细节；比颜色才是比结果。
 *
 * 跑法：npx electron spike/theme-chrome.js
 * 产出：终端一份 [Qn] 报告、spike/out/theme-chrome.json，断言失败时退出码 1
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(__dirname, 'out')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 版面常量从 src/shared/constants.ts 里现读。
 *
 * 抄一个 30 到探针里最省事，但那正是这类断言最容易失效的地方：常量改了、
 * 探针照旧按旧值量，于是「高度对不上」永远报不出来。读源文件只多一处麻烦
 * （正则只认 `export const NAME = 30` 这一种写法），换来的是两边打架时当场红。
 */
function constant(name) {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'constants.ts'), 'utf8')
  const m = new RegExp(`^export const ${name} = ([\\d_]+)$`, 'm').exec(text)
  if (!m) throw new Error(`读不到常量 ${name}（constants.ts 的写法变了？）`)
  return Number(m[1].replace(/_/g, ''))
}

const NOTICE_H = constant('NOTICE_H')

/**
 * 字符串常量同理（HOME_TITLE / SETTINGS_TITLE）。
 *
 * 这一版里「停在自家那一屏上时地址栏开关上写什么」是判据之一，而那两个字
 * 正是从 constants.ts 来的。探针抄一份的话，改文案时两边一起错。
 */
function stringConstant(name) {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'constants.ts'), 'utf8')
  const m = new RegExp(`^export const ${name} = '([^']*)'$`, 'm').exec(text)
  if (!m) throw new Error(`读不到常量 ${name}（constants.ts 的写法变了？）`)
  return m[1]
}

const PAGES = {
  chrome: 'index.html',
  popover: 'popover.html',
  settings: 'settings.html',
  home: 'home.html'
}

/** 三套主题与它们该有的形态（见 @shared/constants 的 HOME_THEMES） */
const THEMES = [
  { id: 'paper', world: 'modern' },
  { id: 'night', world: 'modern' },
  { id: 'crt-green', world: 'terminal' }
]

/**
 * 假桥的入参。每次 loadFile 之前改一改，见下面的 setOptions。
 */
const opts = {
  mode: 'default',
  maximized: false,
  theme: 'paper',
  /*
   * 5 个：与 spike/preview-preload.js 里 ALL_TABS 的条数一致。
   * 标签条里现在**只有网页**——起始页与系统设置不进这一条了（它们是「屏」，
   * 见 spike/own-screens.js），因此这个数就是网页标签的数。
   */
  tabs: 5,
  /*
   * 停在自家哪一屏上：null（看着网页）/ 'home' / 'settings'。
   * 上面那些基准一律用 null；--screen 那一问单独加载两次，见 loadScreen。
   */
  screen: null,
  bgAlpha: 1,
  ballIcon: 'book',
  ballFit: 'cover',
  ballImage: null,
  /*
   * 更新那条：默认没有新版本，于是提示条不占版面。
   * 这一组单独加载一次（见 loadNotice），不混进上面那些基准里。
   */
  notice: null,
  noticePhase: 'available',
  noticePercent: 42
}

ipcMain.on('preview:options', (event) => {
  event.returnValue = { ...opts }
})

/**
 * 改动前 chrome 那几条 --moyu-* 的值（tokens.css 原文）。
 *
 * 抄成一张表而不是从 git 里现读：这张表的用处正是「与改动前逐条相同」，
 * 它会随着主题层一起被改坏——真去读 git 上的旧文件，等于让被验的一方
 * 自己出题。半径与字体另外比，见 PAPER_SHAPE。
 */
const PAPER_EXPECT = {
  '--moyu-surface': ['#ffffff', 1],
  '--moyu-surface-hover': ['#f3f4f6', 1],
  '--moyu-surface-active': ['#e8eaee', 1],
  '--moyu-border': ['#d1d5db', 1],
  '--moyu-hairline': ['#e5e7eb', 1],
  '--moyu-ink': ['#111827', 1],
  '--moyu-text': ['#111827', 1],
  '--moyu-text-dim': ['#5b6472', 1],
  '--moyu-text-faint': ['#6f7683', 1],
  '--moyu-accent': ['#2563eb', 1],
  '--moyu-accent-hover': ['#1d4ed8', 1],
  '--moyu-accent-soft': ['#2563eb', 0.1],
  '--moyu-danger': ['#b91c1c', 1],
  /* 后五个是这次新起名的令牌，纸白下的值就是它们各自取代的那个字面量 */
  '--moyu-sunken': ['#eef0f3', 1],
  '--moyu-sunken-hover': ['#e2e5ea', 1],
  '--moyu-danger-soft': ['#fdf3f2', 1],
  '--moyu-selected': ['#eef4fd', 1],
  '--moyu-on-fill': ['#ffffff', 1]
}

/** 半径与字体：形状那一路的值。radius-md 的 12px 就是它一直以来的兜底值 */
const PAPER_SHAPE = {
  '--moyu-radius': '6px',
  '--moyu-radius-sm': '4px',
  '--moyu-radius-md': '12px',
  '--moyu-radius-pill': '13px',
  '--moyu-radius-tag': '8px',
  '--moyu-radius-track': '7px',
  '--moyu-panel': ['#ffffff', 1],
  '--moyu-ground': ['#f6f7f9', 1]
}

/**
 * 直角验到元素上，不停在变量层。
 *
 * 变量对了不等于元素用了它——把 `border-radius: 13px` 改成
 * `var(--moyu-radius-pill)` 时打错一个字母，值会静静地退回初始的 0，
 * 而 0 恰好也是终端世界的目标值，于是"改对了"和"改坏了"在磷绿下长得一样。
 * 因此在纸白下把这两处的实测圆角与改前的字面量对一次。
 */
const PAPER_RADIUS = { '.address-toggle': '13px', '.tab': '6px' }

/**
 * chrome 里必须保持逐像素透明的那几块。窗口透明靠的就是它们什么都不画。
 *
 * `.spacer` 是最后一块：它是正文那一格本身（网页在原生视图里叠在它上面）。
 * 它多出一块底色，就是桌面上多蒙一层——而提示条正好排在它上面一行，
 * 是这一层里唯一有可能把颜色漏下来的东西。
 */
const TRANSPARENT = ['.root', '.middle', '.main-col', '.spacer']

/**
 * 设置页的「字 / 它脚下的面」对，用来量可读性。
 *
 * 设置页是全应用里唯一一屏同时有好几种面的文档：左栏是凹面、卡片是浮面、
 * 按钮与选中按钮各是一层。浅色主题下它们各自取色，换到深色最容易剩下
 * 「浅底浅字」——那不需要任何变量出错，只需要有一处忘了跟。而这一页的主题
 * 说明里写着「整个界面都跟着换」，所以这一页自己先得站得住。
 *
 * 写成 [名字, 字的选择器, 面的选择器]：多数时候两者是同一个元素，
 * 只有品牌字那种自己不画底、坐在左栏上的才分得开。
 */
const READABLE = [
  ['侧栏品牌', '.brand', '.brand'],
  ['侧栏导航', '.nav-item:not(.active)', '.nav-item:not(.active)'],
  ['侧栏当前项', '.nav-item.active', '.nav-item.active'],
  ['页标题', 'h2', 'h2'],
  ['设置项名', '.field > label', '.card'],
  ['说明文字', '.hint', '.card'],
  ['按钮', '.control button:not(.on)', '.control button:not(.on)'],
  ['选中按钮', '.control button.on', '.control button.on'],
  ['行内代码', 'code', 'code'],
  ['球图标', '.ball-icons .ball-chip:not(.on)', '.ball-icons .ball-chip:not(.on)'],
  ['球图标选中', '.ball-icons .ball-chip.on', '.ball-icons .ball-chip.on']
]

/** 逐个量圆角的元素。缺了就报 null，不编 */
const RADIUS_SELECTORS = ['.address-toggle', '.tab', '.fallback', '.count', '.float-key', '.ball']

const VAR_NAMES = [
  '--moyu-alpha',
  '--moyu-surface',
  '--moyu-surface-hover',
  '--moyu-surface-active',
  '--moyu-border',
  '--moyu-hairline',
  '--moyu-surface-rgb',
  '--moyu-surface-hover-rgb',
  '--moyu-surface-active-rgb',
  '--moyu-border-rgb',
  '--moyu-hairline-rgb',
  '--moyu-ink',
  '--moyu-text',
  '--moyu-text-dim',
  '--moyu-text-faint',
  '--moyu-accent',
  '--moyu-accent-hover',
  '--moyu-accent-soft',
  '--moyu-danger',
  '--moyu-sunken',
  '--moyu-sunken-hover',
  '--moyu-danger-soft',
  '--moyu-selected',
  '--moyu-on-fill',
  '--moyu-radius',
  '--moyu-radius-sm',
  '--moyu-radius-md',
  '--moyu-radius-pill',
  '--moyu-radius-tag',
  '--moyu-radius-track',
  '--moyu-font',
  '--moyu-panel',
  '--moyu-ground',
  '--radius',
  '--radius-sm',
  '--radius-pill'
]

/**
 * 在页面里读一圈事实。
 *
 * 全部返回原始事实，判定放在 Node 这侧：探针的价值一半在于报告，
 * 判定散在页面字符串里就没法连起来看了。
 */
const COLLECT = `(async () => {
  const root = getComputedStyle(document.documentElement)
  const names = ${JSON.stringify(VAR_NAMES)}
  const vars = {}
  for (const n of names) vars[n] = root.getPropertyValue(n).trim()

  /*
   * 颜色归一。
   *
   * 先问 CSS.supports，再交给引擎自己序列化——这样"变量没解析出来"（空串）
   * 与"值写坏了"（不是颜色）都会如实报成 null，而不是悄悄变成黑色。
   *
   * 读 ctx.fillStyle 的字符串而不是画一个像素再读回来：像素是 8 位**预乘**存的，
   * 低 alpha 的颜色在那里会掉精度——rgba(37, 99, 235, 0.1) 读回来成了
   * (39, 98, 235, 0.102)，看着像颜色变了，其实只是 0.1×255 存不进一个字节。
   * 万一哪一代引擎改用 color(srgb …) 序列化，再退回读像素。
   */
  const cv = document.createElement('canvas')
  cv.width = 1
  cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const toRgba = (value) => {
    if (!value || !CSS.supports('color', value)) return null
    ctx.fillStyle = '#000000'
    ctx.fillStyle = value
    const text = String(ctx.fillStyle)
    let m = /^#([0-9a-f]{6})$/i.exec(text)
    if (m) {
      const n = parseInt(m[1], 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
    }
    m = /^rgba?\\(([^)]+)\\)$/i.exec(text)
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number)
      return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 1000) / 1000 : 1]
    }
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], Math.round((d[3] / 255) * 1000) / 1000]
  }

  const colors = {}
  for (const n of names) colors[n] = toRgba(vars[n])

  const lum = ([r, g, b]) => {
    const f = (c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const contrast = (a, b) => {
    const la = lum(a)
    const lb = lum(b)
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }

  // 面用三通道那一份：它不带 alpha，是"这张面本身是什么颜色"，
  // 而 --moyu-surface 可能被 --moyu-alpha 乘淡过，拿它算对比度会随滑块浮动
  const rgbTriple = vars['--moyu-surface-rgb'].split(/\\s+/).map(Number)
  const face = rgbTriple.length === 3 && rgbTriple.every(Number.isFinite) ? rgbTriple : null
  const onFace = (name) => (face && colors[name] ? contrast(colors[name], face) : null)

  /*
   * 「这个元素底下实际是什么颜色」——自下而上把祖先的底色一层层叠起来。
   *
   * 量设置页必须这么量：那里好几张面是半透明的（选中按钮是 10% 的强调色），
   * 单独读它自己的 background-color 得到的是 rgba(37, 99, 235, 0.1)，
   * 拿这个算对比度等于在跟一张不存在的面比。叠到第一张实色为止，
   * 得到的才是眼睛看到的那一块。
   */
  const composite = (layers) => {
    let out = layers[0].slice(0, 3)
    let alpha = layers[0][3]
    for (let i = 1; i < layers.length; i += 1) {
      const c = layers[i]
      const next = c[3] + alpha * (1 - c[3])
      if (next <= 0) {
        out = c.slice(0, 3)
        alpha = 0
        continue
      }
      out = [0, 1, 2].map((k) => (c[k] * c[3] + out[k] * alpha * (1 - c[3])) / next)
      alpha = next
    }
    return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2]), Math.round(alpha * 1000) / 1000]
  }

  const backdropOf = (el) => {
    const chain = []
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const c = toRgba(getComputedStyle(node).backgroundColor)
      if (c && c[3] > 0) chain.push(c)
      if (c && c[3] > 0.999) break
    }
    // 一路走到根都没有实色（chrome 与面板正是这样，它们故意全透明）→ 算不出来
    if (!chain.length) return null
    return composite(chain.reverse())
  }

  const measureReadable = () => {
    const out = []
    for (const [name, fgSel, bgSel] of ${JSON.stringify(READABLE)}) {
      let fg = null
      let bg = null
      try {
        fg = document.querySelector(fgSel)
        bg = document.querySelector(bgSel)
      } catch (error) {
        fg = null
      }
      // 这一栏里没有这个东西是正常的：设置项分在五个分栏里
      if (!fg || !bg) {
        out.push([name, null])
        continue
      }
      const style = getComputedStyle(fg)
      const ink = toRgba(style.color)
      const back = backdropOf(bg)
      const opaque = back && back[3] > 0.99
      out.push([
        name,
        {
          ink,
          back,
          fontSize: parseFloat(style.fontSize),
          fontWeight: Number(style.fontWeight) || 400,
          ratio: ink && opaque ? contrast(ink.slice(0, 3), back.slice(0, 3)) : null
        }
      ])
    }
    return out
  }

  /*
   * 逐栏量。
   *
   * 设置项分在五个分栏里（通用 / 隐蔽 / 快捷键 / 数据 / 关于），一屏只画一栏。
   * 只量当前这一栏的话，另外四栏的毛病要等用户点过去才会被发现——而那正是
   * 这次改动的题目：换了主题，每一栏都得站得住。切栏只改一个 ref，不会写配置。
   *
   * 用定时器等一帧，不用 requestAnimationFrame：探针那个窗口是 show: false 的，
   * 从没露过面的页面拿不到 rAF 回调——await 一个永远不来的回调，整个探针就
   * 挂在那儿了（第一版正是这么挂死的）。微任务队列一空，DOM 就是新的了。
   */
  const frame = () => new Promise((r) => setTimeout(r, 0))
  const sections = []
  const nav = Array.from(document.querySelectorAll('.nav-item'))
  for (const item of nav) {
    item.click()
    await frame()
    sections.push([item.textContent.trim(), measureReadable()])
  }
  if (nav.length) {
    nav[0].click()
    await frame()
  }

  const bg = {}
  for (const sel of ${JSON.stringify([...TRANSPARENT, '.topbar', '.rail', 'html', '.layout', '.content', '.sidebar', '.nav-item.active', '.card', '.panel', '.start', '.brand'])}) {
    let el = null
    try {
      el = document.querySelector(sel)
    } catch (error) {
      el = null
    }
    bg[sel] = getComputedStyle(el ?? document.documentElement).backgroundColor
  }

  /*
   * body::after 是终端世界那层扫描线与暗角。它是铺满视口的覆盖层，
   * 只许出现在起始页——因此这里把它的几何原样报出来，让 Node 那侧判定
   * "有没有铺满整个视口"。
   */
  const after = getComputedStyle(document.body, '::after')

  const radius = {}
  for (const sel of ${JSON.stringify(RADIUS_SELECTORS)}) {
    const el = document.querySelector(sel)
    radius[sel] = el ? getComputedStyle(el).borderTopLeftRadius : null
  }

  return {
    theme: document.documentElement.dataset.theme ?? null,
    world: document.documentElement.dataset.world ?? null,
    vars,
    colors,
    face,
    contrast: {
      ink: onFace('--moyu-ink'),
      text: onFace('--moyu-text'),
      'text-dim': onFace('--moyu-text-dim'),
      'text-faint': onFace('--moyu-text-faint'),
      accent: onFace('--moyu-accent')
    },
    bg,
    radius,
    sections,
    body: {
      background: getComputedStyle(document.body).backgroundColor,
      textShadow: getComputedStyle(document.body).textShadow,
      fontFamily: getComputedStyle(document.body).fontFamily
    },
    after: {
      content: after.content,
      position: after.position,
      width: after.width,
      height: after.height,
      top: after.top,
      left: after.left,
      pointerEvents: after.pointerEvents
    },
    viewport: [window.innerWidth, window.innerHeight]
  }
})()`

/**
 * 挂上提示条之后单独读一圈。
 *
 * 比上面那份 COLLECT 窄得多，因为它要问的东西就三样：这一行画在哪儿、
 * 颜色从哪儿来、它下面那块留白还是不是空的。整份 COLLECT 里那些分栏、
 * 可读性、圆角表都不必再量一遍——同一份文档、同一套主题，上面已经量过。
 */
const COLLECT_NOTICE = `(() => {
  const root = getComputedStyle(document.documentElement)
  const cv = document.createElement('canvas')
  cv.width = 1
  cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const toRgba = (value) => {
    if (!value || !CSS.supports('color', value)) return null
    ctx.fillStyle = '#000000'
    ctx.fillStyle = value
    const text = String(ctx.fillStyle)
    let m = /^#([0-9a-f]{6})$/i.exec(text)
    if (m) {
      const n = parseInt(m[1], 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
    }
    m = /^rgba?\\(([^)]+)\\)$/i.exec(text)
    if (m) {
      const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number)
      return [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 1000) / 1000 : 1]
    }
    return null
  }
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const look = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      text: (el.textContent ?? '').trim(),
      color: toRgba(s.color),
      background: toRgba(s.backgroundColor),
      borderBottom: toRgba(s.borderBottomColor),
      borderBottomWidth: s.borderBottomWidth,
      radius: s.borderTopLeftRadius,
      fontSize: parseFloat(s.fontSize),
      box: box(el)
    }
  }
  const spacer = document.querySelector('.spacer')
  /*
   * 版面变量写在 .root 上，不在 :root 上——ChromeApp 的 geometryVars 是一份
   * :style。从 documentElement 读回来是空串，而空串最容易被读成「变量没了」。
   */
  const chromeRoot = document.querySelector('.root')
  return {
    theme: document.documentElement.dataset.theme ?? null,
    world: document.documentElement.dataset.world ?? null,
    /* 主进程下发的高度（geometryVars 里的 --moyu-notice-h），与常量是同一个数 */
    noticeVar: chromeRoot
      ? getComputedStyle(chromeRoot).getPropertyValue('--moyu-notice-h').trim()
      : '',
    tokens: {
      surface: toRgba(root.getPropertyValue('--moyu-surface').trim()),
      surfaceHover: toRgba(root.getPropertyValue('--moyu-surface-hover').trim()),
      hairline: toRgba(root.getPropertyValue('--moyu-hairline').trim()),
      ink: toRgba(root.getPropertyValue('--moyu-ink').trim()),
      textDim: toRgba(root.getPropertyValue('--moyu-text-dim').trim()),
      accent: toRgba(root.getPropertyValue('--moyu-accent').trim()),
      accentSoft: toRgba(root.getPropertyValue('--moyu-accent-soft').trim()),
      radiusSm: root.getPropertyValue('--moyu-radius-sm').trim()
    },
    row: look('.notice-row'),
    text: look('.notice-text'),
    primary: look('.notice-btn.primary'),
    icon: look('.notice-btn.icon'),
    progress: look('.notice-progress'),
    topbar: document.querySelector('.topbar') ? box(document.querySelector('.topbar')) : null,
    rail: document.querySelector('.rail') ? box(document.querySelector('.rail')) : null,
    /* 底色报原始字符串：判「是不是逐像素透明」要比的是 rgba(0, 0, 0, 0) 这个原话 */
    spacer: spacer ? { ...box(spacer), background: getComputedStyle(spacer).backgroundColor } : null,
    viewport: [window.innerWidth, window.innerHeight]
  }
})()`

/**
 * 「停在自家那一屏上」那一态，在界面那一侧量一圈。
 *
 * 起始页与系统设置不是标签页：它们不进标签条，各有各的入口键（顶栏最左并排的
 * 那两颗），停在其中一屏上时**没有哪一格是高亮的**。正文区那块原生
 * 视图在预览里不存在，因此这一问能问的只有界面这一圈，而它恰好是这一版
 * 改动最要紧的那一圈：
 *
 * - 标签条没有因为多了这一屏而多出一格（格子数 == 网页标签数）；
 * - 没有哪一格是高亮的（对照 --click-screen：点进去之前是有一格亮的）；
 * - 两颗入口键里该亮的那一颗真的亮了，另一颗没亮；
 * - 地址栏开关上写的是这一屏的名字，不是某一页的域名，也不是一句「新标签页」。
 *
 * 少任何一条，就分不清「进去了」与「什么也没发生」。
 */
const COLLECT_SCREEN = `(async () => {
  const lit = (sel) => {
    const el = document.querySelector(sel)
    return el ? el.classList.contains('on') : null
  }
  const tabs = await window.moyu.tabs.list()
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null
  return {
    screen: tabs.screen,
    activeTabId: tabs.activeTabId,
    网页标签数: tabs.tabs.length,
    格子数: document.querySelectorAll('.zone .tab').length,
    高亮的格数: document.querySelectorAll('.zone .tab.on').length,
    /* 两颗入口键各自那份 title 是活的（'系统设置' / '回到刚才那张网页'），按 aria-label 定位 */
    起始页键亮着: lit('.topbar button[aria-label="起始页"]'),
    设置键亮着: lit('.topbar button[aria-label="系统设置"]'),
    地址栏开关: text('.topbar .address-toggle .ellipsis'),
    下拉按钮: text('.zone .fallback .title')
  }
})()`

// ---------------------------------------------------------------- 判定

const results = []
const fail = (id, text) => results.push({ id, ok: false, text })
const pass = (id, text) => results.push({ id, ok: true, text })

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const show = (c) => (c ? `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}@${c[3]}` : 'null')
/**
 * 计算值的 0 写成 0px，而自定义属性里写的 0 就是 0。
 *
 * 同一个「直角」有两种写法，比之前得先把它们并成一种——否则磷绿主题下
 * 「令牌声明了 0、元素也真的是 0px」会被判成不一致（Q8 遇到过同一件事，
 * 那里用的是正则）。
 */
const zeroish = (v) => (v === '0' ? '0px' : v)
/** 上两张表写成 `'#rrggbb', alpha` 更好读，比的时候换成与页面一致的四通道 */
const expectRgba = ([hex, alpha]) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

function checkZeroRegression(paper) {
  const bad = []
  for (const [name, want] of Object.entries({ ...PAPER_EXPECT, ...PAPER_SHAPE })) {
    if (typeof want === 'string') {
      if (paper.vars[name] !== want) bad.push(`${name} 要 ${want} 实为 ${paper.vars[name] || '(空)'}`)
      continue
    }
    const got = paper.colors[name]
    if (!same(got, expectRgba(want))) bad.push(`${name} 要 ${show(expectRgba(want))} 实为 ${show(got)}`)
  }
  if (!paper.vars['--moyu-font'].includes('Microsoft YaHei')) {
    bad.push(`--moyu-font 该是无衬线栈，实为 ${paper.vars['--moyu-font'] || '(空)'}`)
  }
  if (paper.vars['--moyu-font'].includes('Cascadia Mono')) {
    bad.push('--moyu-font 在纸白下不该是等宽')
  }
  if (bad.length) fail('Q1', `默认零回归：纸白下界面那几条 --moyu-* 与改动前不一致 —— ${bad.join('；')}`)
  else pass('Q1', `默认零回归：纸白下 ${Object.keys(PAPER_EXPECT).length + Object.keys(PAPER_SHAPE).length} 条 --moyu-* 与改动前逐条相同`)
}

/** 一套主题的"指纹"：配色变了它就变，用来问"三套互不相同" */
const fingerprint = (page) =>
  ['--moyu-surface-rgb', '--moyu-hairline-rgb', '--moyu-ink', '--moyu-accent', '--moyu-ground']
    .map((n) => page.vars[n])
    .join('|')

function checkDistinct(byPage) {
  const bad = []
  for (const page of ['chrome', 'popover', 'settings', 'home']) {
    const prints = THEMES.map((t) => fingerprint(byPage[page][t.id]))
    if (new Set(prints).size !== THEMES.length) {
      bad.push(`${page} 的三套主题有重样的：${JSON.stringify(prints)}`)
    }
    // 主题名与形态都要落到这一份文档的根上，否则"改了没反应"就从这里冒出来
    for (const t of THEMES) {
      const got = byPage[page][t.id]
      if (got.theme !== t.id) bad.push(`${page}/${t.id} 的 data-theme 是 ${got.theme}`)
      if (got.world !== t.world) bad.push(`${page}/${t.id} 的 data-world 是 ${got.world}，该是 ${t.world}`)
    }
  }
  if (bad.length) fail('Q2', `四份文档各自的主题与形态 —— ${bad.join('；')}`)
  else pass('Q2', '四份文档（界面 / 面板 / 设置 / 起始页）都拿到了当前主题，且三套调色板两两不同')
}

function checkTerminalShape(crt) {
  const bad = []
  for (const n of [
    '--moyu-radius',
    '--moyu-radius-sm',
    '--moyu-radius-md',
    '--moyu-radius-pill',
    '--moyu-radius-tag',
    '--moyu-radius-track',
    '--radius',
    '--radius-sm',
    '--radius-pill'
  ]) {
    // 计算值一律是 px，0 会写成 0px
    if (!/^0(px)?$/.test(crt.vars[n])) bad.push(`${n} 该是 0，实为 ${crt.vars[n] || '(空)'}`)
  }
  if (!crt.vars['--moyu-font'].includes('Cascadia Mono')) {
    bad.push(`--moyu-font 该是等宽栈，实为 ${crt.vars['--moyu-font'] || '(空)'}`)
  }
  if (!crt.body.textShadow || crt.body.textShadow === 'none') {
    bad.push('字没有发光：body 的 text-shadow 是 none')
  }
  if (bad.length) fail('Q3', `终端形态没有跟着进界面 —— ${bad.join('；')}`)
  else pass('Q3', `终端形态跟进了界面：半径全 0、字体等宽（${crt.vars['--moyu-font'].split(',')[0]}）、字带发光`)
}

/**
 * 直角验到元素上。
 *
 * 两头都要：纸白下必须与改前的字面量一致（把写死的圆角换成令牌时最容易
 * 顺手改掉它），磷绿下必须真的是 0（令牌声明了但元素没用上，正是这一步会漏的）。
 */
function checkRadius(paper, crt) {
  const bad = []
  for (const [sel, want] of Object.entries(PAPER_RADIUS)) {
    const got = paper.radius[sel]
    if (got === null) bad.push(`纸白下找不到 ${sel}，量不到圆角`)
    else if (got !== want) bad.push(`纸白下 ${sel} 的圆角是 ${got}，改前是 ${want}`)
  }
  for (const sel of Object.keys(PAPER_RADIUS)) {
    const got = crt.radius[sel]
    if (got !== null && !/^0(px)?$/.test(got)) bad.push(`磷绿下 ${sel} 的圆角仍是 ${got}`)
  }
  if (bad.length) fail('Q8', `圆角没跟着形态走 —— ${bad.join('；')}`)
  else pass('Q8', `圆角两头顶住了：纸白下 ${Object.entries(PAPER_RADIUS).map(([s, v]) => `${s} ${v}`).join(' / ')} 与改前一致，磷绿下同一批元素是 0px`)
}

function checkAlpha(alpha) {
  const bad = []
  if (alpha.vars['--moyu-alpha'] !== '0.4') bad.push(`--moyu-alpha 是 ${alpha.vars['--moyu-alpha'] || '(空)'}，该是 0.4`)
  const surface = alpha.colors['--moyu-surface']
  if (!surface) bad.push('--moyu-surface 读不成颜色（多半是 var() 没接上）')
  else {
    if (surface[3] !== 0.4) bad.push(`--moyu-surface 的 alpha 是 ${surface[3]}，该是 0.4`)
    if (surface.slice(0, 3).join() !== '255,255,255') bad.push(`--moyu-surface 的色相被改动了：${show(surface)}`)
  }
  // 强调色是"状态"，不跟着底板变淡
  if (alpha.colors['--moyu-accent'] && alpha.colors['--moyu-accent'][3] !== 1) {
    bad.push(`--moyu-accent 也跟着淡了：${show(alpha.colors['--moyu-accent'])}`)
  }
  if (bad.length) fail('Q4', `背景透明度没接上 —— ${bad.join('；')}`)
  else pass('Q4', '背景透明度仍然只淡底板：0.4 时 --moyu-surface 是 rgb(255 255 255 / 0.4)，强调色不动')
}

function checkTransparent(byTheme) {
  const bad = []
  for (const t of THEMES) {
    const page = byTheme[t.id]
    for (const sel of TRANSPARENT) {
      const got = page.bg[sel]
      if (got !== 'rgba(0, 0, 0, 0)') bad.push(`${t.id} 的 ${sel} 画了底色 ${got}`)
    }
    // 终端那层覆盖层只许留在起始页
    const after = page.after
    const fills =
      after.content !== 'none' &&
      after.content !== 'normal' &&
      after.position === 'fixed' &&
      after.width === `${page.viewport[0]}px` &&
      after.height === `${page.viewport[1]}px`
    if (fills) {
      bad.push(`${t.id} 的 body::after 是一层铺满视口的覆盖层（${after.width}×${after.height}），它会把桌面盖住`)
    }
  }
  if (bad.length) fail('Q5', `透明中部被弄坏了 —— ${bad.join('；')}`)
  else pass('Q5', `三套主题下 chrome 的 ${TRANSPARENT.join(' / ')} 一律逐像素透明，且没有铺满视口的 body::after`)
}

function checkContrast(byTheme) {
  const bad = []
  const lines = []
  for (const t of THEMES) {
    const c = byTheme[t.id].contrast
    lines.push(`${t.id}: ${Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' / ')}`)
    for (const [name, value] of Object.entries(c)) {
      if (value === null) bad.push(`${t.id} 的 ${name} 算不出对比度（颜色没解析出来）`)
      else if (value < 4.5) bad.push(`${t.id} 的 ${name} 只有 ${value}:1，低于 4.5:1`)
    }
  }
  if (bad.length) fail('Q6', `对比度不达标 —— ${bad.join('；')}`)
  else pass('Q6', `三套主题的字与强调色对底板都 ≥ 4.5:1（${lines.join('；')}）`)
}

/**
 * 设置页在深色主题下的可读性。
 *
 * 这一条查的是**元素上量得到的结果**，不是变量里写了什么：主题层把变量接过来了，
 * 元素忘了用它，两边的报告都会是绿的。左栏那块板子尤其典型——它过去写死成
 * #eef0f3，字跟着主题变成浅色之后，「浅底浅字」在纸白下看不出任何异常。
 *
 * 阈值按字号分档（WCAG 的大字 3:1），免得把一个 15px 的粗标题判成不合格。
 */
function checkReadable(byTheme) {
  const bad = []
  const lines = []
  for (const t of THEMES) {
    const sections = byTheme.settings[t.id].sections
    if (!sections.length) {
      bad.push(`${t.id} 的设置页量不出分栏（.nav-item 一个都没有）`)
      continue
    }
    let worst = null
    for (const [section, pairs] of sections) {
      for (const [name, got] of pairs) {
        if (!got) continue
        const large = got.fontSize >= 18.66 || (got.fontSize >= 14 && got.fontWeight >= 700)
        const need = large ? 3 : 4.5
        if (got.ratio === null) {
          bad.push(`${t.id} 的「${section} / ${name}」算不出对比度：底色不是实色（${show(got.back)}）`)
          continue
        }
        if (got.ratio < need) {
          bad.push(
            `${t.id} 的「${section} / ${name}」只有 ${got.ratio}:1（要 ≥ ${need}）：字 ${show(got.ink)} 底 ${show(got.back)}`
          )
        }
        if (!worst || got.ratio < worst.ratio) worst = { name: `${section}/${name}`, ratio: got.ratio }
      }
    }
    if (worst) lines.push(`${t.id}: ${worst.name} ${worst.ratio}`)
  }
  if (bad.length) fail('Q9', `设置页有字读不出来 —— ${bad.slice(0, 6).join('；')}${bad.length > 6 ? `（另 ${bad.length - 6} 处）` : ''}`)
  else pass('Q9', `设置页五个分栏的字都压得住自己的底（最紧的一处 ${lines.join('；')}）`)
}

/**
 * 提示条画出来了没有，以及它有没有把中部染上色。
 *
 * 「画出来了」在这里有几层意思：DOM 在（`.notice-row` 取得到）、尺寸对（正好
 * NOTICE_H 高、正好占正文那一栏宽）、位置对（顶栏之下）、**中部还在它下面**
 * （`.spacer` 的高度与起点都分毫不差），而且那中部仍然是逐像素透明的。
 * 最后一条才是这一组存在的理由：提示条是这一层里唯一一块**实底**，
 * 它的底色只要顺着 flex 落到 `.main-col` 上，桌面上就多蒙了一块——那在截图里
 * 看着只是「背景色有点不对」。
 */
function checkNoticeDrawn(withNotice) {
  const bad = []
  const lines = []
  for (const t of THEMES) {
    const page = withNotice[t.id]
    const row = page.row
    if (!row) {
      bad.push(`${t.id} 下没有 .notice-row`)
      continue
    }
    const bodyW = page.viewport[0] - (page.rail?.w ?? 0)
    if (page.noticeVar !== `${NOTICE_H}px`) {
      bad.push(`${t.id} 的 --moyu-notice-h 是 ${page.noticeVar || '(空)'}，该是 ${NOTICE_H}px`)
    }
    if (row.box.h !== NOTICE_H) bad.push(`${t.id} 的提示条高 ${row.box.h}px，该是 ${NOTICE_H}px`)
    if (row.box.w !== bodyW) bad.push(`${t.id} 的提示条宽 ${row.box.w}px，正文那一栏该是 ${bodyW}px`)
    if (page.topbar && row.box.y !== page.topbar.h) {
      bad.push(`${t.id} 的提示条顶在 y=${row.box.y}，顶栏下沿是 ${page.topbar.h}`)
    }
    if (!page.spacer) bad.push(`${t.id} 下没有 .spacer（中部那块留白）`)
    else {
      if (page.spacer.background !== 'rgba(0, 0, 0, 0)') {
        bad.push(`${t.id} 的中部被染上了底色 ${page.spacer.background}`)
      }
      if (page.spacer.y !== row.box.y + row.box.h) {
        bad.push(`${t.id} 的中部从 y=${page.spacer.y} 起，提示条下沿是 ${row.box.y + row.box.h}`)
      }
      if (page.spacer.h <= 0) bad.push(`${t.id} 的中部没有高度（${page.spacer.h}）`)
    }
    if (page.progress) bad.push(`${t.id} 在 available 态下也画了进度线`)
    if (!page.text || !page.text.text.includes('1.1.0')) {
      bad.push(`${t.id} 的提示条没写出新版本号：${JSON.stringify(page.text?.text ?? null)}`)
    }
    lines.push(`${t.id} ${row.box.w}×${row.box.h}`)
  }
  if (bad.length) fail('Q10', `更新提示条没站住 —— ${bad.join('；')}`)
  else pass('Q10', `三套主题下提示条都画在自己那一行上（${lines.join(' / ')}），紧贴顶栏下沿、中部仍逐像素透明`)
}

/**
 * 这一行的颜色从哪儿来。
 *
 * 逐条与当前主题的令牌比，而不是比「三套互不相同」——写死一个 #ffffff 的底色，
 * 在纸白下与令牌恰好相等（所以「与令牌一致」这一条在纸白下不算数），
 * 但在夜与磷绿下会当场露出来。两条一起比才完整：与令牌一致，保证它是**从主题
 * 拿的**；三套互不相同，保证那个令牌本身**确实换了**。
 */
function checkNoticeTokens(withNotice) {
  const bad = []
  const lines = []
  const paints = []
  for (const t of THEMES) {
    const page = withNotice[t.id]
    const row = page.row
    if (!row) {
      bad.push(`${t.id} 下没有提示条`)
      continue
    }
    const pairs = [
      ['底色', row.background, page.tokens.surface],
      ['文字色', page.text?.color ?? null, page.tokens.textDim],
      ['主按钮字色', page.primary?.color ?? null, page.tokens.accent],
      ['主按钮底色', page.primary?.background ?? null, page.tokens.accentSoft],
      ['关闭键字色', page.icon?.color ?? null, page.tokens.textDim]
    ]
    for (const [name, got, token] of pairs) {
      if (!got || !token) {
        bad.push(`${t.id} 的${name}没量成颜色（实为 ${show(got)}，令牌 ${show(token)}）`)
        continue
      }
      if (!same(got, token)) bad.push(`${t.id} 的${name}是 ${show(got)}，该取令牌 ${show(token)}`)
    }
    if (row.borderBottomWidth !== '1px') bad.push(`${t.id} 的下沿不是 1px（${row.borderBottomWidth}）`)
    else if (!same(row.borderBottom, page.tokens.hairline)) {
      bad.push(`${t.id} 的下沿是 ${show(row.borderBottom)}，该取令牌 ${show(page.tokens.hairline)}`)
    }
    if (page.primary && zeroish(page.primary.radius) !== zeroish(page.tokens.radiusSm)) {
      bad.push(`${t.id} 的主按钮圆角是 ${page.primary.radius}，该取令牌 ${page.tokens.radiusSm}`)
    }
    paints.push(show(row.background))
    lines.push(
      `${t.id} 底 ${show(row.background)} 字 ${show(page.text?.color ?? null)} 主按钮 ${show(page.primary?.background ?? null)}/${show(page.primary?.color ?? null)} 圆角 ${page.primary?.radius ?? '—'}`
    )
  }
  if (paints.length === THEMES.length && new Set(paints).size !== THEMES.length) {
    bad.push(`三套主题画出来的底色有重样的：${JSON.stringify(paints)}`)
  }
  if (bad.length) fail('Q11', `提示条的颜色没跟着主题走 —— ${bad.join('；')}`)
  else pass('Q11', `提示条的底 / 字 / 强调色 / 圆角逐条取自当前主题的令牌，且三套画出来互不相同（${lines.join('；')}）`)
}

/**
 * 下载态那条进度线。
 *
 * 它必须画在**已经算进版面**的那 30px 里：这个条的高度是主进程按 NOTICE_H 排给
 * 网页的，进度线只要多占一个像素，网页就被压住一条——而它在截图上看着完全正常。
 * 因此这里同时量宽度（是不是真有 42%）与「行高有没有变」。
 */
function checkNoticeProgress(withNotice) {
  const bad = []
  const page = withNotice.downloading
  const bar = page.progress
  const row = page.row
  if (!row) bad.push('downloading 态下没有提示条')
  else if (!bar) bad.push('downloading 态下没有 .notice-progress')
  else {
    const want = Math.round((42 / 100) * row.box.w)
    if (Math.abs(bar.box.w - want) > 1) bad.push(`进度线宽 ${bar.box.w}px，42% 该是 ${want}px`)
    if (bar.box.h !== 2) bad.push(`进度线高 ${bar.box.h}px，该是 2px`)
    if (bar.box.y + bar.box.h > row.box.y + row.box.h) bad.push('进度线掉出了提示条')
    if (row.box.h !== NOTICE_H) bad.push(`有进度线时提示条高 ${row.box.h}px，该仍是 ${NOTICE_H}px`)
    if (!same(bar.background, page.tokens.accent)) {
      bad.push(`进度线是 ${show(bar.background)}，该取令牌 ${show(page.tokens.accent)}`)
    }
    if (!page.text || !page.text.text.includes('42%')) {
      bad.push(`文案里没写出进度：${JSON.stringify(page.text?.text ?? null)}`)
    }
    if (page.primary) bad.push('下载中不该给主按钮')
    if (page.icon) bad.push('下载中不该给关闭键')
  }
  if (bad.length) fail('Q12', `下载态那条进度线不成立 —— ${bad.join('；')}`)
  else pass('Q12', `下载态下进度线画在 ${show(bar?.background)} 上、宽 ${bar?.box.w}px（42%），行高仍是 ${NOTICE_H}px，且不给按钮`)
}

/**
 * 停在自家那一屏上时，界面这一圈对不对。
 *
 * 判据里那两条「格子数 == 网页标签数」与「没有哪一格高亮」是这一问的骨架：
 * 起始页与系统设置曾经是**普通标签页**，各占一格、各带一枚 ✕，点进设置之后
 * 想出来只能去点标签条上那一格。这一版把它们改成「屏」，这两条正是
 * 「不再混在标签里」在界面上唯一看得见的凭据。
 */
function checkScreens(home, settings) {
  const bad = []
  for (const [screen, page, want] of [
    ['home', home, stringConstant('HOME_TITLE')],
    ['settings', settings, stringConstant('SETTINGS_TITLE')]
  ]) {
    if (page.screen !== screen) bad.push(`${screen} 那一态下 tabs.list().screen 是 ${page.screen}`)
    if (page.activeTabId !== null) bad.push(`${screen} 那一态下 activeTabId 是 ${page.activeTabId}，该是 null`)
    if (page.格子数 !== page.网页标签数) {
      bad.push(`${screen} 那一态下标签条画了 ${page.格子数} 格，网页只有 ${page.网页标签数} 张`)
    }
    if (page.高亮的格数 !== 0) bad.push(`${screen} 那一态下还有 ${page.高亮的格数} 格是高亮的`)
    if (page.起始页键亮着 !== (screen === 'home')) {
      bad.push(`${screen} 那一态下「起始页」那颗键的亮灯是 ${page.起始页键亮着}`)
    }
    if (page.设置键亮着 !== (screen === 'settings')) {
      bad.push(`${screen} 那一态下「设置」那颗键的亮灯是 ${page.设置键亮着}`)
    }
    if (page.地址栏开关 !== want) {
      bad.push(`${screen} 那一态下地址栏开关上写的是 ${JSON.stringify(page.地址栏开关)}，该是 ${want}`)
    }
    // 让位成下拉按钮时按钮上写的是这一屏的名字（那一档下没有格子可高亮）
    if (page.下拉按钮 !== null && page.下拉按钮 !== want) {
      bad.push(`${screen} 那一态下下拉按钮上写的是 ${JSON.stringify(page.下拉按钮)}，该是 ${want}`)
    }
  }
  if (bad.length) fail('Q13', `停在自家那一屏上时界面没跟上 —— ${bad.join('；')}`)
  else {
    pass(
      'Q13',
      `停在起始页 / 系统设置上时（screen 各自对上、activeTabId 为 null）标签条一格不多、一格不亮，两颗入口键各亮各的，地址栏开关上写着那一屏的名字`
    )
  }
}

// ---------------------------------------------------------------- 跑
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    show: false,
    frame: false,
    backgroundColor: '#1b1f24',
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  /** 换一套入参再加载一份文档，等它把配置读回来并写上面属性 */
  const load = async (page, theme, bgAlpha = 1) => {
    opts.theme = theme
    opts.bgAlpha = bgAlpha
    opts.notice = null
    await win.loadFile(path.join(ROOT, 'out', 'renderer', PAGES[page]))
    await wait(1100)
    return win.webContents.executeJavaScript(COLLECT)
  }

  /**
   * 挂上新版本再加载一次界面，量提示条那一组。
   *
   * 与 load 分开而不是给它加个开关：这一组的入参（有新版本、下载到一半）
   * 与上面那些基准是两回事，混在一起量，上面那几条「平时的界面」就会
   * 在一个多出一行的版面上得出读数——那正是提示条上线时最容易漏掉的回归。
   */
  const loadNotice = async (theme, phase = 'available') => {
    opts.theme = theme
    opts.bgAlpha = 1
    opts.notice = '1.1.0'
    opts.noticePhase = phase
    opts.noticePercent = 42
    await win.loadFile(path.join(ROOT, 'out', 'renderer', PAGES.chrome))
    await wait(1100)
    return win.webContents.executeJavaScript(COLLECT_NOTICE)
  }

  const byPage = {}
  for (const page of Object.keys(PAGES)) {
    byPage[page] = {}
    for (const t of THEMES) byPage[page][t.id] = await load(page, t.id)
  }

  /**
   * 停在自家那一屏上那一态，界面各加载一次。
   *
   * 单独加载而不是并进上面那个循环：这是**另一种状态**（没有当前网页），
   * 与那十二问赖以成立的「正看着某张网页」是两回事，混在一起量，
   * 上面那几条基准就会在一个没有当前页的版面上得出读数。
   */
  const loadScreen = async (screen) => {
    opts.screen = screen
    await win.loadFile(path.join(ROOT, 'out', 'renderer', PAGES.chrome))
    await wait(1100)
    const got = await win.webContents.executeJavaScript(COLLECT_SCREEN)
    opts.screen = null
    return got
  }
  const screenHome = await loadScreen('home')
  const screenSettings = await loadScreen('settings')

  // 背景透明度那一档：只跑一次，用界面问
  const alphaProbe = await load('chrome', 'paper', 0.4)

  // 提示条那一组：三套主题各挂一次，再加一张下载到一半的
  const withNotice = {}
  for (const t of THEMES) withNotice[t.id] = await loadNotice(t.id)
  withNotice.downloading = await loadNotice('paper', 'downloading')

  checkZeroRegression(byPage.chrome.paper)
  checkDistinct(byPage)
  checkTerminalShape(byPage.chrome['crt-green'])
  checkRadius(byPage.chrome.paper, byPage.chrome['crt-green'])
  checkAlpha(alphaProbe)
  checkTransparent(byPage.chrome)
  checkContrast(byPage.chrome)
  checkReadable(byPage)
  checkNoticeDrawn(withNotice)
  checkNoticeTokens(withNotice)
  checkNoticeProgress(withNotice)
  checkScreens(screenHome, screenSettings)

  for (const r of results) console.log(`[${r.id}] ${r.ok ? 'OK  ' : 'FAIL'} ${r.text}`)

  // 圆角与字体逐主题列一份：直角这件事只有摆成表才看得出"到没到位"
  for (const t of THEMES) {
    const page = byPage.chrome[t.id]
    const cells = RADIUS_SELECTORS.map((s) => `${s} ${page.radius[s] ?? '—'}`).join('  ')
    console.log(`SHAPE ${t.id.padEnd(10)} ${cells}  字体 ${page.body.fontFamily.split(',')[0]}`)
  }

  // 界面上实际画了什么，值得单独看一眼：调色板变了不等于界面用了它
  const painted = {}
  for (const t of THEMES) {
    const page = byPage.chrome[t.id]
    painted[t.id] = {
      topbar: page.bg['.topbar'],
      rail: page.bg['.rail'],
      railFont: page.body.fontFamily,
      settingsGround: byPage.settings[t.id].bg['html'],
      homeGround: byPage.home[t.id].bg['html']
    }
  }
  for (const [id, row] of Object.entries(painted)) {
    console.log(
      `PAINT ${id.padEnd(10)} 顶栏 ${row.topbar} 右栏 ${row.rail} | 设置页底 ${row.settingsGround} | 起始页底 ${row.homeGround}`
    )
  }
  const paintedSame = THEMES.every((t) => painted[t.id].topbar === painted.paper.topbar)
  if (paintedSame) fail('Q7', '三套主题下顶栏画出来的颜色一模一样——变量有了，界面没用上')
  else pass('Q7', '三套主题下顶栏、右栏、设置页与起始页画出来的颜色确实各不相同')

  // 设置页面那几块面实际画成了什么。左栏过去写死一块浅灰，是这次的重点之一
  for (const t of THEMES) {
    const page = byPage.settings[t.id]
    console.log(
      `SETTINGS ${t.id.padEnd(10)} 左栏 ${page.bg['.sidebar']} 左栏当前项 ${page.bg['.nav-item.active']} 卡面 ${page.bg['.card']}`
    )
  }

  // 提示条实际画成了什么。变量有了不等于界面用了它，这一行值得单独看一眼
  for (const t of THEMES) {
    const page = withNotice[t.id]
    console.log(
      `NOTICE ${t.id.padEnd(10)} ${page.text?.text ?? '—'} | 底 ${page.row ? show(page.row.background) : '—'} 字 ${page.text ? show(page.text.color) : '—'} 中部 ${page.spacer?.background ?? '—'}`
    )
  }
  console.log(
    `NOTICE ${'downloading'.padEnd(10)} ${withNotice.downloading.text?.text ?? '—'} | 进度线 ${withNotice.downloading.progress ? `${withNotice.downloading.progress.box.w}×${withNotice.downloading.progress.box.h}` : '—'}`
  )

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过`)

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(
    path.join(OUT_DIR, 'theme-chrome.json'),
    JSON.stringify({ results, painted, byPage, alphaProbe, withNotice, screenHome, screenSettings }, null, 2)
  )
  console.log(`REPORT spike/out/theme-chrome.json`)

  win.destroy()
  app.exit(failed.length ? 1 : 0)
})

/*
 * 出错必须吵着退出。
 *
 * 页面里抛出来的异常是 executeJavaScript 的 reject，不接就是一个未处理的
 * Promise——主进程不会因此退出，窗口又是隐藏的，于是探针看上去只是「还在跑」。
 * 第一版就栽在这儿：一行忘写插值，整个探针无声无息挂了两分多钟。
 */
process.on('unhandledRejection', (error) => {
  console.error(`[FAIL] 探针自己出错了：${error?.stack ?? error}`)
  app.exit(1)
})
