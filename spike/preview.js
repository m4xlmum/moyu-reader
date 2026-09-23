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
 *   npx electron spike/preview.js --home --themes # 起始页七个主题各截一张
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
    colors: {
      ground: style.backgroundColor,
      text: style.color,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    },
    wordmark: box('.wordmark'),
    search: box('.search'),
    resume: box('.resume'),
    tiles: document.querySelectorAll('.tile').length,
    shortcuts: box('.shortcuts'),
    themeWrap: box('.theme-wrap'),
    themePanel: box('.theme-panel'),
    themeItem: box('.theme-item'),
    sidebar: box('.sidebar'),
    content: box('.content')
  }
})()`

/** 从起始页已有的主题列表里取全部主题 id——不在脚本里另抄一份名单 */
const THEME_IDS = `[...document.querySelectorAll('.theme-panel .chips')].map((el) => el.dataset.theme)`

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
    // 先展开主题面板，把选择器的样子也留一张
    await win.webContents.executeJavaScript(
      `document.querySelector('.theme-button').click()`
    )
    await wait(300)
    await shoot('home-picker')

    const ids = await win.webContents.executeJavaScript(THEME_IDS)
    console.log(`THEMES ${JSON.stringify(ids)}`)
    for (const id of ids) {
      // 直接改属性而不走点击：点击会写配置，而这里只想看色板
      await win.webContents.executeJavaScript(
        `document.documentElement.dataset.theme = ${JSON.stringify(id)}`
      )
      await wait(400)
      await shoot(`home-${id}`)
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
