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
