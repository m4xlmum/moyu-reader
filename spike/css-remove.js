/**
 * 探针：`removeInsertedCSS` 到底撤不撤得掉。
 *
 * 起因：离线阅读正文的透明度靠 `insertCSS('html{opacity:.4!important}', {cssOrigin:'user'})`
 * 注入，拉回 100% 时 `removeInsertedCSS(key)` **不报错、也不生效**——
 * 页面自己算出来的 opacity 还是 0.4（见 live-app.js 的 A12）。
 * 这里把「注入 + 撤掉」这一对原语单独拿一张网页量一遍，分清是
 *   · user origin 撤不掉，
 *   · 还是「同一页上先插过别的表」之后撤不掉，
 *   · 还是 !important 的缘故。
 *
 * 窗口从不显示（show: false）。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow } = require('electron')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const 页面 = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<html><body style="background:#fff;color:#000">摸鱼</body></html>'
)}`

async function 量(wc, 属性) {
  return await wc.executeJavaScript(`getComputedStyle(document.documentElement).${属性}`)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300 })
  const wc = win.webContents
  await wc.loadURL(页面)
  await delay(300)

  const 表 = []
  const 报 = (名, ...值) => {
    表.push(`${名}：${值.join('  ')}`)
    console.log(`CSS-REMOVE ${名} ${值.join(' ')}`)
  }

  // ---- 1. 默认来源，插一条再撤掉
  {
    const k = await wc.insertCSS('html { opacity: 0.4 }')
    const 插后 = await 量(wc, 'opacity')
    await wc.removeInsertedCSS(k)
    await delay(200)
    const 撤后 = await 量(wc, 'opacity')
    报('1 默认来源', `key=${k}`, `插后=${插后}`, `撤后=${撤后}`)
  }

  // ---- 2. user 来源（正文那条走的就是这条路），插一条再撤掉
  {
    const k = await wc.insertCSS('html { opacity: 0.4 }', { cssOrigin: 'user' })
    const 插后 = await 量(wc, 'opacity')
    await wc.removeInsertedCSS(k)
    await delay(200)
    const 撤后 = await 量(wc, 'opacity')
    报('2 user 来源', `key=${k}`, `插后=${插后}`, `撤后=${撤后}`)
  }

  // ---- 3. user 来源 + !important（与正文那条逐字一致）
  {
    const k = await wc.insertCSS('html { opacity: 0.4 !important; }', { cssOrigin: 'user' })
    const 插后 = await 量(wc, 'opacity')
    await wc.removeInsertedCSS(k)
    await delay(200)
    const 撤后 = await 量(wc, 'opacity')
    报('3 user+important', `key=${k}`, `插后=${插后}`, `撤后=${撤后}`)
  }

  // ---- 4. 同一页上先插过一张别的表（透明底那条），再插正文这条、撤它
  {
    const 底 = await wc.insertCSS('html, body { background: transparent !important; }', {
      cssOrigin: 'user'
    })
    const k = await wc.insertCSS('html { opacity: 0.4 !important; }', { cssOrigin: 'user' })
    const 插后 = await 量(wc, 'opacity')
    await wc.removeInsertedCSS(k)
    await delay(200)
    const 撤后 = await 量(wc, 'opacity')
    const 底还在 = await 量(wc, 'backgroundColor')
    报('4 先插过别的表', `底=${底} key=${k}`, `插后=${插后}`, `撤后=${撤后}`, `底色=${底还在}`)
  }

  // ---- 5. 撤掉之后重新插一条：新的一条生效吗（key 会不会撞上）
  {
    const k = await wc.insertCSS('html { opacity: 0.7 !important; }', { cssOrigin: 'user' })
    const 插后 = await 量(wc, 'opacity')
    await wc.removeInsertedCSS(k)
    await delay(200)
    const 撤后 = await 量(wc, 'opacity')
    报('5 再插一条再撤', `key=${k}`, `插后=${插后}`, `撤后=${撤后}`)
  }

  console.log('\n' + 表.join('\n'))
  app.exit(0)
})
