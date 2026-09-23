# Spike 结论：Windows 透明窗口合成行为

在 Windows 11（1920×1080，scaleFactor=1）上用 Electron 44.4.3 实测得出。
脚本见仓库根目录 `spike/index.js`，运行 `npx electron spike/index.js` 可在本机复现
（它会自行截屏并比对像素，不依赖肉眼观察）。

这些结论直接决定了 `src/main/services/windowSurface.ts` 的实现方式。

## 结论

| # | 问题 | 结果 | 影响 |
|---|---|---|---|
| Q1 | `WebContentsView` 不设背景色 | **不透明，绘制为纯白** | 每个视图都必须调用 `setBackgroundColor('#00000000')` |
| Q2 | 设置 `#00000000` 后 | **像素级完全透明**（与桌面基线差值 0） | 透明方案成立 |
| Q3 | `transparent:true` 窗口上 `setOpacity(0.5)` | **正常混合**，实测与理论值总偏差 1 | 两条合成路径**可以**共存 |
| Q4 | `setShape()` 与 `transparent:true` | **完美共存**，裁掉区域与桌面基线差值 0 | `setShape` 可作为命中区域的主策略 |
| Q5 | `resizable:false` 下程序化 `setBounds` | 生效 | 无需开启用户缩放也能改窗口矩形（开启用户缩放会破坏透明） |
| Q6 | `minimize()` → `restore()` | 透明度保持 | 仍需 reassert 以应对 DPI 切换 |
| Q7 | `setShape` / `setOpacity` / `setIgnoreMouseEvents` / `setFocusable` / `setSkipTaskbar` / `setContentProtection` / `contentView.addChildView` / `view.setVisible` | 全部可用 | 无 API 缺失 |
| Q8 | 在 `'closed'` 事件里读 `win.id` / `win.getBounds()` | **抛 `Object has been destroyed`** | 窗口销毁后才触发 `'closed'`，此时只有 `win.isDestroyed()` 还能读；id 要在建窗口时就记下来。见 `spike/destroyed.js` |
| Q9 | 往自家页面（起始页 / 系统设置）注入「背景透明」 | **写在 `html, body` 上的底色被抹掉**，透明窗口里露出桌面 | 注入的是 user origin，层叠顺序里压过作者样式表（`!important` 也压得过）。底板因此要另画一层（起始页 `.page`、系统设置 `.layout`），且自家页面根本不该被注入网页样式。见 `spike/ownpage-bg.js` |
| Q10 | 子组件根元素带父组件的作用域属性，父组件里一条 `.类名[data-v-父]` 的规则会不会落到子组件头上 | **会**。`variant` 的值被当类名用（`cards` / `terminal`），正好撞上当时那套世界根元素的类名，主题菜单于是被整页排版规则排了一遍：标识被挤成两行、菜单横跨整幅页眉 | 给子组件传形态用属性（`data-variant`）而不是类名。逐条 `matches` 查串味：`spike/which-rules.js` |
| Q11 | 在 `show: false` 的窗口里连续改状态再 `capturePage()` | **抓到的是上一帧**（截图与同一时刻 DOM 对不上） | 隐藏窗口的合成帧晚一拍。抓图前先等两帧 `requestAnimationFrame`，并丢弃一次抓取。见 `spike/preview.js` 的 `shoot()` |
| Q12 | 顶栏标签条放不下时 `display: none` 让位 | **会抖**：藏起来之后量出来是 0，于是又判成「放得下」→ 显示 → 又放不下（`display: none` 的元素量不出宽度是必然的，由此推出的来回翻是推演——无头抓图抓不到这种帧间抖动，能抓到的只是「测出来的几何对不对」） | 让位时用 `position: absolute; visibility: hidden`：离开流（不占宽度、不挤走后面的按钮）但仍能量出自然宽度。「容量」与「需求」两把尺子在两态下都成立。见 `chrome/TabStrip.vue`，验证用 `spike/preview.js --tabs N --resize WxH` |
| Q13 | 整条标签条 `visibility: hidden` 之后，里面当前那一格的关闭键还画不画 | **照画**。`visibility` 可继承，但后代能把它改回去，而 `.tab.on .x` 正写着 `visibility: visible`——于是让位状态下，下拉按钮右边凭空多一个孤零零的 ✕（还能被 Tab 键选中，按一下就关掉标签页）。更糟的是这一项当时**报的是 false 也看不出来**：`getComputedStyle(x).visibility` 只看这一格自己的值，祖先被隐藏它照样说 visible | 露出关闭键的两条规则挂在「显示中」这一态上（`.strip[data-fits='true'] .tab.on .x`）。度量改用 `checkVisibility({ visibilityProperty: true })`，它把祖先算进去——**比像素比对可靠**：这个 ✕ 在整窗截图里只有几个像素，是靠放大裁图才看出来的 |

| Q14 | `setInterval(16)` 在 Windows 上实际多久触发一次 | **p50 30.15ms**（p90 31.4）。间隔被向上取整到系统时钟滴答（约 15.6ms）的整数倍，16 成了两个滴答。`setInterval(8)` 得到 p50 **15.09ms**（一个滴答），已是 `setInterval` 在这里能给的极限 | 拖动窗口的循环取 `DRAG_TICK_MS = 8`。这不是「越小越流畅」，而是「不小于滴答就翻倍」——原先那条约 33Hz 的拖动就是这么来的。见 `spike/dragTicks.js` |
| Q15 | 拖动循环里每帧 `win.setPosition` 一次要花多久 | 隐藏窗口上 p50 **2.55ms**、p90 6.0ms、max 11.1ms（**下界**：真实拖动时窗口还要参与合成，只会更慢） | 一个 15.1ms 的滴答里这笔开销占得不小，因此每帧那次 `win.getBounds()` 往返被去掉：位置按按下时的锚点**绝对**算，上一次请求过的位置记在锚点里自比。绝对算法另有一个好处——平台卡住过一次也不会越拖越偏 |
| Q16 | 一条栏声明 `-webkit-app-region: drag`、子元素再声明 `no-drag`，只要**剩下**空白像素就还能拖吗 | **不能**。一个子元素若铺满整条栏（顶栏中间是 `flex: 1 1 auto` 的标签条，右栏里是撑满的功能栈），可拖区域就只剩几像素的内边距——用户的结论是「只能拖悬浮球」，而这件事从 CSS 上读不出来、从截图上也看不出来 | 整套 `-webkit-app-region` 取消，改成显式规则：**按在控件（按钮 / 输入 / 滑块 / `data-drag-ignore`）上是操作，按在别处都是拖窗口**。可拖区域不再随版面变化悄悄消失。验证：`spike/preview.js --drag-probe`——逐个位置派发合成 `pointerdown`/`pointerup` 并读拖动计数（合成事件不产生 `click`，因此按在按钮上没有副作用） |
| Q17 | 在 `:root` 上定义 `--surface: rgb(255 255 255 / var(--alpha))`，再把 `--alpha` 写在某个下层元素上，那个元素拿到的是不是半透明底色 | **不是**。自定义属性里的 `var()` 是在**声明它的那个元素**上完成替换的：`:root` 上算出来的已经是一个定值颜色（按当时的 `--alpha`），之后只是把这个结果继承下去。实测：下层 `--moyu-alpha` 读到 0.35，顶栏实测底色仍是 `rgb(255, 255, 255)`——滑块在动，画面纹丝不动 | `--moyu-alpha` 改写到 `document.documentElement`（与令牌同层），ChromeApp 与 PopoverApp 各写自己那份文档。`spike/preview.js --bg 0.35` 的 `surfaces` 盯着这一对关系：`bar` 应当带上这个 alpha，`ink`（字与图标）必须是不带 alpha 的实色——拉到 0 也要看得见、点得到 |

## 对原设计的两处修正

**1. 无极透明度改用 `setOpacity`，而不是注入 CSS。**

原设计假定 `transparent: true`（DirectComposition 半透明路径）与 `setOpacity`
（经典 layered `LWA_ALPHA` 路径）是两条不可叠加的合成路径，因而计划把窗口透明度钉在 1、
改用向网页注入 `html{opacity:X}` 的方式。Q3 实测证明二者在本机完美叠加。

因此改用 `setOpacity` 作为主路径，这消除了整整一类缺陷：不必在每次导航后重新注入 CSS、
不必对抗页面自身样式、对任何网页都一致生效。原 CSS 方案降级为备选，由
`stealth.fadeStrategy` 控制。

**2. `setShape` 确认为命中区域主策略。**

Q4 显示被裁剪区域与桌面基线完全一致（差值 0），即区域外既不绘制也不接收鼠标事件。
这比 `setIgnoreMouseEvents` 方案更优：没有轮询竞态，显形条带天然可悬停、可拖拽。

## 仍需在真实环境验证的项

- **混合 DPI**：本机为 scaleFactor=1 的单显示器。125% / 150% 下
  `screen.getCursorScreenPoint()` 与 `getBounds()` 的坐标一致性尚未验证，
  这是「主体在光标仍在窗口内时误隐藏」最可能的成因。矩形计算必须走统一辅助函数。
- **多显示器**：跨屏拖动时的坐标与形状行为未测。
- **点击穿透的最终确认**：`setShape` 的语义由像素比对间接证明，
  仍需用真机测试确认——**把记事本放在窗口后面，隐藏主体后点击原主体位置，
  光标必须落进记事本**。
- **DevTools 打开时窗口不透明**（Electron 既有行为）：透明度相关验证必须关闭 DevTools 进行。
- **拖动的流畅度只在隐藏窗口上量过**：`spike/dragTicks.js` 量的是定时器间隔与
  `setPosition` 的开销，二者都是**下界**——真实拖动时窗口是可见的，还要参与合成。
  因此「一个滴答一次」这个结论是确定的（间隔量化与窗口可见与否无关），
  而「肉眼是否够跟手」仍需真机确认。
