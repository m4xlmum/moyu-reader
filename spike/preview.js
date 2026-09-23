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
 *   npx electron spike/preview.js --width 480 --height 270   # 迷你档多大，标签条就得让位
 *   npx electron spike/preview.js --tabs 3        # 只留前 3 个标签页：放得下那一态
 *   npx electron spike/preview.js --click-tab 0   # 点第 0 格标签，再截一张
 *   npx electron spike/preview.js --resize 1100x700   # 改窗口尺寸再截一张：让位与回归
 *   npx electron spike/preview.js --home          # 起始页
 *   npx electron spike/preview.js --home --themes # 起始页三套主题各截一张（走真实换主题那条路）
 *   npx electron spike/preview.js --home --theme crt-green --width 448 --height 297
 *   npx electron spike/preview.js --settings --width 560 --height 400
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

const page = has('--home') ? 'home' : has('--settings') ? 'settings' : 'chrome'
const PAGE_FILE = { chrome: 'index.html', home: 'home.html', settings: 'settings.html' }

const WIDTH = num('--width', 960)
const HEIGHT = num('--height', 540)
/** 只留前 N 个标签页。标签条放不放得下是算出来的，得能用少几张试出「放得下」那一态 */
const TABS = num('--tabs', 0)
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

const outDir = path.join(__dirname, 'out')
const pagePath = path.join(__dirname, '..', 'out', 'renderer', PAGE_FILE[page])

/** 渲染进程上报的悬浮球矩形——「收起时窗口落到哪」全靠它 */
let reportedBallRect = null
ipcMain.on('preview:ballRect', (_event, rect) => {
  reportedBallRect = rect
})
ipcMain.on('preview:options', (event) => {
  event.returnValue = { mode, theme, tabs: TABS }
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
    zone,
    stripFits: document.querySelector('.strip')?.dataset.fits ?? null,
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
    // 右栏里都有哪些功能，按上下顺序——顶栏藏起来时它是唯一的功能入口
    railButtons: [...document.querySelectorAll('.rail button')].map(
      (el) => el.getAttribute('title') ?? el.className
    ),
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

/** 从主题选择器里取全部主题 id——不在脚本里另抄一份名单 */
const THEME_IDS = `[...document.querySelectorAll('.theme-menu .panel .chips')].map((el) => el.dataset.theme)`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    backgroundColor: '#1b1f24',
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  await win.loadFile(pagePath)
  // 渲染进程是异步拉状态再渲染的，等它把首帧摆好
  await wait(1200)

  fs.mkdirSync(outDir, { recursive: true })

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
      page === 'chrome' ? MEASURE : PAGE_MEASURE
    )
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      JSON.stringify({ page, mode, theme, reportedBallRect, measured }, null, 2),
      'utf8'
    )
    console.log(`WROTE ${png}`)
    if (page === 'chrome') console.log(`BALL_RECT ${JSON.stringify(reportedBallRect)}`)
  }

  const run = (js) => win.webContents.executeJavaScript(js)
  // 尺寸与非默认的标签数都写进名字：同一台机器上跑几档下来，别互相覆盖
  const size = WIDTH !== 960 || HEIGHT !== 540 ? `-${WIDTH}x${HEIGHT}` : ''
  const tabs = TABS ? `-${TABS}tabs` : ''

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
    await shoot(`home-picker${size}`)

    for (let i = 0; i < ids.length; i += 1) {
      /*
       * 走真实那条路：点菜单项 → 写配置 → 广播 → 重新渲染。
       * 直接改 dataset.theme 换不出另一套世界——主题要连形态一起换掉，
       * 那一步只有应用自己知道（见 @shared/constants 的 worldOfTheme）。
       */
      await run(`document.querySelectorAll('.theme-menu .panel .item')[${i}].click()`)
      await wait(400)
      await shoot(`home-${ids[i]}${size}`)
      await run(openMenu)
      await wait(250)
    }
  } else {
    const name =
      page !== 'chrome'
        ? `${page}${page === 'home' ? `-${theme}` : ''}${size}${tabs}`
        : `preview-${mode}${size}${tabs}`
    await shoot(name)

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
