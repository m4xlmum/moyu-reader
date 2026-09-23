/**
 * 自家页面的底色：注入的「让网页背景透明」会不会把起始页与个人中心也一起清掉？
 *
 * 背景：pageStyler 会往每个标签页注入 `html, body { background: transparent
 * !important }`（user origin），用来消除访客网页自带的白底。user origin 的
 * !important 在层叠顺序里压过作者样式表里的 !important，而系统设置的底色
 * **正是也写在 html/body 上**——于是这一页的底板被抹掉，透明窗口里就露出
 * 桌面。起始页没出这个问题，纯属它的底板另外画在 `.start` 这个铺满窗口的
 * div 上，注入够不着。
 *
 * 这个脚本直接量层叠的结果（getComputedStyle），不靠肉眼：注入前后各读一次
 * html / body / 各自的底板层。修复后两个页面在「注入照旧发生」的最坏情况下
 * 也不透底——这正是要守住的那条线。
 *
 * 用法：npx electron spike/ownpage-bg.js
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BaseWindow, WebContentsView, ipcMain } = require('electron')
const path = require('node:path')

// 预览用的假桥要问主进程要主题，这里给一个默认答案
ipcMain.on('preview:options', (event) => {
  event.returnValue = { mode: 'default', theme: 'paper' }
})

/** 摘自 src/main/services/pageStyler.ts 的 TRANSPARENT_BACKGROUND */
const PAGE_STYLER_CSS = 'html, body { background: transparent !important; }'

const rootSel = (sel) =>
  `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? getComputedStyle(el).backgroundColor : null })()`

const READ = (sel) => `(() => ({
  theme: document.documentElement.dataset.theme ?? null,
  html: getComputedStyle(document.documentElement).backgroundColor,
  body: getComputedStyle(document.body).backgroundColor,
  root: ${rootSel(sel)}
}))()`

/** 页面自己画底板的那一层：起始页是 .start，系统设置是 .layout */
async function measure(pageFile, sel) {
  const win = new BaseWindow({
    x: -2000,
    y: -2000,
    width: 800,
    height: 400,
    frame: false,
    transparent: true,
    show: false,
    resizable: false,
    backgroundColor: '#00000000'
  })
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  view.setBackgroundColor('#00000000')
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 800, height: 400 })

  await view.webContents.loadFile(path.join(__dirname, '..', 'out', 'renderer', pageFile))
  const before = await view.webContents.executeJavaScript(READ(sel))
  await view.webContents.insertCSS(PAGE_STYLER_CSS, { cssOrigin: 'user' })
  const after = await view.webContents.executeJavaScript(READ(sel))

  console.log(`\n--- ${pageFile}（主题 ${before.theme}） ---`)
  console.log(`注入前  html=${before.html}  body=${before.body}  ${sel}=${before.root}`)
  console.log(`注入后  html=${after.html}  body=${after.body}  ${sel}=${after.root}`)
  console.log(
    after.root && after.root !== 'rgba(0, 0, 0, 0)'
      ? `结论：注入抹掉了 html/body 的底色，但 ${sel} 仍然是实体色，窗口不透底`
      : `结论：${sel} 也透了——桌面会从这一页漏出来`
  )

  try {
    view.webContents.close()
  } catch {
    // 忽略
  }
  win.destroy()
}

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const pages = [
    ['settings.html', '.layout'],
    ['home.html', '.start']
  ]
  for (const [file, sel] of pages) {
    try {
      await measure(file, sel)
    } catch (err) {
      console.error(`量 ${file} 出错：${err.message}`)
    }
  }
  app.exit(0)
})
