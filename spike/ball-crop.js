/**
 * 探针：裁剪弹窗点「确定」导出的，到底是个什么东西。
 *
 * 「拖动 + 缩放 → 导出 128×128」这一段是纯几何，也是这一版里最容易写错的地方：
 * 取景框、弹窗里那枚预览球、导出用的离屏画布，三处各自缩放一次，
 * 任何一处抄错都只在图上看得出来，而这三张图平时都躺在弹窗里。
 *
 * 因此这里把一个**非默认**的变换真的驱动出来（先缩到 2.2 倍，再往左上拖），
 * 再点「确定」，然后把存下来的那一份捞出来写成文件——对着看的就是它，
 * 顺带断言它确实是一张 128×128 的 WebP、确实有内容。
 *
 * 驱动用合成的 PointerEvent，与 spike/preview.js 的 --drag-probe 同一条路子：
 * 窗口是隐藏的、不抢焦点，系统光标一动不动。
 *
 * 跑法：npx electron spike/ball-crop.js
 * 产出：spike/out/ball-crop.png（弹窗原样）、spike/out/ball-export.webp（导出结果）
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

/** 用来当「用户上传的那张图」。宽高比不是 1:1，正好试铺满时的裁切 */
const SOURCE = path.join(__dirname, '..', 'assets', 'banner.webp')
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/** 与 @shared/constants 的两条上限一致（这里只做对照，不重复实现校验） */
const BALL_IMAGE_SIZE = 128
const BALL_IMAGE_MAX_BYTES = 512 * 1024

/** 要驱动的变换：先放大到 2.2 倍，再从取景框中心往左上拖 */
const ZOOM = 2.2
const DRAG = { dx: -55, dy: -35 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function record(id, question, verdict, detail) {
  results.push({ id, question, verdict, detail })
  console.log(`[${id}] ${verdict} — ${question}`)
  if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`)
}

/**
 * 驱动弹窗的那一段脚本。
 *
 * 点击与拖动之间要留时间：Vue 的 DOM 更新在下一帧，先点的「重新裁剪」渲染出弹窗
 * 之后，才轮得到去摸它里面的取景框。指针事件用合成的（见 preview.js 里那段说明），
 * setPointerCapture 对合成事件会抛 NotFoundError，界面自己兜住了。
 */
const drive = (zoom, drag) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (sel) => {
    const el = document.querySelector(sel)
    if (!el) throw new Error('找不到 ' + sel)
    el.click()
  }

  // 1. 选「自定义」那一格，再点它下面那排里的「重新裁剪」
  click('.ball-icons .ball-chip:last-of-type')
  await sleep(320)
  click('.ball-icon-ops .themes:nth-child(2) button')
  await sleep(520)

  const stage = document.querySelector('.stage')
  const img = document.querySelector('.stage img')
  if (!stage || !img) throw new Error('裁剪弹窗没打开')

  // 2. 拉缩放滑块（走界面自己那条 @input 处理）
  const range = document.querySelector('.zoom-range')
  range.value = String(${zoom})
  range.dispatchEvent(new Event('input', { bubbles: true }))
  await sleep(200)

  // 3. 拖图：按下 → 移动 → 松开
  const r = stage.getBoundingClientRect()
  const base = {
    bubbles: true, cancelable: true, composed: true,
    button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1
  }
  const at = (x, y) => ({ ...base, clientX: x, clientY: y, screenX: x, screenY: y })
  const from = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  const to = { x: from.x + ${drag.dx}, y: from.y + ${drag.dy} }
  stage.dispatchEvent(new PointerEvent('pointerdown', at(from.x, from.y)))
  stage.dispatchEvent(new PointerEvent('pointermove', at(to.x, to.y)))
  stage.dispatchEvent(new PointerEvent('pointerup', at(to.x, to.y)))
  await sleep(250)

  const style = getComputedStyle(img)
  return {
    stage: { w: Math.round(r.width), h: Math.round(r.height) },
    zoom: range.value,
    img: { left: img.style.left, top: img.style.top, width: img.style.width, height: img.style.height },
    transform: style.transform,
    // 预览球那一份的缩放：它必须与导出用同一套数字
    previewInner: getComputedStyle(document.querySelector('.preview-inner')).transform
  }
})()`

/**
 * 导出结果的自查：尺寸、体积、有没有内容。
 *
 * 在页面里解这张图而不是在主进程用 nativeImage：WebP 由 Chromium 解，
 * 而「应用自己能不能把这张图显示出来」也正是要看的一件事。
 */
const inspect = (dataUrl) => `(async () => {
  const img = new Image()
  img.src = ${JSON.stringify(dataUrl)}
  try {
    await img.decode()
  } catch (error) {
    return { decodable: false, error: String(error && error.message) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let sum = 0
  let opaque = 0
  const seen = new Set()
  for (let i = 0; i < px.length; i += 4) {
    sum += (px[i] + px[i + 1] + px[i + 2]) / 3
    if (px[i + 3] > 250) opaque += 1
    // 抽样数一数颜色种类：整块纯色（导出画歪了、或者根本没画上）会是个很小的数
    if (i % 64 === 0) seen.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2])
  }
  const total = px.length / 4
  return {
    decodable: true,
    size: { w: img.naturalWidth, h: img.naturalHeight },
    meanLuma: Math.round(sum / total),
    opaqueRatio: +(opaque / total).toFixed(3),
    distinctColors: seen.size
  }
})()`

/** 主进程这一侧的出口：假的桥把 set() 收到的东西报过来（见 preview-preload.js） */
let storedImage = null
let setCount = 0
ipcMain.on('preview:ballImage', (_event, dataUrl) => {
  storedImage = dataUrl
  setCount += 1
})

ipcMain.on('preview:options', (event) => {
  const mime = MIME_BY_EXT[path.extname(SOURCE).toLowerCase()]
  event.returnValue = {
    mode: 'default',
    theme: 'paper',
    tabs: 0,
    bgAlpha: 1,
    // 与用户在设置页里选「自定义」之后的那一档一致
    ballIcon: 'custom',
    ballFit: 'cover',
    ballImage: `data:${mime};base64,${fs.readFileSync(SOURCE).toString('base64')}`
  }
})

const outDir = path.join(__dirname, 'out')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 960,
    height: 780,
    show: false,
    frame: false,
    backgroundColor: '#1b1f24',
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'settings.html'))
  await sleep(1200)
  fs.mkdirSync(outDir, { recursive: true })

  // ---- Q1：驱动变换，看界面自己算出来的那几个数字 ----
  const driven = await win.webContents.executeJavaScript(drive(ZOOM, DRAG))
  record('Q1', '缩放与拖动之后，取景框里那张图的实测几何', '信息', driven)

  // 截图放在「确定」之前：存下来的是弹窗当时的样子，与导出的那一份对着看
  await win.webContents.executeJavaScript(
    `Promise.race([
       new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
       new Promise((r) => setTimeout(r, 500))
     ])`
  )
  await win.webContents.capturePage()
  await sleep(150)
  const shot = await win.webContents.capturePage()
  const shotPath = path.join(outDir, 'ball-crop.png')
  fs.writeFileSync(shotPath, shot.toPNG())
  console.log(`WROTE ${shotPath}`)

  // ---- Q2：点「确定」，导出 ----
  const confirmed = await win.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const btn = document.querySelector('.cropper .btn.primary')
    if (!btn) throw new Error('找不到「确定」')
    btn.click()
    await sleep(500)
    return {
      // 弹窗关掉、自定义那一格选上，才说明这一路走完了
      cropperOpen: !!document.querySelector('.cropper'),
      customSelected: !!document.querySelector('.ball-icons .ball-chip:last-of-type.on')
    }
  })()`)
  record(
    'Q2',
    '点「确定」之后弹窗关掉、自定义那一格被选中',
    confirmed.cropperOpen === false && confirmed.customSelected ? '是' : '否',
    confirmed
  )

  if (!storedImage) {
    record('Q3', '导出的图被交回主进程（ballIcon.set）', '没有', { setCount })
  } else {
    const head = storedImage.slice(0, 24)
    record('Q3', '导出的图被交回主进程（ballIcon.set）', head === 'data:image/webp;base64,U' ? '是，WebP' : '是，但不是 WebP', {
      setCount,
      prefix: head,
      chars: storedImage.length,
      maxChars: BALL_IMAGE_MAX_BYTES,
      withinLimit: storedImage.length <= BALL_IMAGE_MAX_BYTES
    })

    const stats = await win.webContents.executeJavaScript(inspect(storedImage))
    record(
      'Q4',
      `导出的图应当是 ${BALL_IMAGE_SIZE}×${BALL_IMAGE_SIZE} 且有内容`,
      stats.decodable && stats.size.w === BALL_IMAGE_SIZE && stats.size.h === BALL_IMAGE_SIZE && stats.distinctColors > 20
        ? '是'
        : '不对',
      stats
    )

    const exportPath = path.join(outDir, `ball-export.webp`)
    fs.writeFileSync(exportPath, Buffer.from(storedImage.split(',')[1], 'base64'))
    console.log(`WROTE ${exportPath}`)
  }

  fs.writeFileSync(
    path.join(outDir, 'ball-crop.json'),
    JSON.stringify({ source: SOURCE, zoom: ZOOM, drag: DRAG, driven, results }, null, 2),
    'utf8'
  )

  app.exit(0)
})

app.on('window-all-closed', () => app.quit())
