/**
 * 起始页的命中测试：真去问「这一点上站的是谁」。
 *
 * 存在的理由：这一页此前所有的取证都是 `element.click()`——那是**直接调 DOM**，
 * 绕开了整条命中测试。于是「有东西盖在按钮上面」这一类毛病，探针一个都照不出来，
 * 而用户在真机上点的时候，点到的正是那个盖着的东西。
 *
 * `document.elementFromPoint()` 走的是真实命中测试（含 pointer-events、
 * z-index、覆盖层），因此它就是「用户这一下点到谁」这个问题的答案。
 * 对每一处可点的东西，问三件事：该是谁、点到的是谁、那一点上从上到下排着谁。
 *
 * 用法：
 *   npx electron spike/home-hit.js                     # 正文档区尺寸（960×540 的正文）
 *   npx electron spike/home-hit.js --width 1280 --height 720
 *   npx electron spike/home-hit.js --theme crt-green
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const args = process.argv
const num = (flag, fallback) => {
  const i = args.indexOf(flag)
  const value = i >= 0 ? Number(args[i + 1]) : NaN
  return Number.isFinite(value) ? value : fallback
}

const WIDTH = num('--width', 960)
const HEIGHT = num('--height', 540)
const themeIndex = args.indexOf('--theme')
const THEME = themeIndex >= 0 ? args[themeIndex + 1] : null

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 一处可点的东西：名字 + 选择器。
 *
 * 栏目键与行是**逐个**问的，不按选择器只问第一个：一列里有六栏、十几行，
 * 而「只有某一行被盖住」这种事只会出现在其中一个位置上。
 */
const PROBE = `(() => {
  const describe = (el) => {
    if (!el) return null
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean) : []
    return { tag: el.tagName.toLowerCase(), cls, text: (el.textContent || '').trim().slice(0, 12) }
  }

  const targets = []
  const add = (name, el) => {
    if (el) targets.push({ name, el })
  }

  add('输入框', document.querySelector('.prompt .field input'))
  document.querySelectorAll('.plates .plate').forEach((el) => {
    add('栏目:' + (el.dataset.plate || '?'), el)
  })
  document.querySelectorAll('.lines .line').forEach((el, i) => {
    add('行' + i + ':' + ((el.querySelector('.label') || {}).textContent || '').trim().slice(0, 8), el)
  })
  add('主题键', document.querySelector('.theme-menu .trigger'))

  const out = []
  for (const { name, el } of targets) {
    const r = el.getBoundingClientRect()
    const x = Math.round(r.x + r.width / 2)
    const y = Math.round(r.y + r.height / 2)
    const hit = document.elementFromPoint(x, y)
    const stack = document
      .elementsFromPoint(x, y)
      .slice(0, 4)
      .map(describe)
    /*
     * 判据：点到的东西必须是它自己、或者是它的后代。
     * 祖先不算——那正是「被盖住」的样子，也正是这一跑要找的东西。
     */
    const ok = hit === el || el.contains(hit)
    out.push({
      name,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      ok,
      hit: describe(hit),
      stack
    })
  }
  return out
})()`

/**
 * 假桥在模块作用域里同步问一次选项（`ipcRenderer.sendSync('preview:options')`），
 * 因此这个应答必须在开窗之前就挂好——晚一步，preload 拿不到任何东西，
 * 假桥建不出来，页面渲染出来的是一张空壳，而这一跑看起来只是「一处都点不到」。
 */
ipcMain.on('preview:options', (event) => {
  event.returnValue = {
    mode: 'default',
    maximized: false,
    theme: THEME ?? 'paper',
    openFile: null,
    presets: []
  }
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    backgroundColor: '#1b1f24',
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'home.html'))
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  await wait(1200)

  if (THEME) {
    // 走真实那条路换皮：点开菜单点一项（与 preview.js 的 --themes 同一手）
    const openMenu = `(() => {
      const trigger = document.querySelector('.theme-menu .trigger')
      if (trigger && trigger.getAttribute('aria-expanded') !== 'true') trigger.click()
    })()`
    await win.webContents.executeJavaScript(openMenu)
    await wait(300)
    const ids = await win.webContents.executeJavaScript(
      `[...document.querySelectorAll('.theme-menu .panel .item')].map((el) => el.dataset.theme || el.textContent.trim())`
    )
    console.log(`THEMES ${JSON.stringify(ids)}`)
    const at = ids.indexOf(THEME)
    if (at >= 0) {
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.theme-menu .panel .item')[${at}].click()`
      )
      await wait(500)
    } else {
      console.log(`THEME_BAD 界面上的主题里没有 ${THEME}`)
    }
  }

  const results = await win.webContents.executeJavaScript(PROBE)
  const bad = results.filter((r) => !r.ok)
  for (const r of results) {
    const mark = r.ok ? '✓' : '✗'
    const hit = r.hit ? `${r.hit.tag}.${r.hit.cls.join('.')}` : 'null'
    console.log(`HIT ${mark} ${r.name} @${r.box.x},${r.box.y} ${r.box.w}×${r.box.h} → ${hit}`)
    if (!r.ok) {
      console.log(
        `    叠着：${r.stack.map((s) => (s ? `${s.tag}.${s.cls.join('.')}` : 'null')).join(' / ')}`
      )
    }
  }
  console.log(`HIT_BAD ${JSON.stringify(bad.map((r) => r.name))}`)

  /*
   * 真按一下。
   *
   * 命中测试说了「这一点上站着谁」，但没说过**真按下去界面接不接得住**。
   * 这里的每一下都走 Chromium 的输入通道（webContents.sendInputEvent），
   * 于是鼠标按下、松开、click 整套事件是真的，与用户那一下只差一个屏幕。
   * 记的是**页面收到的 click**（capture 阶段挂在 document 上，谁被点中都会记），
   * 以及栏目线自己变没变——后者是「换栏」这一步的直接后果。
   */
  await win.webContents.executeJavaScript(`(() => {
    window.__clicks = []
    document.addEventListener('click', (event) => {
      const el = event.target
      window.__clicks.push({
        tag: el && el.tagName ? el.tagName.toLowerCase() : null,
        cls: el && typeof el.className === 'string' ? el.className.trim() : null,
        text: (event.target && event.target.textContent || '').trim().slice(0, 10)
      })
    }, true)
  })()`)

  const press = async (x, y) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
    await wait(60)
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    await wait(60)
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await wait(300)
  }

  const atOf = (name) => {
    const r = results.find((x) => x.name === name)
    return r ? { x: r.box.x + Math.round(r.box.w / 2), y: r.box.y + Math.round(r.box.h / 2) } : null
  }

  const plateAt = atOf('栏目:quiz')
  if (plateAt) {
    await press(plateAt.x, plateAt.y)
    const state = await win.webContents.executeJavaScript(
      `JSON.stringify({
        点到的: window.__clicks,
        现在哪一栏: document.querySelector('.plate.on')?.dataset.plate ?? null
      })`
    )
    console.log(`PRESS 栏目:quiz @${plateAt.x},${plateAt.y} → ${state}`)
  }

  const rowAt = atOf('行2:起点中文网') || atOf(results.find((r) => r.name.startsWith('行'))?.name)
  if (rowAt) {
    await win.webContents.executeJavaScript('window.__clicks = []')
    await press(rowAt.x, rowAt.y)
    const state = await win.webContents.executeJavaScript(`JSON.stringify(window.__clicks)`)
    console.log(`PRESS 行 @${rowAt.x},${rowAt.y} → ${state}`)
  }

  console.log(`HIT_DONE`)

  app.exit(bad.length ? 1 : 0)
})

/*
 * 抛出去要看得见。
 *
 * 无头跑一遍看不见渲染进程的调试台，主进程这一侧若静悄悄地挂住，
 * 上面那些 HIT 一行都不会出现，而「一行都没有」看起来跟「一处都没问题」
 * 完全不一样，却同样没有结论。挂住一次已经吃过这个亏。
 */
process.on('unhandledRejection', (err) => {
  console.error(`HIT_ERROR ${err && err.stack ? err.stack : String(err)}`)
  app.exit(2)
})
