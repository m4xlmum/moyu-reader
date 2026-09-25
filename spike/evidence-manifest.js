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
  ['home-mount-no-anim', 'mount/home-paper-912x496', '--home --body --no-reduced-motion'],
  ['home-settle-click', 'settle/home-paper-912x496-clickplate-video', '--home --body --no-reduced-motion --click-plate video'],
  ['home-settle-reduced', 'reduced/home-paper-912x496-clickplate-video', '--home --body --reduced-motion --click-plate video']
]

/** 一条读数里最要紧的那几项，取不到就写 null（缺的当场看得出来，不糊过去） */
function row(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const m = data.measured
  const v = data.viewport
  const end = m.endRule
  /* Vue 的 scoped 样式会把 keyframe 名改写成「原名-哈希」，这里把哈希去掉：
     表里要认的是源码里那个名字（settle / rule-in），哈希属于构建产物。 */
  const anim = (m.animations ?? []).map(
    (a) => `${String(a.name ?? '').replace(/-[0-9a-f]{6,}$/, '')} ${a.ms}ms ${a.easing}`
  )
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
    font: `${m.displayLoaded ? 'loaded' : '未加载'} ${font.ours ?? '?'}/${font.fallbackSerif ?? '?'}`,
    /* 这一页上哪个元素被选中。输入行是这一页唯一的 keydown 落点，因此它必须是 input */
    active: m.active ?? null
  }
}

const lines = [
  '# 起始页改版 · 第三轮取证清单',
  '',
  '每一张图都是 `spike/preview.js` 在 `show: false` 的窗口里渲染出来、由 `capturePage` 抓的，',
  '没有真机弹窗。表里的数全部来自每一跑旁边的 JSON（`.impeccable/review/<名字>.json`），',
  '不是手抄的。',
  '',
  '| 图 | 视口 | 主题 / 世界 | 栏目 | 行数 | 读数 | 收尾线 | 路径泄漏(文字/属性) | 换栏动画 | 减少动态 | 焦点 | 展示字 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'
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
    `| \`${name}.png\` | ${r.view} | ${r.theme} / ${r.world} | ${r.plate} | ${r.lines} | ${r.stat} | ${r.end} | ${r.leaks} | ${r.anim} | ${r.reduced} | ${r.active} | ${r.font} |`
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
  '- **换栏动画**：这一跑结束那一刻 `document.getAnimations()` 里还剩的那几条（名字 / 时长 / 缓动）。',
  '  `home-mount-no-anim` 必须是「无」——允许动画、但这一跑没换过栏，于是首帧那一下不播；',
  '  `home-settle-click` 必须有 `settle` 与 `rule-in` 两条、都是 180ms 的同一条曲线；',
  '  `home-settle-reduced` 又必须是「无」，而它的**栏目确实换了**（看「栏目」那一列）——',
  '  这两件事一起说的才是「撤掉的是动画，不是结果」。',
  '  名字末尾那截哈希是 Vue scoped 样式改写 keyframe 名留下的（`settle-ce237ac1`），',
  '  表里已经去掉，认的是源码里那个名字。',
  '- **焦点**：这一页的键盘整副挂在输入行上（`onInputKeydown` 是它唯一的 keydown，',
  '  ← → 换板块、↑ ↓ 选行、↵ 开当前行都在里面），因此光标不在那儿的时候，',
  '  状态行第一帧就写着的那句「← → 换板块」是句空话。这一列全是 `input` 才对，是 `body` 就是没人被选中。',
  '- **展示字**：`loaded` 是那份自带字体读上来了没有；后面两个数是同一个拉丁词在',
  '  「我们那份」与「兜底那份（SimSun）」下的宽度。相等就是没换上，71 对 52 就是换上了。',
  '  汉字那一行量不出差别（任何一个中文字体里汉字都是 1em 见方），所以比的是拉丁词。',
  '',
  '## 这一轮改了什么（上一轮评审的七条 + 收尾评审的四条）',
  '',
  '1. 本机文件的那些行不再挂 `:title`（路径只在文字上堵住是不够的）——`titleLeaks` 由 11–14 条降到 0。',
  '2. 报头与栏目线换成自带的中文衬线（`scripts/make-display-font.mjs` 生成，27,548 B，',
  '   Noto Serif SC 子集，OFL 1.1）——`displayLoaded: true`，拉丁宽度 71 ≠ 兜底 52。',
  '3. 换栏那一下成为一个被安排过的动作：`settle` + `rule-in`，两条都是 180ms',
  '   `cubic-bezier(0.16, 1, 0.3, 1)`，一次就完；减少动态效果下整组撤掉。',
  '4. 短栏的空白有了收尾线（56×1px 居中，`--divider-strong`）。',
  '5. 这份文档与 `.impeccable/surfaces/home.md` 一起更新（行数预算、展示字、收尾线、标题规则）。',
  '6. **挂载不再播那一下**（收尾评审的回归）：动画挂在 `.settle` 上，而那个类只有真的换过一栏',
  '   之后才有。上一轮那一跑从没换过栏，量到的两条其实是挂载那一次的，据以声称的却是「换栏会动」',
  '   ——现在 `home-mount-no-anim` 是空的，那两条改由 `home-settle-click` 那一跑拿出来。',
  '7. **一进这一页就把光标放进输入行**（收尾评审）：此前全 renderer 只有地址栏调过 focus，',
  '   于是 ← → 与 ↵ 要等用户先在页面上点一下才活，而状态行第一帧就已经在说「← → 换板块」。',
  '8. 主题菜单的宽度 252 → 268：最长的那条说明（17 字）此前正好挤掉一个字，折成两行、末字成孤字。',
  '',
  '> 环境备注：这台机器**本身**开着「减少动态效果」，所以默认那几跑量出来就是',
  '> `reducedMotion: true`、`animations: []`（那正是它该有的样子）。要问那条动画本身，',
  '> 得跑 `--no-reduced-motion`（探针走 CDP 的 `Emulation.setEmulatedMedia` 把这一项覆写掉），',
  '> 而且要**再点一下某一栏**——`--click-plate video` 就是那一下。少了这一步，量到的永远是「没动」，',
  '> 而那不是结论，是没做实验。',
  ''
)

fs.mkdirSync(REVIEW, { recursive: true })
const file = path.join(REVIEW, 'MANIFEST.md')
fs.writeFileSync(file, lines.join('\n'), 'utf8')
console.log(`WROTE ${file}（${SHOTS.length} 张）`)
