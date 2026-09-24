/**
 * 无头预览：把编译好的界面在一个不显示的窗口里渲染出来，
 * 截一张图、再导出若干元素的实测几何，用来核对版面。
 *
 * 存在的理由是「改界面的过程中不该一遍遍弹窗打扰用户」：一个 show:false
 * 的窗口既不会出现在屏幕上，也不会抢焦点，而 paintWhenInitiallyHidden
 * 默认为真，所以它照样会把界面画出来给 capturePage 抓。
 *
 * 用法：
 *   npx electron spike/preview.js                 # 顶栏展开
 *   npx electron spike/preview.js --no-topbar     # 顶栏藏起来，球浮在右上角
 *   npx electron spike/preview.js --collapsed     # 已收起（只剩一颗球）
 *   npx electron spike/preview.js --maximized     # 已最大化：右上角那一小块（还原键 + 球）
 *   npx electron spike/preview.js --maximized --width 960 --height 540 --desktop  # 放大看它在桌面上的样子
 *   npx electron spike/preview.js --width 480 --height 270   # 迷你档多大，标签条就得让位
 *   npx electron spike/preview.js --tabs 3        # 只留前 3 个标签页：放得下那一态
 *   npx electron spike/preview.js --click-tab 0   # 点第 0 格标签，再截一张
 *   npx electron spike/preview.js --resize 1100x700   # 改窗口尺寸再截一张：让位与回归
 *   npx electron spike/preview.js --home          # 起始页
 *   npx electron spike/preview.js --home --themes # 起始页三套主题各截一张（走真实换主题那条路）
 *   npx electron spike/preview.js --home --theme crt-green --width 448 --height 297
 *   npx electron spike/preview.js --settings --width 560 --height 400
 *   npx electron spike/preview.js --bg 0.35        # 界面底板透明度：底板该淡，字不该淡
 *   npx electron spike/preview.js --drag-probe     # 逐个位置按一下，问「这里按下去起的是拖动还是缩放」
 *   npx electron spike/preview.js --popover --bg 0.35   # 弹出面板也是另一份文档，同样要问一遍
 *   npx electron spike/preview.js --popover --kind tabs # 面板有五张，换一张看
 *   npx electron spike/preview.js --desktop        # 界面背后垫一层模拟桌面：截图用
 *   npx electron spike/preview.js --collapsed --alpha --out spike/out/readme   # 带透明通道的球
 *   npx electron spike/preview.js --collapsed --ball-icon cat   # 球面上画哪个图标
 *   npx electron spike/preview.js --collapsed --width 160 --height 160 --ball-zoom 4
 *   npx electron spike/preview.js --collapsed --ball-image a.png --ball-fit glyph
 * 产物写在 spike/out/ 下：preview-<名字>.png 与 preview-<名字>.json
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const args = process.argv
const has = (flag) => args.includes(flag)
/** --width 800 形式的取值 */
const num = (flag, fallback) => {
  const i = args.indexOf(flag)
  const value = i >= 0 ? Number(args[i + 1]) : NaN
  return Number.isFinite(value) ? value : fallback
}

const MODES = { '--no-topbar': 'no-topbar', '--collapsed': 'collapsed' }
const modeFlag = Object.keys(MODES).find(has)
const mode = modeFlag ? MODES[modeFlag] : 'default'

/**
 * --maximized：已最大化（铺满工作区）。
 *
 * 与 mode 正交——最大化时也可以收起成球，因此它单独一个开关，
 * 而不是并进 MODES 里去。
 */
const MAXIMIZED = has('--maximized')

const page = has('--home')
  ? 'home'
  : has('--settings')
    ? 'settings'
    : has('--popover')
      ? 'popover'
      : 'chrome'
const PAGE_FILE = {
  chrome: 'index.html',
  home: 'home.html',
  settings: 'settings.html',
  popover: 'popover.html'
}

/*
 * --maximized 时默认就按那一小块的尺寸开窗口（80×48，与主进程的 floatBox 同源）。
 *
 * 这一档是必需的，不是排版偏好：chrome 层在真实程序里最大化时**只剩这么一块**
 * （见 WindowController.chromeBounds），拿 960×540 去渲染它，量到的坐标就不是
 * 真机上的坐标了——「还原键与球各自落在哪几像素」正是这一档唯一要问的事。
 *
 * 想看图就自己给 --width / --height（配 --desktop 垫一层桌面），
 * 那时量的数字不再代表真机，只有截图能看。
 */
const WIDTH = num('--width', MAXIMIZED ? 80 : 960)
const HEIGHT = num('--height', MAXIMIZED ? 48 : 540)
/** 只留前 N 个标签页。标签条放不放得下是算出来的，得能用少几张试出「放得下」那一态 */
const TABS = num('--tabs', 0)
/**
 * --bg 0.35：把界面底板透明度设成这个值。
 *
 * 这一项要验的是「底板淡、字不淡」这一对关系，光看截图说不清到底是哪一层淡了，
 * 因此 MEASURE 里除了截图还回报顶栏的实测底色与图标的实测字色。
 */
const BG = Math.min(1, Math.max(0, num('--bg', 1)))
/**
 * --resize 1100x700：截完第一张之后把窗口改到这么大，再截一张。
 *
 * 标签条的让位是靠 ResizeObserver 重新量出来的，这条路只有真改窗口尺寸才走得到。
 */
const resize = (() => {
  const i = args.indexOf('--resize')
  if (i < 0) return null
  const m = /^(\d+)x(\d+)$/.exec(args[i + 1] ?? '')
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
})()
/** 主题id由起始页自己给出（见下面的 THEME_IDS），这里只需要一个能看得清的默认值 */
const theme = (() => {
  const i = args.indexOf('--theme')
  return i >= 0 ? args[i + 1] : 'paper'
})()

/**
 * --out spike/out/readme：换个输出目录。
 *
 * README 的截图走的就是这条：生成的图要进仓库，而 spike/out 是 gitignore 的，
 * 因此得能把原图写到别处去，再另行合成。
 */
const OUT = (() => {
  const i = args.indexOf('--out')
  return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : path.join(__dirname, 'out')
})()

/**
 * --desktop [light|dark|<css 颜色>]：在界面**背后**垫一层模拟桌面。
 *
 * 窗口是逐像素透明的，界面自己只画顶栏、右栏这些底板，其余部分是空的——
 * 平时那些位置透出来的是真实桌面，而在不显示的窗口里截图时，透出来的是
 * 窗口自己的 backgroundColor（一块深灰）。截图要给人看「它浮在桌面上是什么样」，
 * 就得把那层桌面**画进这份文档**（写在 html 上，界面自己的底板盖在它上面）。
 *
 * 垫进来的桌面是假的，但它只影响截图，不影响界面自己的任何判断：
 * 因此这个开关默认关着，验证版面时不要开。
 */
const DESKTOP_PRESETS = {
  light: 'radial-gradient(130% 100% at 18% 0%, #fbfcfd 0%, #eef1f5 45%, #dde2e8 100%)',
  dark: 'radial-gradient(130% 100% at 18% 0%, #232a31 0%, #161a1f 45%, #0a0d10 100%)'
}
const DESKTOP = (() => {
  const i = args.indexOf('--desktop')
  if (i < 0) return null
  const next = args[i + 1]
  const value = next && !next.startsWith('--') ? next : 'light'
  return DESKTOP_PRESETS[value] ?? value
})()

/**
 * --alpha：把窗口做成真正透明的，于是 capturePage 抓到的图**带透明通道**。
 *
 * 悬浮球那类产物需要这个：球是圆的，四周必须是透明的，才能贴到别的底上合成。
 * 不透明窗口抓出来的图，四周会被窗口自己的 backgroundColor 填满。
 */
const ALPHA = has('--alpha')

/** 面板有五种，默认看「站点」那一张；--kind uaZoom 能换一张看 */
const KIND = (() => {
  const i = args.indexOf('--kind')
  return i >= 0 && args[i + 1] ? args[i + 1] : 'sites'
})()

/**
 * --ball-image <路径>：把这张本地图当作「用户上传过的那张自定义图标」。
 *
 * 自定义图标是独立于配置的一份数据（userData/ball-icon.json），因此它也不能
 * 混进 --ball-icon 里当第九个内置图标看——两种落法（铺满球面 / 中央图案）
 * 要各自出一张图。
 */
const BALL_IMAGE = (() => {
  const i = args.indexOf('--ball-image')
  const next = i >= 0 ? args[i + 1] : null
  return next && !next.startsWith('--') ? path.resolve(next) : null
})()

/**
 * --ball-icon <id>：球面上画哪个图标（8 个内置之一，或 custom）。
 *
 * 没点名时：给了 --ball-image 就当作选中的是自定义那一张（这是最常见的用法），
 * 否则回到内置的默认值。--ball-icon custom 却**不给**图也是一档要看的：
 * 「选了自定义却没有图」必须退回内置图标，否则收起态的球会是一块空白——
 * 而那一刻球就是窗口的全部。
 */
const BALL_ICON = (() => {
  const i = args.indexOf('--ball-icon')
  const next = i >= 0 ? args[i + 1] : null
  if (next && !next.startsWith('--')) return next
  return BALL_IMAGE ? 'custom' : 'book'
})()

/** --ball-fit cover|glyph：自定义图标落进球里的方式，默认与配置默认值一致 */
const BALL_FIT = (() => {
  const i = args.indexOf('--ball-fit')
  const next = i >= 0 ? args[i + 1] : null
  return next === 'glyph' ? 'glyph' : 'cover'
})()

/**
 * --ball-zoom 4：把球面上的图形放大 4 倍再截图。
 *
 * 球上只有 18 像素画图标，八枚剪影长得成不成立，在 40×40 的截图里看不出来。
 * 放大只加一条 CSS：球的直径、窗口的尺寸、任何布局数字都不动，因此这张图
 * **不是真实比例**，它只回答一个问题——这几段路径本身立不立得住。
 * 图形放大后不会撑开窗口，所以窗口要自己给大一点：
 *   --collapsed --width 160 --height 160 --ball-zoom 4
 */
const BALL_ZOOM = Math.min(12, Math.max(1, num('--ball-zoom', 1)))

const outDir = OUT
const pagePath = path.join(__dirname, '..', 'out', 'renderer', PAGE_FILE[page])

/** 渲染进程上报的悬浮球矩形——「收起时窗口落到哪」全靠它 */
let reportedBallRect = null
ipcMain.on('preview:ballRect', (_event, rect) => {
  reportedBallRect = rect
})

/** 后缀 → MIME。与真实的那份校验一致：只认这四种，别的连球都进不去 */
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

/**
 * 把 --ball-image 那张图读成 data URI。
 *
 * 读文件这件事放在主进程这侧：preload 里的 console 落在渲染进程的调试台里，
 * 无头跑一遍是看不见的——路径写错时会静悄悄退化成「没有图」，
 * 而那正好也是另一档要看的形态，于是错的那一档与对的那一档长得一模一样。
 * 因此这里读不出来就**直接退出**，并把话说清楚。
 */
const BALL_IMAGE_DATA = (() => {
  if (!BALL_IMAGE) return null
  const mime = MIME_BY_EXT[path.extname(BALL_IMAGE).toLowerCase()]
  if (!mime) {
    console.error(`PREVIEW --ball-image 只认 png/jpeg/webp：${BALL_IMAGE}`)
    app.exit(1)
    return null
  }
  try {
    const bytes = fs.readFileSync(BALL_IMAGE)
    console.log(`BALL_IMAGE ${BALL_IMAGE} (${Math.round(bytes.length / 1024)} KB)`)
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch (error) {
    console.error(`PREVIEW --ball-image 读不了：${BALL_IMAGE}（${error.message}）`)
    app.exit(1)
    return null
  }
})()

ipcMain.on('preview:options', (event) => {
  event.returnValue = {
    mode,
    maximized: MAXIMIZED,
    theme,
    tabs: TABS,
    bgAlpha: BG,
    ballIcon: BALL_ICON,
    ballFit: BALL_FIT,
    ballImage: BALL_IMAGE_DATA
  }
})

/** 量一圈关键元素。数字比眼睛靠谱，而且能直接和主进程的版面常量对照 */
const MEASURE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height)
    }
  }
  const rightGroup = document.querySelector('.topbar .group:last-of-type')
  /*
   * 标签条这一块。要看的是三件事：
   * 放不下时有没有让位（fits / fallback 存在与否）、让位后的标签条是不是
   * 真的离开了流（不在流里才不会把「+」与窗口操作挤走）、
   * 显示时最后一格有没有被啃掉一条边（lastTab 右端 ≤ zone 右端）。
   */
  const zone = box('.zone')
  const lastTab = box('.zone .tab:last-of-type')
  const tabs = [...document.querySelectorAll('.zone .tab')]
  return {
    window: { w: window.innerWidth, h: window.innerHeight },
    topbar: box('.topbar'),
    rail: box('.rail'),
    ball: box('.ball'),
    /*
     * 最大化时右上角那一小块里的两样东西（见 ChromeApp 的 .float）。
     *
     * 这一组是这一态**唯一**还能点的东西，因此它的位置不能靠截图判断
     * （球是半透明的、键压在网页上，差几像素看不出来）：
     * 还原键在左、球在右，两者竖直居中，球的右边缘离界面层右沿正好
     * BALL_MARGIN（4）——与「顶栏藏起来时球浮在右上角」是同一个落点，
     * 两态之间切换球不该跳。数字在这里，判据在窗口宽度上（80）。
     */
    floatBox: box('.float'),
    floatKey: box('.float-key'),
    /*
     * 球面上画的是什么。
     *
     * 「内置的某一枚」与「用户上传的那张」是两条完全不同的渲染路径
     * （一段 svg 路径 vs 一张图），截图看得出来，但「选了自定义却没有图」
     * 该退回内置、以及两种落法各自的实测尺寸，都要实测数字才说得清。
     * 内置那一枚还报第一段路径的开头几个字符：八个 id 各是一条不同的路径，
     * 拿它跟 BallGlyph 的表对一下，就知道传进来的 id 有没有真的生效。
     */
    ballGlyph: (() => {
      const el = document.querySelector('.ball')
      if (!el) return null
      const sizeOf = (node) => {
        const r = node.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }
      const img = el.querySelector('img.custom')
      if (img) {
        return {
          kind: 'custom',
          fit: img.classList.contains('cover')
            ? 'cover'
            : img.classList.contains('glyph')
              ? 'glyph'
              : null,
          // 只报开头：整条 data URI 有几千字符，写进 JSON 没意义
          src: String(img.getAttribute('src') ?? '').slice(0, 24),
          box: sizeOf(img)
        }
      }
      const svg = el.querySelector('svg')
      if (!svg) return null
      return {
        kind: 'builtin',
        paths: svg.querySelectorAll('path').length,
        d0: (svg.querySelector('path')?.getAttribute('d') ?? '').slice(0, 20),
        box: sizeOf(svg)
      }
    })(),
    zone,
    stripFits: document.querySelector('.strip')?.dataset.fits ?? null,
    /*
     * 缩放手柄的实测几何。它们**没有背景色**，截图上看不见，因此「画在哪、多大」
     * 只能这么问；而这几像素的位置正是「有没有抢走控件的点击」的全部依据。
     * 尺寸应当与 @shared/constants 的 RESIZE_EDGE / RESIZE_CORNER 一致（各 4 / 8）。
     */
    resizeHandles: [...document.querySelectorAll('[data-resize-handle]')].map((el) => {
      const r = el.getBoundingClientRect()
      return {
        edge: el.getAttribute('data-resize-handle'),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cursor: getComputedStyle(el).cursor
      }
    }),
    // 逐格实测：左端、宽度，以及里面的文字有没有被省略号截掉
    tabBoxes: tabs.map((el) => {
      const r = el.getBoundingClientRect()
      const title = el.querySelector('.title')
      return {
        x: Math.round(r.x),
        w: Math.round(r.width),
        on: el.classList.contains('on'),
        glyph: el.querySelector('img') ? 'img' : el.querySelector('svg') ? 'svg' : 'dot',
        titleClipped: title ? title.scrollWidth > title.clientWidth : null,
        /*
         * 用 checkVisibility 而不是 getComputedStyle(...).visibility：
         * 后者只看这一格自己的值，祖先被隐藏它照样报 visible。
         * 实测踩过：让位时整条标签条是 hidden 的，可当前那一格的关闭键
         * 自己写着 visibility: visible，于是在下拉按钮旁边留下一个孤零零的 ✕，
         * 而这一项当时报的是 true —— 看不见的 bug 正是这么混过去的。
         */
        closeVisible: el.querySelector('.x')?.checkVisibility({ visibilityProperty: true }) ?? null
      }
    }),
    lastTab,
    // 超出容器右沿就是被啃了——这正是「放不下却没让位」的样子
    lastTabOverflow: lastTab && zone ? Math.round(lastTab.x + lastTab.w - (zone.x + zone.w)) : null,
    fallback: box('.fallback'),
    fallbackText: document.querySelector('.fallback .title')?.textContent?.trim() ?? null,
    fallbackCount: document.querySelector('.fallback .count')?.textContent?.trim() ?? null,
    plus: box('.zone > button.icon:not(.fallback)'),
    addressToggle: box('.address-toggle'),
    // 右侧那一组按钮，从左到右，用来核对顺序
    rightButtons: rightGroup
      ? [...rightGroup.children].map((el) => ({
          cls: el.className,
          title: el.getAttribute('title'),
          x: Math.round(el.getBoundingClientRect().x),
          w: Math.round(el.getBoundingClientRect().width)
        }))
      : null,
    /*
     * 顶栏那几个图标按钮的「亮没亮」。
     *
     * 手机与置顶是这一版新搬进来的两个，它们的高亮各有一处真值来源：
     * 手机跟着当前标签页的 uaMode，置顶跟着 config.window.alwaysOnTop。
     * 截图里那点淡淡的强调色背景看不出是「亮了」还是配色本来如此，
     * 因此连实测颜色一起报出来。
     */
    topIcons: [...document.querySelectorAll('.topbar .group:last-of-type > button')].map((el) => ({
      title: el.getAttribute('title'),
      on: el.classList.contains('on'),
      color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor
    })),
    // 右栏里都有哪些功能，按上下顺序——顶栏藏起来时它是唯一的功能入口
    railButtons: [...document.querySelectorAll('.rail button')].map(
      (el) => el.getAttribute('title') ?? el.className
    ),
    /*
     * 背景透明度要看的三件事，各问各的：
     *   alpha —— 界面根上的那个变量，滑块拉出来的原始值
     *   底板 —— 顶栏/右栏的实测底色，应当带上这个 alpha
     *   字   —— 图标与文字的实测颜色，必须是不带 alpha 的实色：
     *           拉到 0 也要看得见、点得到，否则就是把自己锁在外面
     */
    surfaces: (() => {
      const root = document.querySelector('.root')
      const bar = document.querySelector('.topbar') ?? document.querySelector('.rail')
      const inkEl = document.querySelector('.topbar .icon') ?? document.querySelector('.rail button')
      if (!bar) return null
      const s = getComputedStyle(bar)
      return {
        alpha: root ? getComputedStyle(root).getPropertyValue('--moyu-alpha').trim() : null,
        bar: s.backgroundColor,
        // 顶栏的分隔线在下面，右栏的在左边
        hairline: bar.classList.contains('topbar') ? s.borderBottomColor : s.borderLeftColor,
        ink: inkEl ? getComputedStyle(inkEl).color : null
      }
    })(),
    /*
     * 右栏那两条透明度滑块，以及功能栈有没有被撑出滚动区。
     *
     * 这一栏刚做过一次「去掉两个 26px 的按钮、换进一条 56px 的滑块」，
     * 净空是否够用是算出来的，得实测一遍：scrollHeight 大于 clientHeight
     * 就意味着有控件被裁在可视区外，那一栏的功能就点不到了。
     */
    sliders: [...document.querySelectorAll('.opacity')].map((el) => {
      const track = el.querySelector('input')
      return {
        label: el.querySelector('.label')?.textContent?.trim() ?? null,
        value: el.querySelector('.value')?.textContent?.trim() ?? null,
        min: track?.getAttribute('min') ?? null,
        max: track?.getAttribute('max') ?? null,
        hint: el.getAttribute('title'),
        box: (() => {
          const r = el.getBoundingClientRect()
          return { y: Math.round(r.y), h: Math.round(r.height) }
        })(),
        track: track && (() => {
          const r = track.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height) }
        })()
      }
    }),
    stackScroll: (() => {
      const el = document.querySelector('.rail .stack')
      if (!el) return null
      return { scrollH: el.scrollHeight, clientH: el.clientHeight, overflow: el.scrollHeight - el.clientHeight }
    })(),
    bodySample: box('.rest')
  }
})()`

/** 起始页与系统设置的版面：看排版是否成立，以及主题有没有真的换掉颜色 */
const PAGE_MEASURE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const style = getComputedStyle(document.body)
  return {
    window: { w: window.innerWidth, h: window.innerHeight },
    theme: document.documentElement.dataset.theme ?? null,
    world: document.documentElement.dataset.world ?? null,
    colors: {
      ground: style.backgroundColor,
      text: style.color,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    },
    // 现代世界：行式列表。两套世界的四段划分逐段对齐，选的名也就一一对应
    modern: box('.modern'),
    wordmark: box('.wordmark'),
    prompt: box('.modern .prompt'),
    favicon: box('.modern .favicon'),
    lines: box('.modern .lines'),
    lineCount: document.querySelectorAll('.modern .line').length,
    firstLine: box('.modern .line'),
    resumeVerb: document.querySelector('.modern .line.resume .verb')?.textContent?.trim() ?? null,
    status: box('.modern .status'),
    // 终端世界：命令行
    term: box('.term'),
    termBar: box('.term .bar'),
    termPrompt: box('.term .prompt'),
    cursor: box('.term .cursor'),
    termLines: box('.term .lines'),
    termLineCount: document.querySelectorAll('.term .line').length,
    termFirstLine: box('.term .line'),
    termStatus: box('.term .status'),
    // 两套世界共用的主题选择器
    themeMenu: box('.theme-menu'),
    themePanel: box('.theme-menu .panel'),
    themeItem: box('.theme-menu .item'),
    sidebar: box('.sidebar'),
    content: box('.content')
  }
})()`

/**
 * 弹出面板：另一扇窗、另一份文档。
 *
 * 要问的和 chrome 一样——底板淡了、字没淡——但这里还得额外确认一件事：
 * 面板窗口是透明的，底板真的淡下去时露出来的是桌面，因此这一份的数据
 * 必须来自面板这份文档自己写下的 --moyu-alpha，而不是从别处继承来的。
 */
const POPOVER_MEASURE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }
  const panel = document.querySelector('.panel')
  const row = document.querySelector('.row')
  const s = panel ? getComputedStyle(panel) : null
  return {
    window: { w: window.innerWidth, h: window.innerHeight },
    kind: new URLSearchParams(location.search).get('kind'),
    // 写在文档根上的那个值；空串就意味着这份文档没写，底板不会淡
    alpha: document.documentElement.style.getPropertyValue('--moyu-alpha'),
    panel: box('.panel'),
    panelBg: s?.backgroundColor ?? null,
    panelBorder: s?.borderTopColor ?? null,
    rowColor: row ? getComputedStyle(row).color : null,
    rowCount: document.querySelectorAll('.row').length,
    title: document.querySelector('.title')?.textContent?.trim() ?? null
  }
})()`

/** 从主题选择器里取全部主题 id——不在脚本里另抄一份名单 */const THEME_IDS = `[...document.querySelectorAll('.theme-menu .panel .chips')].map((el) => el.dataset.theme)`

/**
 * 拖动探针：在一组**有名有姓**的位置上按一下再松开，问这一下起没起拖动。
 *
 * 这是这一版里最容易悄悄坏掉的一环：上一版整条顶栏与右栏都被 no-drag 的子元素
 * 铺满，于是只剩悬浮球拖得动——而这件事从代码上看不出来，截图上也看不出。
 * 判据不问代码，问界面自己：在目标点上派发一个会冒泡的 pointerdown、再派发
 * pointerup，然后读假桥里的拖动计数（dragLog，只存在于 spike 的假桥里）。
 *
 * 用合成的 PointerEvent 而不是 webContents.sendInputEvent：后者走真实输入通道，
 * 会把鼠标真的按下去并抢走焦点，而这具窗口是隐藏的，落点也说不清楚。
 * 合成事件的 setPointerCapture 会抛 NotFoundError——界面自己兜住了（见
 * useWindowDrag 里的 try），不影响这里要问的问题。
 *
 * 合成事件不会合成出 click，因此按在按钮上的那些点没有副作用；悬浮球那一下会
 * 走到「收起」上，而假桥里收起是空操作，界面也不会因此换形。
 */
const DRAG_PROBE = `(() => {
  const boxOf = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null
  const centerOf = (sel) => {
    const r = boxOf(sel)
    return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null
  }

  const bar = boxOf('.topbar')
  const rail = boxOf('.rail')
  const nav = boxOf('.topbar .group')
  const items = [...document.querySelectorAll('.rail .stack .item')]
  const firstItem = items[0]?.getBoundingClientRect() ?? null
  const railMidX = rail ? Math.round(rail.x + rail.width / 2) : 0
  const W = window.innerWidth
  const H = window.innerHeight

  /*
   * 第三项是「这一点应当起的是哪一种手势」：
   *   'resize:<边名>' —— 缩放手柄，且报上来的边名必须是这一个（拖东边报成西边，
   *                       窗口就朝反方向长，而那种错光看截图看不出来）
   *   省略           —— 其余一律**不该**起缩放：手柄若画大了，第一个被抢走点击的
   *                       就是这些控件，而界面上看不出来
   */
  const POINTS = [
    /*
     * 顶栏自己的左端留白。取 bar.x + 6 而不是 +3：最外那 4px 归**缩放手柄**
     * （窗口左边缘的手柄是通高的，顶栏这一段也在它里面），从 4 往里才是
     * 顶栏那 8px 内边距剩下的部分，那里按下去应当还是拖窗口。
     */
    ['顶栏左端留白', bar ? { x: Math.round(bar.x + 6), y: Math.round(bar.y + bar.height / 2) } : null],
    ['顶栏：导航组与地址栏之间的缝', nav ? { x: Math.round(nav.right + 2), y: Math.round(bar.y + bar.height / 2) } : null],
    ['顶栏：标签条右侧的空白（.rest）', centerOf('.zone > .rest')],
    ['顶栏：第一格标签（控件，不该拖）', centerOf('.zone .tab')],
    ['顶栏：地址栏开关（控件，不该拖）', centerOf('.address-toggle')],
    ['顶栏：手机（控件，不该拖）', centerOf('.topbar button[title*="手机"]')],
    ['顶栏：置顶（控件，不该拖）', centerOf('.topbar button[title*="置顶"]')],
    /*
     * 最大化那一枚与左右邻居只隔 28px（按钮就是 28px 宽），而它紧贴着右上角——
     * 8×8 的角手柄会不会啃掉它右下角那几像素，只能靠这个点问出来。
     */
    ['顶栏：最大化（控件，不该拖）', centerOf('.topbar button[title*="最大化"]')],
    ['顶栏：最小化（控件，不该拖）', centerOf('.topbar button[title*="最小化"]')],
    ['顶栏：悬浮球（它自己就是拖动面）', centerOf('.ball')],
    /*
     * 右栏顶端留白。顶栏藏起来时这一栏顶到 y=0，而那最上 4px 归**上边缘**的
     * 缩放手柄（那条手柄是通宽的），纵坐标因此至少要从 6 起；
     * 顶栏展开时 rail.y 本来就是 44，rail.y + 2 已经够。
     */
    ['右栏顶端留白', rail ? { x: Math.round(rail.x + 2), y: Math.max(6, Math.round(rail.y + 2)) } : null],
    ['右栏：两个功能格之间的缝', firstItem ? { x: railMidX, y: Math.round(firstItem.bottom + 1) } : null],
    ['右栏：分隔线', centerOf('.rail .sep')],
    ['右栏：滑块的小字（不该拖）', centerOf('.rail .opacity .label')],
    ['右栏：滑块的轨道（控件，不该拖）', centerOf('.rail .opacity input')],
    ['右栏：设置（控件，不该拖）', centerOf('.rail .foot')],

    // 四条边与四个角的中点各按一下：起缩放，且边名要对得上
    ['上边缘', { x: Math.round(W / 2), y: 1 }, 'resize:n'],
    ['右边缘', { x: W - 2, y: Math.round(H / 2) }, 'resize:e'],
    ['左上角', { x: 1, y: 1 }, 'resize:nw'],
    ['右上角', { x: W - 1, y: 1 }, 'resize:ne'],
    ['右下角', { x: W - 1, y: H - 1 }, 'resize:se'],
    /*
     * 下边缘与左边缘在**真机上**归网页：正文矩形从 x=0 起、下沿到窗口底，
     * 而网页是叠在界面之上的原生视图，界面在这两处收不到指针事件。
     * 这一格要等「把界面提到网页之上」那套机制落地之后才真正可用
     * （见 WindowController.setChromeOnTop）。此处只能验手柄本身在不在，
     * 名字里写清楚，免得把这一格当成「真机上也能拖」。
     */
    ['下边缘（真机归网页）', { x: Math.round(W / 2), y: H - 1 }, 'resize:s'],
    ['左边缘（真机归网页）', { x: 1, y: Math.round(H / 2) }, 'resize:w'],
    ['左下角（真机归网页）', { x: 1, y: H - 1 }, 'resize:sw']
  ]

  const results = []
  /*
   * 收起态（窗口就是一颗球）**不画**手柄，那时没有「边缘」可言。
   * 探针的点是按展开态列出来的，因此这里按实际有没有手柄来定判据：
   * 没有手柄时，那些点全部变成「不该起缩放」——收起态若还能拖出缩放，
   * 球就会在光标下被拉成一块方的。
   */
  const handles = document.querySelectorAll('[data-resize-handle]').length
  for (const [name, p, want] of POINTS) {
    const expect = handles > 0 ? (want ?? null) : null
    if (!p) {
      results.push({ name, at: null, hit: null, started: null, resized: null, why: '这一点算不出来' })
      continue
    }
    const hit = document.elementFromPoint(p.x, p.y)
    if (!hit) {
      results.push({ name, at: p, hit: null, started: null, resized: null, why: '这一点上没有元素' })
      continue
    }
    const classes = typeof hit.className === 'string' ? hit.className.trim().split(/\\s+/).filter(Boolean) : []
    const dragBefore = window.moyu.win.dragLog().starts
    const resizeBefore = window.moyu.win.resizeLog()
    const base = {
      bubbles: true, cancelable: true, composed: true,
      button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y
    }
    hit.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }))
    hit.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }))
    const log = window.moyu.win.resizeLog()
    const started = window.moyu.win.dragLog().starts > dragBefore
    const resized = log.starts > resizeBefore.starts
    // 报上来的边名：这一点若起了缩放，就是最后一次记下的那一个
    const edge = resized ? log.edges[log.edges.length - 1] : null
    const ok = expect ? resized && edge === expect.slice('resize:'.length) : !resized
    results.push({
      name,
      at: p,
      hit: hit.tagName.toLowerCase() + classes.map((c) => '.' + c).join(''),
      started,
      resized,
      edge,
      want: expect,
      ok
    })
  }

  /*
   * 收尾对账：每个点都按下去又松开了，起停次数应当相等。
   * starts > ends 意味着有一次拖动没被收掉——那正是「窗口黏在光标上」的前身，
   * 界面给这类漏网准备了四道兜底（松手、窗口失焦、页面失焦、下一次按下重新锚定），
   * 而这里能把它查出来。缩放的两条路（开始 / 结束）同此。
   */
  const log = window.moyu.win.dragLog()
  const rlog = window.moyu.win.resizeLog()
  return {
    points: results,
    handles,
    starts: log.starts,
    ends: log.ends,
    balanced: log.starts === log.ends,
    resizeStarts: rlog.starts,
    resizeEnds: rlog.ends,
    resizeBalanced: rlog.starts === rlog.ends,
    // 手势判对的那些点：一条条按名字列出来，「哪些对哪些不对」一眼看得出
    bad: results.filter((p) => p.ok === false).map((p) => p.name)
  }
})()`


const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    /*
     * 无边框，与真实窗口一致。带上系统边框时 --width 给的是**外框**尺寸，
     * 视口会比它小一圈（1280×720 请求到的是 1264×655），于是
     * --width 480 --height 270 量到的并不是迷你档那个 480×270 的视口。
     */
    frame: false,
    // 要透明通道时不能给底色：给了底色，球四周那圈透明就被填成一块灰
    ...(ALPHA ? { transparent: true } : { backgroundColor: '#1b1f24' }),
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  /*
   * 面板是带 ?kind= 打开的（五种面板共用一份 popover.html），
   * 不带参数时它自己是默认的「站点」那一张。
   */
  await win.loadFile(pagePath, page === 'popover' ? { search: `?kind=${KIND}` } : undefined)
  // 渲染进程是异步拉状态再渲染的，等它把首帧摆好
  await wait(1200)

  /*
   * 模拟桌面垫在 html 上：界面自己的底板画在它上面，而界面留白的地方透出来
   * 就成了「桌面」。关掉这个开关时什么都不做，验证版面拿到的还是那块默认灰底。
   */
  if (DESKTOP) {
    await win.webContents.executeJavaScript(
      `document.documentElement.style.background = ${JSON.stringify(DESKTOP)}`
    )
  }

  /*
   * --ball-zoom：只放大**图形本身**。
   *
   * 用 insertCSS 而不是去改 svg 的 width/height：那两个属性归 Vue 管，
   * 下一次重渲染会把它们改回去，而样式表不会。球自己的直径因此保持原样，
   * 这张图只用来判断路径画得成不成立（见上面 BALL_ZOOM 的说明）。
   */
  if (BALL_ZOOM > 1) {
    await win.webContents.insertCSS(
      `.ball svg, .ball img.custom { transform: scale(${BALL_ZOOM}); transform-origin: center; }`
    )
  }

  fs.mkdirSync(outDir, { recursive: true })

  /** --drag-probe 的结果。截一次图顺带量一次，写进 JSON，也在终端打一份 */
  let dragProbe = null

  const shoot = async (name) => {
    /*
     * 先等渲染进程真的画完一帧，再抓图。
     *
     * 不显示窗口的合成帧会晚一拍：状态刚改完就 capturePage，拿到的往往是
     * 上一帧——曾经出现过「crt-green 的截图里是第一版配色」这种灵异现象，
     * 而同一时刻 executeJavaScript 读出来的 DOM 又是对的。
     * 连等两帧（rAF 回调意味着这一帧已经提交），外加一次丢弃的抓取。
     * rAF 在隐藏窗口里可能被节流，因此加个超时兜底，别把脚本挂住。
     */
    await win.webContents.executeJavaScript(
      `Promise.race([
         new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
         new Promise((r) => setTimeout(r, 500))
       ])`
    )
    await win.webContents.capturePage()
    await wait(150)

    const image = await win.webContents.capturePage()
    const png = path.join(outDir, `${name}.png`)
    fs.writeFileSync(png, image.toPNG())
    const measured = await win.webContents.executeJavaScript(
      page === 'chrome' ? MEASURE : page === 'popover' ? POPOVER_MEASURE : PAGE_MEASURE
    )
    /*
     * 这一份写的是**当下实测的**最大化状态，不是 --maximized 这个入参。
     *
     * 两者在那一轮还原往返里必然对不上：--maximized 起的窗口跑完一圈点过还原键，
     * 盘面上已经不是最大化了。若这里照入参写一句 true，JSON 就与紧挨着它的
     * topbar / rail 实测自相矛盾——而读这份 JSON 的人正是拿它当证据用的。
     */
    const live = await win.webContents
      .executeJavaScript(`window.moyu.win.getState()`)
      .catch(() => null)
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      JSON.stringify(
        {
          page,
          mode,
          maximized: live?.maximized ?? MAXIMIZED,
          theme,
          bg: BG,
          reportedBallRect,
          measured,
          dragProbe
        },
        null,
        2
      ),
      'utf8'
    )
    console.log(`WROTE ${png}`)
    if (page === 'chrome') {
      console.log(`BALL_RECT ${JSON.stringify(reportedBallRect)}`)
      // 球面上画的是哪一枚、实测多大：与截图对着看，比只看图确定得多
      console.log(`BALL_GLYPH ${JSON.stringify(measured.ballGlyph)}`)
      // 最大化那一档：右上角两样东西的实测几何，判据见 MEASURE 里的说明
      if (MAXIMIZED) {
        console.log(
          `FLOAT ${JSON.stringify({ box: measured.floatBox, key: measured.floatKey, ball: measured.ball })}`
        )
      }
    }
  }

  const run = (js) => win.webContents.executeJavaScript(js)
  // 尺寸与非默认的标签数都写进名字：同一台机器上跑几档下来，别互相覆盖
  const size = WIDTH !== 960 || HEIGHT !== 540 ? `-${WIDTH}x${HEIGHT}` : ''
  const tabs = TABS ? `-${TABS}tabs` : ''
  // 底板透明度同理：跑了 0.35 那一档之后，默认那一档的图不该被它盖掉
  const bg = BG !== 1 ? `-bg${BG}` : ''
  /*
   * 球面上画的是什么也写进名字：八枚内置图标是八张图，跑第二轮时彼此不能覆盖。
   * 自定义那张用落法而不是文件名做标记——同一个落法同一张图，重跑就该盖掉旧的那张。
   */
  const ball = BALL_IMAGE ? `-img${BALL_FIT}` : BALL_ICON !== 'book' ? `-icon${BALL_ICON}` : ''
  const zoom = BALL_ZOOM > 1 ? `-zoom${BALL_ZOOM}` : ''
  // 最大化那一档与展开态是两张不同的图（一张是右上角一小块、一张是整扇窗），不能互相覆盖
  const max = MAXIMIZED ? '-max' : ''

  /*
   * --drag-probe：先按一遍，再照第一张。
   *
   * 放在截图之前：探针会派发几次 pointerdown/pointerup，虽然不含 click、
   * 按道理不改动界面，但把「量」放在「照」前头更稳妥——将来探针万一长出
   * 副作用，也不至于污染后面所有的图。
   */
  if (page === 'chrome' && has('--drag-probe')) {
    dragProbe = await run(DRAG_PROBE)
    for (const p of dragProbe.points) {
      const mark = p.started ? '拖' : p.started === false ? '不拖' : '？'
      // 手势判对与否：'✓' / '✗' / 这一点没算出判据（'·'）
      const verdict = p.ok === true ? '✓' : p.ok === false ? '✗' : '·'
      const size = p.want ? ` ${p.want}${p.edge ? `→${p.edge}` : ''}` : ''
      console.log(`DRAG ${verdict} ${mark} ${p.name} → ${p.hit ?? p.why ?? '?'}${size}`)
    }
    console.log(`DRAG_BAD ${JSON.stringify(dragProbe.bad)}`)
    console.log(`DRAG_HANDLES ${dragProbe.handles}`)
    console.log(
      `DRAG_LOG ${JSON.stringify({
        starts: dragProbe.starts,
        ends: dragProbe.ends,
        balanced: dragProbe.balanced,
        resizeStarts: dragProbe.resizeStarts,
        resizeEnds: dragProbe.resizeEnds,
        resizeBalanced: dragProbe.resizeBalanced
      })}`
    )
  }

  if (page === 'home' && has('--themes')) {
    /*
     * 展开主题选择器。
     *
     * 点开与点选必须分成两次 executeJavaScript：Vue 的 DOM 更新是下一帧的事，
     * 同一次调用里点开面板就立刻去取面板里的按钮，取到的是空的。
     */
    const openMenu = `(() => {
      const trigger = document.querySelector('.theme-menu .trigger')
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click()
    })()`

    await run(openMenu)
    await wait(300)
    // 主题名单从面板里读，不在脚本里另抄一份
    const ids = await run(THEME_IDS)
    console.log(`THEMES ${JSON.stringify(ids)}`)
    await shoot(`home-picker${size}${bg}`)

    for (let i = 0; i < ids.length; i += 1) {
      /*
       * 走真实那条路：点菜单项 → 写配置 → 广播 → 重新渲染。
       * 直接改 dataset.theme 换不出另一套世界——主题要连形态一起换掉，
       * 那一步只有应用自己知道（见 @shared/constants 的 worldOfTheme）。
       */
      await run(`document.querySelectorAll('.theme-menu .panel .item')[${i}].click()`)
      await wait(400)
      await shoot(`home-${ids[i]}${size}${bg}`)
      await run(openMenu)
      await wait(250)
    }
  } else {
    const name =
      page !== 'chrome'
        ? `${page}${page === 'home' ? `-${theme}` : page === 'popover' ? `-${KIND}` : ''}${size}${tabs}${bg}${ball}${zoom}`
        : `preview-${mode}${max}${size}${tabs}${bg}${ball}${zoom}`
    await shoot(name)

    /*
     * 最大化那一档：点一下右上角那枚还原键，再照一张。
     *
     * 这是「最大化 → 还原」这条往返的端到端验收：界面发意图 → 主进程改状态 →
     * 广播回来 → 界面重画（假桥里那条广播是真的，见 preview-preload.js）。
     * 第二张的 JSON 里必须重新出现 rightButtons 与 railButtons——顶栏与右栏回来了。
     * 只看第一张只能证明「藏着」，证不了「回得来」，而这一态唯一的出口就是那枚键。
     */
    if (page === 'chrome' && MAXIMIZED) {
      await run(`document.querySelector('.float-key')?.click()`)
      await wait(400)
      await shoot(`${name}-restored`)
    }

    /*
     * 点一格标签，再截一张。
     *
     * 「点得动」是标签条的全部意义，而这件事只有真点一下才知道：
     * 假桥里 activate 会改掉当前格并广播，两张图的选中格应当不同。
     */
    if (page === 'chrome' && has('--click-tab')) {
      const at = num('--click-tab', 0)
      await run(`document.querySelectorAll('.zone .tab')[${at}]?.click()`)
      await wait(400)
      await shoot(`${name}-click${at}`)
    }

    /*
     * 改窗口尺寸，再截一张：标签条的让位与回归都靠这一步走一遍。
     * 窗口一变，渲染进程那边的 ResizeObserver 才量得出新的余量。
     */
    if (resize) {
      win.setSize(resize.width, resize.height)
      await wait(600)
      await shoot(`${name}-resized${resize.width}x${resize.height}`)
    }
  }

  app.exit(0)
})
