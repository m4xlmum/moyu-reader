/**
 * 诊断：把命中了某个元素的 CSS 规则逐条列出来。
 *
 * 存在的理由是一次真实的串味。作用域样式会给**子组件的根元素**补上父组件的作用域
 * 属性，于是父组件里任何一条 `.类名[data-v-父]` 的规则都可能落到子组件头上。
 * 主题菜单的根元素当时带着 `cards` 这个类（`variant` 的值被当类名用），
 * 而 `cards` 正是当时那套世界根元素的类名——于是 `StartCards`（现已由 StartModern
 * 取代）里那条整页排版规则落在了菜单上：菜单横跨整幅页眉，旁边的标识被挤成两行。
 * 两个文件单独看都没有错，盯着它们猜是猜不出来的（见 docs/spike-findings.md Q10）。
 *
 * 如今 `variant` 取 `modern` / `terminal`，与两套世界根元素的类名依旧同名，
 * 这条陷阱还是活的——只是形态的传递改用了 `data-variant` 属性，撞不上了。
 *
 * 逐条 `matches` 一遍样式表，比猜快，也比翻 DevTools 方便——这里的窗口是不显示的。
 *
 * 用法：
 *   npx electron spike/which-rules.js paper .theme-menu .bar .wordmark
 *   npx electron spike/which-rules.js crt-green .term .status
 * 第一个参数是主题（决定渲染哪套世界），后面是要查的选择器。
 * 它只读不写；验证版面仍以 spike/preview.js 为准。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

ipcMain.on('preview:options', (event) => {
  event.returnValue = { mode: 'default', theme: process.argv[2] ?? 'paper' }
})

const SELECTORS = process.argv.slice(3)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 960,
    height: 540,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preview-preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  await win.loadFile(path.join(__dirname, '..', 'out', 'renderer', 'home.html'))
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const out = await win.webContents.executeJavaScript(`(() => {
    const dump = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return { sel, missing: true }
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const matched = []
      for (const sheet of document.styleSheets) {
        let rules = []
        try { rules = [...sheet.cssRules] } catch { continue }
        for (const rule of rules) {
          if (!rule.selectorText) continue
          // 伪类 / 伪元素去掉再匹配：matches() 不认它们
          const probe = rule.selectorText.replace(/::?[a-z-]+(\\([^)]*\\))?/g, '')
          const hit = (() => { try { return el.matches(probe) } catch { return false } })()
          if (!hit) continue
          const own = []
          for (const prop of ['padding', 'flex', 'width', 'height', 'color', 'background', 'font-size']) {
            if (rule.style[prop]) own.push(prop + ':' + rule.style[prop])
          }
          matched.push(rule.selectorText + ' { ' + own.join('; ') + ' }')
        }
      }
      return {
        sel,
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        class: el.className,
        attrs: [...el.attributes].map((a) => a.name),
        computed: { display: cs.display, padding: cs.padding, flex: cs.flex, color: cs.color },
        matched
      }
    }
    return ${JSON.stringify(SELECTORS)}.map(dump)
  })()`)
  console.log(JSON.stringify(out, null, 2))
  app.exit(0)
})
