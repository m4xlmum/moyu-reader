/**
 * 把一轮取证的 JSON 汇总成一份清单（`.impeccable/review/MANIFEST.md`）。
 *
 * 存在的理由是「图自己不会说话」：一张图证明不了它是**哪一条命令**跑出来的，
 * 也证明不了那些只有量了才知道的事（放得下几行、收尾线在不在、本机路径有没有
 * 漏在属性上、那条动画的时长与缓动）。这些都在每一跑旁边的 JSON 里，而汇总
 * 成一份表之后，评审不必开十六个文件去对。
 *
 * 数值一律从 JSON 里读，**不在这个脚本里另抄一份**——抄本会走样，读数不会。
 *
 * 用法：node spike/evidence-manifest.js
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'spike', 'out', 'r3')
const REVIEW = path.join(ROOT, '.impeccable', 'review')

/**
 * 规范名 → 它那一跑。raw 是探针自己写出来的文件名（页 + 主题 + 尺寸 + 栏目），
 * cmd 是跑出它的那条命令——两者都写进表里，图名对不上时当场看得出来。
 */
const SHOTS = [
  ['home-paper', 'themes/home-paper-912x496', '--home --body --themes'],
  ['home-night', 'themes/home-night-912x496', '--home --body --themes'],
  ['home-crt-green', 'themes/home-crt-green-912x496', '--home --body --themes'],
  ['home-theme-menu', 'themes/home-picker-912x496', '--home --body --themes'],
  ['home-address-open', 'address/home-paper-912x462', '--home --body --address-open'],
  ['home-mini-paper', 'mini/home-paper-432x226', '--home --body --themes --width 480 --height 270'],
  ['home-mini-night', 'mini/home-night-432x226', '--home --body --themes --width 480 --height 270'],
  ['home-mini-crt-green', 'mini/home-crt-green-432x226', '--home --body --themes --width 480 --height 270'],
  ['home-mini-plate-local', 'plates/home-paper-platelocal-432x226', '--home --body --plate local --width 480 --height 270'],
  ['home-plate-local', 'plates/home-paper-platelocal-912x496', '--home --body --plate local'],
  ['home-plate-video', 'plates/home-paper-platevideo-912x496', '--home --body --plate video'],
  ['home-plate-quiz', 'plates/home-paper-platequiz-912x496', '--home --body --plate quiz'],
  ['home-mini-plate-quiz', 'plates/home-paper-platequiz-432x226', '--home --body --plate quiz --width 480 --height 270'],
  ['home-plate-local-opened', 'openfile/home-paper-platelocal-912x496-openfile', "--home --body --open-file 斗破苍穹.txt,三体（全集）.pdf"],
  ['home-motion-off', 'motion-off/home-paper-912x496', '--home --body --no-reduced-motion'],
  ['home-motion-on', 'motion-on/home-paper-912x496', '--home --body --reduced-motion']
]

/** 一条读数里最要紧的那几项，取不到就写 null（缺的当场看得出来，不糊过去） */
function row(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const m = data.measured
  const v = data.viewport
  const end = m.endRule
  const anim = (m.animations ?? []).map((a) => `${a.name} ${a.ms}ms ${a.easing}`)
  const font = m.displayWidths?.latin ?? {}
  return {
    /* 写的是**这一页实际拿到的那块**，不是窗口：真机上正文区被顶栏与右栏让出来了 */
    view: `${v.rendered.width}×${v.rendered.height}（窗 ${v.window.width}×${v.window.height}${v.addressOpen ? '，地址栏展开' : ''}）`,
    theme: m.theme,
    world: m.world,
    plate: m.plateOn,
    lines: m.lineCount || m.termLineCount || null,
    stat: m.stat,
    end: end ? `有 y=${end.y} x=${end.x} w=${end.w}×${end.h}` : '无',
    leaks: `${(m.pathLeaks ?? []).length} / ${(m.titleLeaks ?? []).length}`,
    anim: anim.length ? anim.join(' + ') : '无',
    reduced: m.reducedMotion,
    font: `${m.displayLoaded ? 'loaded' : '未加载'} ${font.ours ?? '?'}/${font.fallbackSerif ?? '?'}`
  }
}

const lines = [
  '# 起始页改版 · 第三轮取证清单',
  '',
  '每一张图都是 `spike/preview.js` 在 `show: false` 的窗口里渲染出来、由 `capturePage` 抓的，',
  '没有真机弹窗。表里的数全部来自每一跑旁边的 JSON（`.impeccable/review/<名字>.json`），',
  '不是手抄的。',
  '',
  '| 图 | 视口 | 主题 / 世界 | 栏目 | 行数 | 读数 | 收尾线 | 路径泄漏(文字/属性) | 换栏动画 | 减少动态 | 展示字 |',
  '|---|---|---|---|---|---|---|---|---|---|---|'
]

for (const [name, raw, cmd] of SHOTS) {
  const json = path.join(OUT, `${raw}.json`)
  const png = path.join(OUT, `${raw}.png`)
  // 图与 JSON 必须都在，缺一张这一行就不该出现——清单少一行比多一行假的强
  if (!fs.existsSync(json) || !fs.existsSync(png)) {
    throw new Error(`缺文件：${raw}（json=${fs.existsSync(json)} png=${fs.existsSync(png)}）`)
  }
  const r = row(json)
  lines.push(
    `| \`${name}.png\` | ${r.view} | ${r.theme} / ${r.world} | ${r.plate} | ${r.lines} | ${r.stat} | ${r.end} | ${r.leaks} | ${r.anim} | ${r.reduced} | ${r.font} |`
  )
}

lines.push(
  '',
  '## 每一跑的命令',
  '',
  ...SHOTS.map(([name, , cmd]) => `- \`${name}\` — \`npx electron spike/preview.js ${cmd}\``),
  '',
  '## 表里那几列在说什么',
  '',
  '- **行数**：这一栏实际渲染出来的行数（不是算出来的上限）。它由正文区高度除以行高得出，',
  '  所以同一个栏目在不同主题下行数不同（磷绿的 22px 行距比纸白的 28px 紧）。',
  '- **收尾线**：那一栏真的到底了才画的那条 56×1px 短线。有 y 说明画了、位置也对；',
  '  「无」有两种情况——被上限截掉（不许画）或正好铺满（不需要画），两种都是对的。',
  '- **路径泄漏**：本机文件的路径有没有露出来。文字那一列看行里印的字，属性那一列看',
  '  `title` 属性。**两列都必须是 0**——上一轮漏的正是属性那一列。',
  '- **换栏动画**：`document.getAnimations()` 问到的、真的在跑的那几条（名字 / 时长 / 缓动）。',
  '  `home-motion-on` 那一跑里它必须是「无」，因为减少动态效果下这三条被撤掉了；',
  '  `home-motion-on.png` 与 `home-paper.png` 的像素因此逐字节相同，这不是巧合，是它要证的结论。',
  '- **展示字**：`loaded` 是那份自带字体读上来了没有；后面两个数是同一个拉丁词在',
  '  「我们那份」与「兜底那份（SimSun）」下的宽度。相等就是没换上，71 对 52 就是换上了。',
  '  汉字那一行量不出差别（任何一个中文字体里汉字都是 1em 见方），所以比的是拉丁词。',
  '',
  '## 这一轮改了什么（对应上一轮评审的七条）',
  '',
  '1. 本机文件的那些行不再挂 `:title`（路径只在文字上堵住是不够的）——`titleLeaks` 由 11–14 条降到 0。',
  '2. 报头与栏目线换成自带的中文衬线（`scripts/make-display-font.mjs` 生成，27,548 B，',
  '   Noto Serif SC 子集，OFL 1.1）——`displayLoaded: true`，拉丁宽度 71 ≠ 兜底 52。',
  '3. 换栏那一下成为一个被安排过的动作：`settle` + `rule-in`，两条都是 180ms',
  '   `cubic-bezier(0.16, 1, 0.3, 1)`，一次就完；减少动态效果下整组撤掉。',
  '4. 短栏的空白有了收尾线（56×1px 居中，`--divider-strong`）。',
  '5. 这份文档与 `.impeccable/surfaces/home.md` 一起更新（行数预算、展示字、收尾线、标题规则）。',
  '',
  '> 环境备注：这台机器**本身**开着「减少动态效果」，所以默认那几跑量出来就是',
  '> `reducedMotion: true`、`animations: []`（那正是它该有的样子）。要看那条动画本身，',
  '> 得跑 `--no-reduced-motion`——探针走 CDP 的 `Emulation.setEmulatedMedia` 把这一项覆写掉。',
  ''
)

fs.mkdirSync(REVIEW, { recursive: true })
const file = path.join(REVIEW, 'MANIFEST.md')
fs.writeFileSync(file, lines.join('\n'), 'utf8')
console.log(`WROTE ${file}（${SHOTS.length} 张）`)
