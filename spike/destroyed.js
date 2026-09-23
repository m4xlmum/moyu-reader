/**
 * 退出路径的销毁安全：关窗之后还能碰哪些东西？
 *
 * 这个脚本是「退出时弹出 A JavaScript error occurred in the main process /
 * Object has been destroyed」那个 bug 的复现与回归验证。
 *
 * 根因：'closed' 事件是在窗口**已经销毁之后**才触发的，此时读 win.id 或调
 * win.getBounds() 都会抛「Object has been destroyed」。而退出走的是
 * app.quit() → 关窗 → 'closed'，异常从那里一路冒到主进程的未捕获异常
 * 处理器上，弹出一个错误框。窗口控制器与弹出面板的 'closed' 处理器原本
 * 都在里面读 win.id。
 *
 * 用法：npx electron spike/destroyed.js
 * 期望：老写法在 'closed' 里读 id 抛异常；新写法（id 提前记下、关窗即停
 * 定时器）走完 app.quit() 全程没有未捕获异常。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BaseWindow, WebContentsView } = require('electron')

/** 主进程未捕获异常：有的话这里先接住记下来，最后统一汇报 */
const uncaught = []
process.on('uncaughtException', (err) => uncaught.push(err.message))

// 对照组会销毁唯一的窗口，那会触发 window-all-closed；只要有订阅者，
// Electron 就不再按默认行为顺手退出——否则整个脚本会在第二段之前就结束。
app.on('window-all-closed', () => {})

const probe = (label, fn) => {
  try {
    return `${label} = ${JSON.stringify(fn())}`
  } catch (err) {
    return `${label} 抛异常：${err.message}`
  }
}

/** 与真实窗口同款参数：无边框、透明、不显示 */
function createWindow() {
  const win = new BaseWindow({
    x: -2000,
    y: -2000,
    width: 320,
    height: 180,
    frame: false,
    transparent: true,
    show: false,
    resizable: false,
    backgroundColor: '#00000000'
  })
  const view = new WebContentsView({ webPreferences: { sandbox: true } })
  view.setBackgroundColor('#00000000')
  win.contentView.addChildView(view)
  return { win, view }
}

// ---------------------------------------------------------------- 对照组

/** 老写法：在 'closed' 里才去读 win.id */
function controlGroup() {
  return new Promise((resolve) => {
    const { win } = createWindow()
    win.once('closed', () => {
      console.log('--- 老写法：在 closed 里读 win.id ---')
      console.log(probe('win.isDestroyed()', () => win.isDestroyed()))
      console.log(probe('win.id', () => win.id))
      console.log(probe('win.getBounds()', () => win.getBounds()))
      resolve()
    })
    win.destroy()
  })
}

// ---------------------------------------------------------------- 退出路径

/** 新写法：id 提前记下，'closed' 里只用记下的值，并停掉还在轮询的定时器 */
function quitPath() {
  return new Promise((resolve) => {
    const { win, view } = createWindow()
    const winId = win.id
    let closed = false
    let timerTicks = 0

    // 收起轮询：每 50ms 读一次窗口 id 与矩形，光标离开的判定就靠它
    const timer = setInterval(() => {
      timerTicks++
      try {
        void win.id
        void win.getBounds()
      } catch (err) {
        console.log(`轮询里读窗口：${err.message}（说明定时器没停）`)
      }
    }, 50)
    let stopped = false
    const stopTimer = () => {
      clearInterval(timer)
      stopped = true
    }

    win.on('closed', () => {
      closed = true
      void winId
      stopTimer()
      view.webContents.close()
    })

    app.once('will-quit', () => {
      console.log('--- 新写法：id 提前记下，关窗即停定时器 ---')
      console.log(`closed 处理器跑过了 = ${closed}`)
      console.log(`定时器已停 = ${stopped}（跑过 ${timerTicks} 次）`)
      console.log(`未捕获异常 = ${uncaught.length === 0 ? '无' : JSON.stringify(uncaught)}`)
      app.exit(0)
    })

    // 与点托盘菜单的「退出」完全同一条路径：app.quit() → 关窗 → 'closed'
    app.quit()
    resolve()
  })
}

app.whenReady().then(async () => {
  await controlGroup()
  await quitPath()
})
