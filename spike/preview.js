/**
 * 无头预览：把编译好的 chrome 界面在一个不显示的窗口里渲染出来，
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
 * 产物写在 spike/out/ 下：preview-<mode>.png 与 preview-<mode>.json
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const WIDTH = 960
const HEIGHT = 540

const MODES = { '--no-topbar': 'no-topbar', '--collapsed': 'collapsed' }
const mode = Object.keys(MODES).find((flag) => process.argv.includes(flag))
  ? MODES[Object.keys(MODES).find((flag) => process.argv.includes(flag))]
  : 'default'

const outDir = path.join(__dirname, 'out')
const indexPath = path.join(__dirname, '..', 'out', 'renderer', 'index.html')

/** 渲染进程上报的悬浮球矩形——「收起时窗口落到哪」全靠它 */
let reportedBallRect = null
ipcMain.on('preview:ballRect', (_event, rect) => {
  reportedBallRect = rect
})
ipcMain.on('preview:mode', (event) => {
  event.returnValue = mode
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
    bodySample: box('.spacer')
  }
})()`

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

  await win.loadFile(indexPath)
  // 渲染进程是异步拉状态再渲染的，等它把首帧摆好
  await new Promise((resolve) => setTimeout(resolve, 1200))

  fs.mkdirSync(outDir, { recursive: true })

  const image = await win.webContents.capturePage()
  const pngPath = path.join(outDir, `preview-${mode}.png`)
  fs.writeFileSync(pngPath, image.toPNG())

  const measured = await win.webContents.executeJavaScript(MEASURE)
  const jsonPath = path.join(outDir, `preview-${mode}.json`)
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ mode, reportedBallRect, measured }, null, 2),
    'utf8'
  )

  console.log(`WROTE ${pngPath}`)
  console.log(`BALL_RECT ${JSON.stringify(reportedBallRect)}`)
  app.exit(0)
})
