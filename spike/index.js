/**
 * Spike：验证 Windows 上透明窗口的合成行为。
 *
 * 这是一个一次性脚本，不进入正式代码。它自己截屏并比对像素，
 * 因此结论不依赖肉眼观察。
 *
 * 运行：npx electron spike/index.js
 * 产出：spike/report.json 与控制台报告
 */
const { app, BaseWindow, WebContentsView, desktopCapturer, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 被测窗口的位置与尺寸（DIP）
const RECT = { x: 120, y: 120, width: 640, height: 420 }

const results = []
function record(id, question, verdict, detail) {
  results.push({ id, question, verdict, detail })
  console.log(`[${id}] ${verdict} — ${question}`)
  if (detail) console.log(`      ${JSON.stringify(detail)}`)
}

/** 截取所有屏幕，返回 {images: Map<displayId, NativeImage>, displays} */
async function captureAll() {
  const displays = screen.getAllDisplays()
  const maxW = Math.max(...displays.map((d) => Math.round(d.size.width * d.scaleFactor)))
  const maxH = Math.max(...displays.map((d) => Math.round(d.size.height * d.scaleFactor)))
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: maxW, height: maxH }
  })
  const byDisplay = new Map()
  for (const s of sources) byDisplay.set(String(s.display_id), s.thumbnail)
  return { byDisplay, primary: displays.find((d) => d.id === screen.getPrimaryDisplay().id) }
}

/**
 * 比对两次截图在给定 DIP 矩形内的平均像素差。
 * 返回每通道平均绝对差（0-255）与最大差。
 */
function diffRegion(imgA, imgB, rectDip, scale) {
  const sizeA = imgA.getSize()
  const sizeB = imgB.getSize()
  if (sizeA.width !== sizeB.width || sizeA.height !== sizeB.height) {
    return { error: 'size mismatch', sizeA, sizeB }
  }
  const a = imgA.getBitmap()
  const b = imgB.getBitmap()
  const stride = sizeA.width * 4

  const x0 = Math.max(0, Math.round(rectDip.x * scale))
  const y0 = Math.max(0, Math.round(rectDip.y * scale))
  const x1 = Math.min(sizeA.width, Math.round((rectDip.x + rectDip.width) * scale))
  const y1 = Math.min(sizeA.height, Math.round((rectDip.y + rectDip.height) * scale))

  let sum = 0
  let max = 0
  let n = 0
  // 抽样步长，避免逐像素扫描过慢
  const step = 3
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const off = y * stride + x * 4
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[off + c] - b[off + c])
        sum += d
        if (d > max) max = d
        n++
      }
    }
  }
  return { meanAbs: n ? +(sum / n).toFixed(2) : null, maxAbs: max, samples: n }
}

/** 提取区域内的平均 BGR，用于判断是否被涂成黑色/白色 */
function regionMeanBGR(img, rectDip, scale) {
  const size = img.getSize()
  const bmp = img.getBitmap()
  const stride = size.width * 4
  const x0 = Math.max(0, Math.round(rectDip.x * scale))
  const y0 = Math.max(0, Math.round(rectDip.y * scale))
  const x1 = Math.min(size.width, Math.round((rectDip.x + rectDip.width) * scale))
  const y1 = Math.min(size.height, Math.round((rectDip.y + rectDip.height) * scale))
  let b = 0, g = 0, r = 0, n = 0
  const step = 3
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const off = y * stride + x * 4
      b += bmp[off]; g += bmp[off + 1]; r += bmp[off + 2]
      n++
    }
  }
  return n ? { b: Math.round(b / n), g: Math.round(g / n), r: Math.round(r / n) } : null
}

const RED_PAGE = 'data:text/html,<html><body style="margin:0;background:%23ff0000;width:100vw;height:100vh"></body></html>'

async function main() {
  const primary = screen.getPrimaryDisplay()
  const scale = primary.scaleFactor
  console.log(`主显示器：${primary.size.width}x${primary.size.height} DIP，scaleFactor=${scale}`)

  // ---------- 基线：无窗口时的桌面 ----------
  const base = await captureAll()
  const baseImg = base.byDisplay.get(String(primary.id))
  if (!baseImg) throw new Error('无法获取主屏幕截图')
  const baseline = regionMeanBGR(baseImg, RECT, scale)
  console.log(`桌面基线均值 BGR：${JSON.stringify(baseline)}`)

  // ---------- 建立透明窗口 + 子视图 ----------
  const win = new BaseWindow({
    x: RECT.x, y: RECT.y, width: RECT.width, height: RECT.height,
    frame: false, transparent: true, show: false,
    alwaysOnTop: true, resizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false
  })

  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: RECT.width, height: RECT.height })

  // ---- Q1：不给子视图设背景色就显示，是否透明？ ----
  await view.webContents.loadURL('about:blank')
  win.showInactive()
  await sleep(900)
  let shot = await captureAll()
  let img = shot.byDisplay.get(String(primary.id))
  let d = diffRegion(baseImg, img, RECT, scale)
  const defaultBgMean = regionMeanBGR(img, RECT, scale)
  record(
    'Q1', '透明 BaseWindow + 子 WebContentsView（默认背景）是否真的透明？',
    d.meanAbs < 6 ? '透明' : '不透明',
    { diff: d, regionMeanBGR: defaultBgMean }
  )

  // ---- Q2：view.setBackgroundColor('#00000000') 是否让它变透明？ ----
  view.setBackgroundColor('#00000000')
  await sleep(600)
  shot = await captureAll()
  img = shot.byDisplay.get(String(primary.id))
  d = diffRegion(baseImg, img, RECT, scale)
  record(
    'Q2', 'view.setBackgroundColor("#00000000") 后是否透明？',
    d.meanAbs < 6 ? '透明' : '仍有底色',
    { diff: d, regionMeanBGR: regionMeanBGR(img, RECT, scale) }
  )

  // ---- Q3：窗口 setOpacity(0.5) 与 transparent:true 是否兼容？ ----
  // 载入纯红页面，把窗口整体设为 50% 不透明，
  // 期望结果 = 桌面与红色的 50/50 混合。若变成纯黑或纯红则说明两条路径打架。
  await view.webContents.loadURL(RED_PAGE)
  await sleep(900)
  view.setBackgroundColor('#00000000')
  win.setOpacity(0.5)
  await sleep(800)
  shot = await captureAll()
  img = shot.byDisplay.get(String(primary.id))
  const blended = regionMeanBGR(img, RECT, scale)
  const expected = baseline
    ? { b: Math.round(baseline.b * 0.5), g: Math.round(baseline.g * 0.5), r: Math.round(baseline.r * 0.5 + 255 * 0.5) }
    : null
  const dist = expected
    ? Math.abs(blended.b - expected.b) + Math.abs(blended.g - expected.g) + Math.abs(blended.r - expected.r)
    : null
  record(
    'Q3', 'transparent:true 窗口上调用 setOpacity(0.5) 是否正常混合？',
    dist !== null && dist < 45 ? '正常混合' : '与 transparent 冲突',
    { blended, expected, totalChannelDelta: dist }
  )

  // ---- Q4：setShape 与 transparent 是否共存？ ----
  win.setOpacity(1)
  await sleep(400)
  let shapeOk = true
  let shapeErr = null
  try {
    // 只保留上半部分
    win.setShape([{ x: 0, y: 0, width: RECT.width, height: Math.round(RECT.height / 2) }])
  } catch (e) {
    shapeOk = false
    shapeErr = String(e && e.message)
  }
  await sleep(800)
  shot = await captureAll()
  img = shot.byDisplay.get(String(primary.id))
  const topHalf = { x: RECT.x, y: RECT.y, width: RECT.width, height: Math.round(RECT.height / 2) }
  const bottomHalf = {
    x: RECT.x, y: RECT.y + Math.round(RECT.height / 2),
    width: RECT.width, height: RECT.height - Math.round(RECT.height / 2)
  }
  const topMean = regionMeanBGR(img, topHalf, scale)
  const bottomMean = regionMeanBGR(img, bottomHalf, scale)
  const bottomDiff = diffRegion(baseImg, img, bottomHalf, scale)
  record(
    'Q4', 'win.setShape() 能否与 transparent:true 共存？（裁掉下半部分）',
    shapeOk && bottomDiff.meanAbs < 8 ? '可共存，区域生效' : (shapeOk ? '未抛错但区域未生效' : '抛错'),
    { shapeOk, shapeErr, topMeanBGR: topMean, bottomMeanBGR: bottomMean, bottomDiffVsBaseline: bottomDiff }
  )

  // 复位
  try { win.setShape([]) } catch (e) { /* 记录在 Q4 */ }
  await sleep(400)

  // ---- Q5：resizable:false 是否仍响应程序化 setBounds？ ----
  const before = win.getBounds()
  win.setBounds({ x: before.x, y: before.y, width: 500, height: 360 })
  await sleep(400)
  const after = win.getBounds()
  record(
    'Q5', 'resizable:false 时程序化 setBounds 是否生效？',
    after.width === 500 && after.height === 360 ? '生效' : '未生效',
    { before, after }
  )

  // ---- Q6：restore() 之后透明度是否保持？ ----
  win.setBounds({ x: RECT.x, y: RECT.y, width: RECT.width, height: RECT.height })
  view.setBounds({ x: 0, y: 0, width: RECT.width, height: RECT.height })
  await view.webContents.loadURL('about:blank')
  await sleep(600)
  view.setBackgroundColor('#00000000')
  await sleep(400)
  win.minimize()
  await sleep(700)
  win.restore()
  await sleep(900)
  shot = await captureAll()
  img = shot.byDisplay.get(String(primary.id))
  d = diffRegion(baseImg, img, RECT, scale)
  record(
    'Q6', 'minimize → restore 后透明度是否保持？',
    d.meanAbs < 8 ? '保持' : '丢失（需要 reassert）',
    { diff: d, regionMeanBGR: regionMeanBGR(img, RECT, scale) }
  )

  // ---- Q7：API 可用性静态检查 ----
  record('Q7', '关键 API 可用性', '信息', {
    setShape: typeof win.setShape,
    setOpacity: typeof win.setOpacity,
    setIgnoreMouseEvents: typeof win.setIgnoreMouseEvents,
    setFocusable: typeof win.setFocusable,
    setSkipTaskbar: typeof win.setSkipTaskbar,
    setContentProtection: typeof win.setContentProtection,
    contentView_addChildView: typeof win.contentView?.addChildView,
    view_setVisible: typeof view.setVisible
  })

  // ---- Q8：主进程侧能否判断窗口是否可见 ----
  record('Q8', '窗口可见性查询 API', '信息', {
    isVisible: typeof win.isVisible === 'function' ? win.isVisible() : 'n/a',
    isMinimized: typeof win.isMinimized === 'function' ? win.isMinimized() : 'n/a',
    isAlwaysOnTop: typeof win.isAlwaysOnTop === 'function' ? win.isAlwaysOnTop() : 'n/a'
  })

  const outPath = path.join(__dirname, 'report.json')
  fs.writeFileSync(outPath, JSON.stringify({ display: { ...primary.size, scaleFactor: scale }, rect: RECT, results }, null, 2))
  console.log(`\n报告已写入 ${outPath}`)

  try { view.webContents.close() } catch (e) { /* ignore */ }
  win.destroy()
  app.quit()
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('spike 失败：', err)
    fs.writeFileSync(
      path.join(__dirname, 'report.json'),
      JSON.stringify({ error: String(err && err.stack || err), results }, null, 2)
    )
    app.exit(1)
  })
)
