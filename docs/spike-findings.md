# Spike 结论：Windows 透明窗口合成行为

在 Windows 11（1920×1080，scaleFactor=1）上用 Electron 44.4.3 实测得出。
脚本在 `spike/` 下，一个主题一份，运行 `npx electron spike/<名字>.js` 可在本机复现
——`index.js` 会自行截屏并比对像素，不依赖肉眼观察；`resize.js` / `window-max.js` /
`vieworder.js` / `fullscreen.js` / `fullscreen-cycles.js` 只断言次序与几何，
隐藏窗口里取不到快照（见 Q20）。

Q1–Q17 决定了 `src/main/services/windowSurface.ts` 的实现方式；
Q18 起是「悬浮球图标 · 16:9 边缘缩放 · 最大化与还原 · 视频全屏联动」这一版
量出来的，决定了 `windowController.ts`、`tabManager.ts` 与 `chrome/ChromeApp.vue`
的做法；Q26–Q28 来自「收起即暂停音视频」那一版；**Q29–Q33 来自「主题管到整个界面」
那一版，量的大多是探针环境自身的脾气（而不是产品行为）——它们不影响 `src/`，
但每一条都决定了下一次写探针时该怎么写**；**Q34–Q36 来自「自动检查更新」那一版，
量的不是界面而是网络这条路，以及这台机器自己的脾气**；**Q37 来自「起始页与系统设置
不再当标签页」那一版，是一条纯粹的观测方法：想知道一页被要求打开的是哪个地址，
监听必须挂在这一页出生那一刻**；**Q38 来自「设置那颗键搬到顶栏左上角」那一版，量的是探针自己的一次翻车——模板字符串里的一个反引号**。
**Q39–Q40 来自「起始页按栏目分节、加上离线阅读」那一版，量的是怎么在**不弹出一个
系统对话框**的前提下把那条路验掉，以及一次载入期语法错误在终端上是什么样子**；
**Q41 来自「起始页点了没反应」那一版：界面层让回去时该落在哪儿——一条次序上的错，
表现却是整块正文点不动、而顶栏与右栏照常**；**Q42–Q45 与它同一版，量的是探针自己
在那条路上的三处翻车：把被测的那一步改成反面、一个在屏外窗口上只可能误触发的开关、
以及「那一点归谁」该问在哪一点上**。
**Q46–Q47 来自「整体透明度滑块一松手就跳回 100%」那一版：前者是产品自己的一条线——
配置改了要广播给界面，而广播只挂在一条 IPC 上；后者是探针在这一版里摔的一跤——
Vue 的重画在微任务里，派事件那一个任务里读到的显示值是上一帧的**。

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

| Q18 | 对一个**已经在场的**子视图再 `addChildView()` 一次，会多插一份，还是把它挪到最上层 | **挪到最上层**：`win.contentView.children` 的个数不变，次序变了。抬上 / 让回交替十次，个数与次序都不漂。第二个参数给 0 就是挪到最底下，同一套语义 | 「把界面层抬到网页之上」不必新建视图，就是再 `addChildView` 一次。最大化时右上角那一小块、光标进边带时的左/下手柄都用它；让回则是 `addChildView(chrome, 0)` 送回原位（见 Q41）。见 `spike/vieworder.js` |
| Q19 | 两个铺满窗口的 `WebContentsView` 叠在一起，上面那层若在 CSS 里写 `pointer-events: none`，点击能落到下面那层吗 | **不能**。子视图是原生视图不是 DOM，指针事件只投给最上面那一层，`pointer-events` 在这里完全没有参与 | 「铺一张透明的整窗浮层、只在控件处设 auto」这条画法在这里根本不成立——浮层一铺，整块网页就点不动了。改为**把界面层缩到右上角一小块**（80×48 的 `.float`），别处的指针本来就不经界面。左/下那条 8px 缩放手柄带同理，只能靠「光标进带时抬起界面层」，代价是抬起之前那一条上的点击归网页 |
| Q20 | 在 `show: false` 的窗口里 `view.webContents.capturePage()` | **抛 `UnknownVizError`**——没有合成器，也就没有帧 | 与 Q11 是同一件事的两个面（那边抓得到但晚一帧，前提是窗口被合成过）。因此这一版的探针只断言次序与几何，不报像素；`spike/fullscreen.js` 里的窗口从头到尾不显示 |
| Q21 | 一个**从未显示过**的窗口里，网页连续进出 HTML 全屏能走几趟 | **只走得了一趟。**第二趟起 `requestFullscreen()` 会把 `document.fullscreenElement` 置上，但 `enter-html-full-screen` 再也不来，`exitFullscreen()` 也退不回去。把变量一样一样摘出来之后：**不是**透明 / `resizable:false` / `frame:false` 这些窗口配置，**不是** `disableHtmlFullscreenWindowResize`，**不是**在回调里重排子视图次序，**把回调里的动作 `setImmediate` 推迟一个 tick 也救不回来**；一扇最小窗口（`plain`）三趟干净，所以也**不是**「一个进程只容得下一趟」 | 能在回调里把它弄坏的是**两件事**：在那个回调里 `view.setBounds()` 改页面视图尺寸，以及窗口没被真正合成（`shown` 那一支能撑到第三趟）。产品必然要做那一下 `setBounds`——窗口尺寸变了正文矩形就得跟着变，否则视频停在旧矩形上——因此这是**环境的脾气、不是产品的毛病**，没有在 `src/` 里加补丁。真机上要看的是「再按一次视频的全屏键能不能退出来」。见 `spike/fullscreen-cycles.js`，七支变体一次一支跑 |
| Q22 | `disableHtmlFullscreenWindowResize: true` 到底改变了什么 | **量得出，而且差别正是我们要接管这一摊的理由**：不带它时 Chromium 自己把窗口铺到**整块显示器**（本机 `0,0,1920,1080`，任务栏一起盖住）；带上它，窗口一动不动。工作区是 `0,0,1920,1032` | 那 48px 就是「Chromium 与 `WindowController` 两边同时动手」会跳的那一下。这个开关不是可选项。判据见 `spike/fullscreen.js control`：起一扇**不在任何全屏流程里**的对照窗口，同样禁用/不禁用各试一遍 |
| Q23 | 在从未显示过的窗口里 `executeJavaScript('document.exitFullscreen()')` | **那个 promise 永不落地**——退出全屏本身照样发生（`leave-html-full-screen` 到了、窗口也还原了），但等着它的那次 `executeJavaScript` 会一直挂着 | 探针页面里两处入口都写成 fire-and-forget，失败塞进 `window.moyuErr`，轮询去读，而不是 `await` 那个 promise；`waitUntil` 替代固定延时。产品侧本来就不等（`TabManager.exitPageFullscreen()` 只 `.catch(() => {})`） |
| Q24 | 在从未显示过的窗口里走完一趟全屏，之后这个进程里再 `loadURL('file://…')` | **`ERR_FAILED (-2)`**。对照窗口若建在那趟全屏**之后**，它连页面都载不进来 | 探针里的对照窗口必须在任何全屏流程**之前**就建好并载入（`spike/fullscreen.js control` 就是这么改的）。同属 Q21 那一类环境症状，不用改产品 |
| Q25 | 一次 `setBounds()` 能不能把窗口正好摆成当前显示器的 `workArea` | **能**，读回与 `workArea` 逐字段相等（`0,0,1920,1032`）；隐藏窗口上同样成立 | 最大化不必分几步摆，一次到位即可——`windowController.setMaximized()` 就是这么做的，摆完照既有习惯**读回实测矩形**存进 `expandedBounds`。见 `spike/resize.js` 与 `spike/window-max.js` |
| Q26 | 窗口收起成球（或最小化、藏进托盘）之后，网页里正在播的 `<video>` / `<audio>` 会不会自己停 | **不会**。`setVisible(false)` 只是不合成，`setAudioMuted(true)` 只是听不见——`paused` 仍是 `false`，进度照走。这是用户报的那个毛病：收起来听着没动静，回来发现片子已经跑掉一截 | 隐藏态要**真的暂停**，得在页面里做 DOM 操作（`el.pause()`）。只有我们按下去的才恢复：动过的当场打一枚展开属性 `__moyuPaused`（不是 `data-` 属性，不给页面自己的选择器添麻烦），恢复时只挑带这枚记号的。页面上用户自己按过暂停的，前后都不动它。见 `spike/media-pause.js` |
| Q27 | 顶层的 `document.querySelectorAll` 能够到跨源 iframe 里的播放器吗 | **够不到**（不透明源的 `contentWindow.document` 直接抛），但主进程**够得到**：`webContents.mainFrame.framesInSubtree` 给出 `WebFrameMain[]`，逐个 `frame.executeJavaScript()` 就跑进了人家自己的上下文里 | 「连嵌入播放器一起暂停」只能走这条路。`data:` iframe 与真实网站里的 `<iframe src="https://…">` 在这一点上同类，因此探针用一个 `data:` iframe 就能把这条验证做实 |
| Q28 | 隐藏的页面里，`setInterval` 还能按时上报状态吗 | **不能**：被节流到约 1 秒一次（再久还会更稀），于是「等不到回复」会**伪装成「没暂停」**——一个刚好会把被测对象判成通过的假象 | 探针页面之间改用**一问一答**（父页面 `postMessage({ask:'state'})` 问，iframe 答），消息投递不受节流影响；等待一律走 `waitUntil` 轮询而不是固定延时。产品侧不受影响（暂停是主进程推过去的，不依赖页面里的定时器） |
| Q29 | 假设「`show: false` 的窗口里 `requestAnimationFrame` 根本不触发」，这个假设成立吗 | **不成立**。隐藏窗口里 1 秒跑到 **48 帧**（时钟 1012ms）——被节流到 50Hz 上下，但一直在跑。对照：同一扇窗里 `setInterval(16)` 500ms 触发 32 次，也是偏慢的 | 隐藏窗口里 `rAF` 可以用来对齐帧，但不能假定「两帧 = 33ms」，更不能假定它一定到。探针里那套 `Promise.race([两帧 rAF, setTimeout(500)])` 因此留着——不是因为 rAF 不来，而是因为它来的快慢不由我们定。见 `spike/preview.js` / `spike/readme-assets.js` 的 `shoot()` |
| Q30 | 主进程里一次没人接的 promise 拒绝、或定时器回调里抛出的同步异常，会把进程带走吗 | **都不会**。前者只打一条 `UnhandledPromiseRejectionWarning` 就过去了；后者**连一行都不打**，进程照常活着（2 秒后照样走到收尾） | 「探针挂了」在终端上可能表现为**什么都没有**：不是崩溃、不是报错，而是停在那里。所以探针必须自己装 `process.on('unhandledRejection')`（打一条 `[FAIL]` 再 `app.exit(1)`），并尽量走看门狗；否则失败会伪装成「还在跑」——那比报错难查得多。见 `spike/theme-chrome.js` / `tray-reveal.js` 开头那一段 |
| Q31 | 带透明通道的像素在 canvas 里往返一趟还剩什么 | **`putImageData` 写进去的 `rgba(255,0,0,0)` 读回来就是 `[0,0,0,0]`**（全透明像素的颜色当场没了，底色是预乘存储）；PNG 往返保持这个结果；**WebP 往返更狠**：`[255,0,0,1]` 变成 `[0,0,0,1]`，`[255,0,0,128]` 偏成 `[251,2,4,128]` | 别拿 `canvas → WebP` 这条路去产**带 alpha** 的素材：alpha 接近 0 的像素会丢色，画面上就是一圈黑边或灰边。README 那几张成品图没踩到，是因为它们在排版页里已经被合成为不透明的一帧（桌面底是画在页面里的），编码时没有任何 alpha 可丢。要产带透明的图就用 PNG |
| Q32 | 构建产物里 `themes.css` 这一份样式表叫什么名字 | **不叫 `themes.css`**。它在 `out/renderer/assets/` 里叫 `useTheme-<哈希>.css`——名字来自「把它拉进依赖图的那个模块」，后面挂内容哈希。同理 `tokens.css` → `useConfig-<哈希>.css`，`base.css` → `useBackgroundAlpha-<哈希>.css`。四份文档引的是**同一份** chunk | 判断「某份文档拿到了哪几条样式表」，要读产物 HTML 里 `<link>` 的顺序（它保住了源文件里的先后），**不要按源文件名去 `assets/` 里 grep**：那样一条都搜不到，而「一条也没搜到」极容易被读成「样式表没生效」。见 `spike/theme-chrome.js` 读的是 `out/renderer/*.html` |
| Q33 | 系统设置那一页的按钮与输入框，颜色是从哪儿来的 | **从 UA 样式表来**：那一页的 `settings.html` 不加载 `base.css`（它只引 `themes.css` + `tokens.css` + `settings.css`），于是没有人给它 `color: inherit`，`button` 拿到的是系统默认的 `buttontext`（黑） | 暗夜下探针量出来是 **1.18:1**——黑底黑字，整页控件像没画出来。`settings.css` 因此自己写了 `button, input { color: inherit }`。这一条之所以值得记：它**不会**在浅色主题下露头，也不是「样式没生效」，而是「少了一条谁都没写过的规则」。（`spike/theme-chrome.js` 的 Q9，纸白下最紧的一对是选中按钮 4.67:1） |

| Q34 | Electron 的 `ClientRequest` 有 `setTimeout()` 吗（node 的 `http.ClientRequest` 有） | **没有**——`req.setTimeout` 不是函数。探针里那只「接下连接、一个字也不回」的假服务器因此是靠**自己挂的 `setTimeout` + `req.abort()`** 收场的，实测 15008ms 落地 | 查询与下载各挂一个定时器，两处语义不同：查是**整体** 15 秒（`UPDATE_CHECK_TIMEOUT_MS`）；下是「**多久没有新数据**」60 秒（`UPDATE_STALL_MS`，每收到一块就重置一次）——111MB 在慢网下线几分钟是正常的，不能给下载设总时长上限。见 `spike/update-check.js` 的 Q7 |
| Q35 | 一个**没有窗口**的 Electron 进程里，`net.request` 走得通吗 | **走得通**。探针从头到尾不建 `BrowserWindow`（也就不必担心抢焦点），`app.whenReady()` 之后直接发请求，本机那只假 GitHub 与真的 `api.github.com` 都照常应答 | 「只有主进程才验得了」的东西可以写成无头探针，不必把用户的应用拉起来——`spike/update-check.js` 因此能在几秒内跑完十三问，不需要 IPC、不需要渲染进程，配置写在临时目录。另：喂给它的 `latest.yml` 用的是 `release/latest.yml` 那一份**真构建产物**，不是手写的样例 |
| Q36 | 这台机器上「连不连得上 GitHub」是由什么决定的 | **两套网络栈走了两条路**。`session.resolveProxy()` 报 `DIRECT`（Windows 系统代理关着：`ProxyEnable=0`、`ProxyServer` 为空），于是 Chromium 与 node 都直连；而 `curl` 连的是 `127.0.0.1`（实测 `remote_ip=127.0.0.1`，本机 7897 端口上那个代理），所以 curl 通、进程内不通。同一支探针连着跑：`api.github.com` 一直 200，`github.com` 六次都在 170ms 上下回来，也见过连着几分钟 20 秒不回 | 「查不到更新」在这台机器上会真的发生，而且**安静地失败**——设置页里写着「检查失败：网络不通」，窗口里一条提示都不冒。要让它稳，得把本地代理写进 Windows 的系统代理设置（或让它接管整机流量）。`spike/update-check.js --net` 那一问因此记 **SKIP 而不是 FAIL**：网络上时通时不通，那一问红了未必是代码的问题 |
| Q37 | `tabs.create()` 返回之后再给那个 `webContents` 挂 `did-start-navigation`，头一发还收得到吗 | **收不到，而且失败的样子有两种。**`create()` 里是**同步** `loadURL()`，等它返回再挂监听，第一发事件早已派发完。真跑起来：`douyin.com`（会 301 到 `www.`）量到的是**重定向之后**那一发 `https://www.douyin.com/`，看起来还像个合理答案；`google.com`（只有那一发）四秒后 `getURL()` 仍是空串 | 「这一页被要求打开的是哪个地址」只能靠 `app.on('web-contents-created')` + 在**出生那一刻**挂监听来问（第一份 `webContents` 一建出来就挂上，比任何 `create()` 都早），按 `webContents.id` 存下第一发主框架非 `about:blank` 的地址。这条也顺带说明：量到的若是「重定向之后」的地址，读数**不会报错**，只会悄悄换成一个看着更正常的域名——这种错最难发现。见 `spike/own-screens.js` 的 `firstNav` 与 Q9 |

| Q38 | 在一个**模板字符串**里（`preview.js` 发给渲染进程执行的 `MEASURE`）写注释时顺手用了反引号，会发生什么 | **整个模板提前收尾**，剩下的半段变成主进程里跑的代码，于是 Electron 报 `App threw an error during load` + `TypeError: Cannot read properties of undefined (reading 'on')`，行号指向源码里那一段（那时候它已经是一句注释了），而**渲染进程一个字的报告都没有**。更费时间的是它挂住的样子：`npx electron …` 七分钟没有任何输出，最后是 `tasklist /V` 看见一个标题为 `Electron` 的窗口才认出「它弹了个错误对话框在等人点」 | 探针里那几段发给页面的脚本都是模板字符串（`MEASURE` / `PAGE_MEASURE` / `POPOVER_MEASURE`），里面写注释提到选择器时别用反引号——`.icon.on` 这样写就行。这一条也是 Q30 的另一面：**「挂住」有两种样子**，一种是一个字都不打，一种是弹一个没人看得见的模态框；探针之外那套 `unhandledRejection` + 看门狗对后者没办法。见 `preview.js` 里 `MEASURE` 顶上那段警告 |

| Q39 | 主进程里 `require('electron').dialog.showOpenDialog` 能被换掉吗？换掉之后，被测的那份代码走的究竟是替身还是真的那个 | **能换，而且走的就是替身**。赋值后两个引用相等（`dialog.showOpenDialog === 替身`），属性可写可配置。关键在于被测代码那一侧的引用方式：esbuild 以 `external: ['electron']` 打出来的 CJS 把外部 ESM 引用编译成 `var import_electron = require("electron")` + 调用处写 `import_electron.dialog.showOpenDialog(...)`——**每次调用都重新查一遍属性**，而不是开头取一次存进局部变量。因此换掉之后真的走替身（这一点是 grep 一份临时打包产物确认的，不是推的） | 「弹系统选文件框」这条路可以在无头探针里验完整：换掉 `dialog`，断言 `tabManager.create` 收到的是 `file://` 绝对 URL、回来的是文件名数组、取消时返回空数组且一张标签都不开。但**换的动作必须自己断言成立**（赋值后比一次引用），换不上就照实报「否」——真的那个对话框会弹出来，而没人去按它，探针会一直挂着（这条与 Q30 同源）。见 `spike/home-sections.js` 的 Q10 |
| Q40 | 一个探针脚本在**载入期**就抛了语法错误（`Identifier 'x' has already been declared`），`npx electron spike/…js` 表现出来是什么样 | **什么都不发生**：终端一个字都不打，进程既不退出也不建窗口——它就一直待在那儿。这一条与本机既有的 Q30、Q38 合起来是同一件事的第三种面孔：**「挂住」可以是一个字不打的沉默（Q30）、一个没人看得见的模态框（Q38），也可以是一次连报错都还没轮到的载入失败**。对照：把同一份文件交给 `node --check`，两秒内就把行号与那对重名的标识符指出来了 | 探针一律跑在 `timeout <秒数> npx electron …` 下——载入期报错时没有「退出的时机」可等，只有超时能收场（跑挂的那一次留下了一个撑满两分钟、没有窗口的 Electron 进程，还得按 PID 逐个认出来）。改完探针先跑一遍 `node --check spike/<名>.js`：语法错在这一步就挡住了，根本轮不到 Electron 去沉默 |
| Q41 | 界面层抬上去之后再让回去，**只把当前那一屏重新加到最上层**够不够 | **不够，而且代价就是用户报的那条毛病**。`addChildView` 一次只动一个视图：让回之后界面层退居第二，**其余每一屏都还沉在它下面**。界面层是整窗大的一层，正文区那一块在它上面是空档——原生命中测试只认最上面那个画着的视图（Q19），于是那些屏整块点不动。抬升只要发生过一次（最大化，或光标贴到窗口边框那一下——`EdgeWatcher` 的 8px 带）就会一直如此；而切屏只是翻显隐、不再抬次序（`TabManager.activate`），所以「点顶栏那颗键回起始页之后，页面上点了没反应，顶栏与右栏却照常好用」正是它的样子 | 让回 = `addChildView(chrome, 0)`，一步送回它原本住的地方（`create()` 里第一个加进来）——这一条对**所有**屏成立，不必逐屏去追。原先那套「抬当前那一屏」连同 `TabManager.raiseActive()` 一并删掉。验证：`spike/window-max.js` 的 Q3c/Q3d（后出现的那一屏也得在界面层之上）、`spike/live-app.js` 的 A9（真 app 里点回起始页，正文区那一点必须归起始页） |

| Q42 | 探针给 `win.contentView.addChildView` 挂的替身写成 `(view) => rawAdd(view)`，把第二个参数丢了——被测的那一步会变成什么 | **变成它的反面。**让回那一步是 `addChildView(chrome, 0)`（送回最底下），丢掉 index 就成了「抬到最上面」：于是真身上已经修好的毛病，报告里照样是「A9 不是——那一点归界面层」，而那条记录里三次移位全是「到最上面」。**探针亲手把被测的代码改成了它的反面，顺手把证据也改了** | 替身必须**原样转交它不认识的参数**（`(view, index) => rawAdd(view, index)`）。这一条与 Q39 同源：替身只要与真身差一丝，量的就不是产品。`spike/live-app.js` 的移位记录因此把「到最上面 / 回最底下」分开记——两种都记成一样，就分不出修好没有 |
| Q43 | 窗口停在屏幕外时，`stealth.autoCollapse` 开着会怎样 | **只可能误触发。**自动收起要的是「真光标在窗口里待过」（`WindowLeaveWatcher.armed` 只在光标进过窗口之后才置上），而屏外的窗口真光标永远进不去；唯一能把它置上的是**拖动**——拖动按绝对算法跟着真光标走，窗口被拽到光标底下，光标就此进了窗口，`hideDelayMs` 一到便收起。原先 `spike/home-layer.js` 的 M14 正是拖动那一步，于是从 M14 起窗口已经是 `collapsed`，M15–M19 量的全是一扇收起的窗口（叠着的可见视图是空的），六条全红而产品没有毛病 | 探针里把这个开关关掉，并在文件头写明理由；收起 / 展开这条路本身另有 M4、M7 直接叫 `controller.collapse()` / `expand()`，走同一条状态机，与它无关。拖动那一步的按下与松开也一并收进同一个同步块（与 `window-max.js` 的 Q6 同一手）——否则窗口会被拽到屏幕上 |
| Q44 | 窗口从没 `show()` 过时，`win.isVisible()` 是什么 | **恒为 false。**于是 `isOnScreen()` 也是 false，`toggleFromTray()` 两次都走「藏起来」那一支——第二次点托盘图标叫不回来，之后每一步量的都是一扇藏着的窗口 | 探针自己记一本「屏幕上有过这扇窗吗」的账（`show` / `showInactive` / `hide` / `isVisible` 四处换成探针的布尔量），控制器那一套判断照旧是真的。`spike/home-layer.js` 的 M17–M19 就是这么转绿的 |
| Q45 | 断言「那一点归谁」之前，要先问清楚什么 | 两件，都摔过。**问的是哪一点**：最大化时界面层只剩右上角一小块，正文正中间那一点压根不在它里面，拿「该归界面层」去问正中间，必然得到「不是」（M12）。**那一刻有没有可比的对象**：起手（M0）还没有任何网页，整扇窗只有界面层，它接走那一点是对的，拿「该归网页」去问它同样必然「不是」 | 判据要按这一刻的真身写：最大化时**分两点问**（那一小块归界面层、正中间归网页，M12 / M12b），还没有可比对象的那一步只记一笔、不断言（`expect` 给 null）。这与 Q41 是一件事的两面——那条讲产品的次序错，这条讲探针问错了地方也会一样红 |

| Q46 | 「配置改了要告诉界面」这件事，广播挂在发起写入的那一条 IPC 上够不够 | **不够，而且这就是用户报的那条毛病。**原先只有 `INVOKE.configPatch` 那一条路广播 `config:changed`，而整体透明度走的是另一条：右栏那条滑块 → `win.setOpacity` → `WindowController.setOpacity()` → `config.set(...)`，它只发 `window:state`。`ConfigStore.subscribe()` 一直在、写得也对，但**订阅者是 0**——于是界面手里那份配置镜像停在挂载时读到的值（默认 100%）。实测（修之前）：拖动中配置已是 0.4、窗口确实 40%，**松手那一帧滑块显示 100%**。设置页里改同一条也会跳，只是那儿改完不松手 | 广播改挂在 `ConfigStore` 的订阅上（`src/main/index.ts` 里一句 `config.subscribe(...)`），**谁改的都算**：configPatch、setOpacity、setChrome、updateService.ignore、persistExpandedBounds、lastSession 全在这一句之下，不必逐条去补——补一条就还有下一条要走这条老路。`configPatch` 那个 handler 从此只留窗口那一侧的副作用。验证：`spike/live-app.js` A10（合成拖动）/ A11（不碰界面，直接调 `win.setOpacity(0.55)`，滑块也得跟着到 55%）、`spike/preview.js --drag-opacity 40` |
| Q47 | 在派发 `input` 的那个任务里，紧接着读那一格渲染出来的文字，读到的是哪一帧 | **上一帧。**Vue 的重画在微任务里，而 `dispatchEvent` 是同步的——同一个 `executeJavaScript` 任务里读 `.value`、读元素高度这类**渲染结果**，拿到的是改动之前的值。摔的样子：拖动中那一次读出来 100%（配置已经是 0.4），于是「修正起效了没有」被自己的读数判红 | 写与读分成两次 `executeJavaScript`，中间等一次冲刷（`live-app.js` A10 与 `preview.js` 的 `--drag-opacity` 里都是 `await wait(50)` 再读）。它与 Q11（隐藏窗口抓图晚一帧）同属一类：**要读的是画出来的东西，就得让画先画完**。只读状态（`config.window.opacity` 这种由主进程给的值）不受影响，那个不是渲染结果 |

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

> 后来这套机制整体移除了：窗口改成「收起时真的缩小成一枚球」，
> 尺寸本身就是命中区域，不必再靠裁剪去欺骗命中测试，`setShape` 也就不再有
> 存在的理由。Q4 仍然成立，只是现在没有调用点了。

## 仍需在真实环境验证的项

- **混合 DPI**：本机为 scaleFactor=1 的单显示器。125% / 150% 下
  `screen.getCursorScreenPoint()` 与 `getBounds()` 的坐标一致性尚未验证，
  这是「主体在光标仍在窗口内时误隐藏」最可能的成因。矩形计算必须走统一辅助函数。
- **多显示器**：跨屏拖动时的坐标与形状行为未测。
- **点击穿透的最终确认**：`setShape` 的语义由像素比对间接证明，
  仍需用真机测试确认——**把记事本放在窗口后面，隐藏主体后点击原主体位置，
  光标必须落进记事本**。
- **DevTools 打开时窗口不透明**（Electron 既有行为）：透明度相关验证必须关闭 DevTools 进行。
- **最大化之后的那个出口能不能点得到**：最大化时两栏都让位，界面层只剩右上角
  一小块（还原键 + 球），它盖在网页之上靠的是 Q18 那次重排。进程内没有任何东西
  能移动系统光标，命中测试无法自动化，只能真机确认——**点得到，这一态才有出口**。
- **窗口下边缘与左边缘能不能拖起来**：那两条边的像素归网页，靠「光标进边带抬起
  界面层」才拿得到（Q19）。若真机上不灵，兜底是只留上/右两条边与三个角
  （右上角那一个角已经足以到达任意 16:9 尺寸），以及最大化时保留右栏。
- **再按一次视频的全屏键**：Q21 里那个「第二趟起退不出来」在真机上是什么症状，
  只能真机看——探针那扇窗口从头到尾没显示过，量到的是环境的脾气。
- **真网站上的暂停与恢复**：`spike/media-pause.js` 用的是现做的 WAV 与一个 `data:`
  iframe，验的是「这条路通不通」；B 站这类站点的播放器自己也在监听页面可见性，
  两边同时下手时会是什么样，只能真机看。要看的是这一条：收起再展开后，
  片子是从原处接着放，而不是从头开始或干脆不放了。
- **裁剪弹窗的滚轮缩放**：`spike/ball-crop.js` 走的是合成 `PointerEvent` 与代码里
  那条缩放路径，滚轮事件本身（`deltaY` 的量级与符号）没有在真鼠标上过一遍。
- **拖动的流畅度只在隐藏窗口上量过**：`spike/dragTicks.js` 量的是定时器间隔与
  `setPosition` 的开销，二者都是**下界**——真实拖动时窗口是可见的，还要参与合成。
  因此「一个滴答一次」这个结论是确定的（间隔量化与窗口可见与否无关），
  而「肉眼是否够跟手」仍需真机确认。
- **托盘右键「现形」**：`spike/tray-reveal.js` 验到的是**控制器那一层**——真的
  `WindowController`、真的 `ConfigStore`（临时目录），十问全过，其中 Q1 先走旧路径
  把病钉死（只提到最前，回来仍是 40%），Q3 换一个实例从磁盘读回来。
  但它验不了「菜单上那一下点得到」：那是系统的托盘菜单，进程内点不着。
  真机上要看的是：把整扇窗调到 40%，藏进托盘，右键图标点「现形」——
  窗口回来后**是不是不透了**，以及右栏那条「整体」滑块**是不是也跟着回到最右**。
- **用真鼠标拖那条「整体」滑块**：Q46 的病与它的修法都是进程内量实的
  （`live-app.js` A10/A11 走的是真主进程、真渲染进程），A10 里那次原生拖动
  进程内也收得到（拖动后配置 = 0.8）。没走过的是**真手指**：按住在滑块上拖、
  中途把指针拖出滑块之外再松手、以及在窗口半透明时那条滑块本身好不好抓。
  这三样只能真机试，要看的是一件事——**松手之后它停在松手的地方**。
- **磷绿（终端世界）在界面上的观感**：这一版头一回让形态（直角、等宽字体）
  跟着主题进到界面。`spike/theme-chrome.js` 量得出 `--moyu-radius*` 全是 0、
  字体栈里含 `Cascadia Mono`、以及每套主题的对比度（最紧的一对 4.67:1），
  但「好不好看、等宽字体下的中文界面读着累不累」是量不出来的，只能真机看。
- **起始页在终端世界里的滚动条**：圆角改成走 `--radius-sm` 之后会跟着归零，
  但起始页只在站点多到溢出时才出滚动条，无头截图里未必抓得到，真机顺手看一眼。
- **真的下一次 111MB**：`spike/update-check.js` 验到的是「点下载 → 落盘 → 边收边算
  sha512 → 对得上 → `spawn` 起安装程序 → 本进程退出」这一串（spawn 与 quit 都是替身，
  数的是次数与参数）。再往后几步是安装程序自己的事，进程内看不见：向导走完装没装上、
  装的时候**旧进程是不是已经退干净**（推理是「向导要用户点几下，那时进程早没了」，
  但没在真机上走过）、以及 `%TEMP%\moyu-reader-update` 里那份 111MB 的安装包要不要清
  ——现在留着（下次检查发现 sha512 仍对得上就直接判 `ready`，省一次下载），
  换新版本时由 `sweep()` 删掉同目录下别的版本。
- **免安装版（zip）点「重启并安装」**：它没有安装目录可更新，预期会**装出第二份**。
  这是已知限制，真机上确认一下症状，好把 README 里那句话写准。
- **「打开文件…」那个系统选文件框**：`spike/home-sections.js` 验到的是**它下游那一段**——
  选中的路径变成 `file://` 标签页、回来的是文件名、取消就什么都不开（Q39）。框本身长什么样
  进程内看不见，三条只能真机看：过滤器是不是只有 TXT / PDF 一组而且不误导（**挂上
  「所有文件」就会让人选中一本 EPUB 然后看着它变成一次下载**，那比选不到更费解）；
  在中文目录（「文档」「下载」）里文件名显示得对不对；多选几本时是不是每本各开一张标签页。
- **本机 TXT 与 PDF 读起来什么样**：Chromium 自己渲染这两种格式，PDF 走它的内置阅读器。
  要看的是**在 40% 透明度、置顶、不要滚动条的窗口里**：TXT 的白底会不会亮得刺眼
  （网页注入的那套透明样式对 `file:` 文档同样生效，但 TXT 是浏览器自己排版的白底页），
  PDF 阅读器那套自带 UI 与我们的主题配色撞不撞。这两样决定了后面要不要上 pdf.js
  （见 README 路线图）——而这件事从截图上看不出来，截图里没有真的 TXT 与 PDF。
