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
  event.returnValue = { mode, theme }
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
  return {
    window: { w: window.innerWidth, h: window.innerHeight },
    topbar: box('.topbar'),
    rail: box('.rail'),
    ball: box('.ball'),
    tabSelect: box('.tab-select'),
    tabSelectText: document.querySelector('.tab-select .ellipsis')?.textContent?.trim() ?? null,
    tabCount: document.querySelector('.tab-count')?.textContent?.trim() ?? null,
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
    bodySample: box('.spacer')
  }
})()`

/** 起始页与个人中心的版面：看排版是否成立，以及主题有没有真的换掉颜色 */
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
    // 现代世界：卡片
    cards: box('.cards'),
    wordmark: box('.wordmark'),
    search: box('.search'),
    hero: box('.hero'),
    tilesArea: box('.tiles'),
    tileCount: document.querySelectorAll('.tile').length,
    foot: box('.foot'),
    // 终端世界：命令行
    term: box('.term'),
    termBar: box('.term .bar'),
    prompt: box('.term .prompt'),
    cursor: box('.term .cursor'),
    lines: box('.term .lines'),
    lineCount: document.querySelectorAll('.term .line').length,
    firstLine: box('.term .line'),
    status: box('.term .status'),
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

  if (page === 'home' && has('--themes')) {
    const run = (js) => win.webContents.executeJavaScript(js)
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
    await shoot('home-picker')

    for (let i = 0; i < ids.length; i += 1) {
      /*
       * 走真实那条路：点菜单项 → 写配置 → 广播 → 重新渲染。
       * 直接改 dataset.theme 换不出另一套世界——主题要连形态一起换掉，
       * 那一步只有应用自己知道（见 @shared/constants 的 worldOfTheme）。
       */
      await run(`document.querySelectorAll('.theme-menu .panel .item')[${i}].click()`)
      await wait(400)
      await shoot(`home-${ids[i]}`)
      await run(openMenu)
      await wait(250)
    }
  } else {
    const name =
      page !== 'chrome'
        ? `${page}${page === 'home' ? `-${theme}` : ''}${WIDTH !== 960 ? `-${WIDTH}x${HEIGHT}` : ''}`
        : `preview-${mode}`
    await shoot(name)
  }

  app.exit(0)
})
