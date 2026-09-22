/**
 * 截屏工具：把主显示器当前画面写成 PNG。
 *
 * 用途是在无法目视的情况下检查窗口渲染结果。
 * Electron 自带 PNG 编码（nativeImage.toPNG），因此这里不需要自己写编码器。
 *
 * 运行：npx electron spike/capture.js <输出路径>
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app, desktopCapturer, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const out = process.argv[2] || path.join(__dirname, 'capture.png')

app.whenReady().then(async () => {
  try {
    const display = screen.getPrimaryDisplay()
    const scale = display.scaleFactor
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale)
      }
    })
    const src = sources.find((s) => s.display_id === String(display.id)) || sources[0]
    if (!src) throw new Error('未能获取屏幕源')
    fs.writeFileSync(out, src.thumbnail.toPNG())
    console.log(`已写入 ${out} (${src.thumbnail.getSize().width}x${src.thumbnail.getSize().height})`)
  } catch (err) {
    console.error('截屏失败：', err)
    app.exit(1)
    return
  }
  app.quit()
})
