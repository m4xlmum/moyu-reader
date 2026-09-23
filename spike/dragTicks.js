/**
 * 拖动为什么不够跟手：把「定时器」与「移动窗口」分开量。
 *
 * 拖动是主进程每 DRAG_TICK_MS 采一次光标、把窗口挪过去（见
 * WindowController.tickDrag）。跟不跟手取决于两件事：
 *   1) 那个定时器到底多久响一次——16ms 只是**请求**的间隔，
 *      Node 的定时器不保证准时，而抖动比间隔本身更容易被眼睛看出来；
 *   2) 每响一次要花多久把窗口挪过去——如果单次就接近间隔，回调会挤在一起，
 *      表现为「一顿一顿」。
 *
 * 第 2 项只能在隐藏窗口上量（用户要求不要把界面弹出来），而隐藏窗口
 * 不做合成，所以那个数只是**下界**：真实可见窗口只会更贵。这一点必须写在结论里，
 * 不能拿一个乐观的数当结论用。
 *
 * 用法：
 *   npx electron spike/dragTicks.js            # 量 16ms 与 8ms 两档
 *   npx electron spike/dragTicks.js 16         # 只量一档
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BaseWindow, WebContentsView, screen } = require('electron')
const path = require('node:path')

const args = process.argv.slice(2)
const TICKS = args.filter((a) => /^\d+$/.test(a)).map(Number)
const SAMPLES = 300

function stats(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const round = (v) => Math.round(v * 1000) / 1000
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    label,
    n: sorted.length,
    min: round(sorted[0]),
    p50: round(at(0.5)),
    p90: round(at(0.9)),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
    /** 抖动的直观说法：p90 与 p50 差多少 */
    spread: round(at(0.9) - at(0.5))
  }
}

/** 隔 TICK 毫秒响一次，记下每次的**实际**间隔 */
function measureTimer(tick, onTick) {
  return new Promise((resolve) => {
    const deltas = []
    let last = process.hrtime.bigint()
    let n = 0
    const timer = setInterval(() => {
      const now = process.hrtime.bigint()
      deltas.push(Number(now - last) / 1e6)
      last = now
      if (onTick) onTick(n)
      n += 1
      if (n >= SAMPLES) {
        clearInterval(timer)
        // 第一次的间隔从 setInterval 调用算起，含建表开销，丢掉
        resolve(stats(`setInterval(${tick}) 的实际间隔 ms`, deltas.slice(1)))
      }
    }, tick)
  })
}

app.whenReady().then(async () => {
  console.log('--- 只有定时器，没有别的事 ---')
  for (const tick of TICKS.length ? TICKS : [16, 8]) {
    console.log(JSON.stringify(await measureTimer(tick)))
  }

  /*
   * 再加一扇真的窗口：结构与摸鱼窗口一致（无边框、透明、一个铺满的
   * WebContentsView），这样量到的至少是同一个数量级。
   */
  const win = new BaseWindow({
    x: 40,
    y: 40,
    width: 960,
    height: 540,
    frame: false,
    transparent: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000'
  })
  const view = new WebContentsView()
  view.setBackgroundColor('#00000000')
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 960, height: 540 })
  await view.webContents.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'index.html'))
  await new Promise((r) => setTimeout(r, 800))

  const costs = []
  for (const tick of TICKS.length ? TICKS : [16, 8]) {
    costs.length = 0
    let i = 0
    const s = await measureTimer(tick, (n) => {
      const t0 = process.hrtime.bigint()
      win.setPosition(40 + (n % 50), 40 + (n % 30))
      costs.push(Number(process.hrtime.bigint() - t0) / 1e6)
      i = n
    })
    console.log(JSON.stringify(s))
    console.log(JSON.stringify(stats(`setPosition 单次耗时 ms（隐藏窗口，下界）`, costs)))
    console.log(`  最后一帧序号 ${i}`)
  }

  console.log('--- 可见窗口的合成开销无法无头测量，以上是下界 ---')
  app.exit(0)
})
