# 摸鱼阅读 (moyu-reader)

一款 Windows 桌面阅读器：把网页装进一个**可调透明度、置顶、能一键藏起来**的窗口里，
在工作场景下低调地阅读。

功能对标商业产品 [墨鱼阅读](https://moyuread.com/)，但**代码完全独立实现**，
不包含该产品的任何资源或代码。

## 当前状态

里程碑 1（核心摸鱼能力）已完成并通过真机验证。本地电子书阅读（TXT / EPUB / PDF）、
自动滚动、按站点插件等尚未实现，见下方「路线图」。

## 功能

**窗口**
- 无边框、逐像素透明、置顶
- **无极透明度** 5%–100%，另有 清晰 / 淡化 / 轻隐 / 几近无形 四档预设
- 迷你模式与四档窗口尺寸预设
- 不显示在任务栏与 Alt+Tab 中（可选开启，但会显著降低隐蔽性）

**自动隐藏**
- 顶部菜单栏 / 主体 / 底部工具栏三个区域独立开关
- 光标移出后自动隐藏，移回即显形
- 主体隐藏后该区域**点击穿透**，事件落到后方窗口，不影响正常办公
- 每个隐藏区域保留一条 6px 条带，用于显形与拖动窗口
- 隐藏主体时自动暂停网页音视频

**老板键**
- 老板键 1（默认 `Alt+Z`）：最小化 / 恢复
- 老板键 2（默认 `Alt+X`）：藏进托盘，双击托盘图标或按 `Alt+Z` 唤回
- 可自定义；**注册失败时会明确提示**（组合键被其它程序占用时注册会静默失败，
  不提示的话用户会以为设置成功了）

**浏览器**
- 内嵌 Chromium，可访问任意网站，登录态跨重启保留
- 地址栏、前进 / 后退 / 刷新、多标签页
- 「我的站点」+ 内置热门站点
- 浏览历史与书签（本地存储）
- 手机 / 电脑模式切换、页面缩放、隐藏滚动条

**隐蔽性**
- 可选的防截屏 / 防屏幕共享（`SetWindowDisplayAffinity`）
- 独立于系统浏览器的会话，不与日常浏览混在一起

## 开发

需要 Node.js 20 以上。

```bash
npm install
npm run dev
```

其他命令：

```bash
npm run typecheck
```

```bash
npm run build
```

```bash
npm run build:win
```

> 开发提示：**DevTools 打开时窗口不透明**（Electron 的既有行为）。
> 调试界面布局时请开 DevTools，验证透明度相关行为时务必关掉它。

### 验证工具

`spike/` 下有两个一次性工具，用于在真机上复核关键行为：

```bash
npx electron spike/index.js
```

自行截屏并比对像素，验证透明窗口的合成行为（`setBackgroundColor` 是否生效、
`setOpacity` 与 `transparent` 能否共存、`setShape` 是否可裁剪等），
结论见 [docs/spike-findings.md](docs/spike-findings.md)。

```bash
npx electron spike/capture.js <输出路径>
```

把当前屏幕截图写入 PNG，用于无法目视时检查渲染结果。

## 架构要点

有三处实现与直觉相反，都是被真机验证倒逼出来的，改动前请先读
[docs/spike-findings.md](docs/spike-findings.md)：

1. **每个 `WebContentsView` 都必须调用 `setBackgroundColor('#00000000')`。**
   默认背景是不透明白色，漏掉这一行整个透明方案就不成立。

2. **命中区域用 `setShape`，不用 `setIgnoreMouseEvents`。**
   前者区域外既不绘制也不接收鼠标事件，没有轮询竞态，显形条带天然可悬停、可拖拽。
   后者会让整个窗口穿透，只能靠轮询切标志位，落在切换间隙的点击会被静默丢弃。

3. **所有窗口级 surface 属性只能经 `windowSurface.ts` 一处设置。**
   `transparent: true` 与 `setOpacity` 在 Windows 上是两条不同的合成路径，
   从多处反复折腾它们会出问题。调用顺序在 `apply()` 里有注释说明，不要重排。

### 目录

```
src/shared/    三个进程共享的类型、IPC 契约、常量
src/main/      主进程：窗口编排、状态机、浏览器、数据存储
src/preload/   唯一的 contextBridge 桥
src/renderer/  chrome 界面 / 弹出面板 / 个人中心
```

关键文件：

| 文件 | 职责 |
|---|---|
| `src/main/services/windowSurface.ts` | 所有窗口级属性的唯一入口 |
| `src/main/services/windowController.ts` | 窗口编排与状态机：状态、合法迁移、守卫 |
| `src/main/services/mousePassthrough.ts` | 命中区域策略（shape 主 / ignoreMouse 备） |
| `src/main/services/windowLeaveWatcher.ts` | 光标轮询、迟滞、挂起门控 |
| `src/main/services/geometry.ts` | 版面矩形计算，坐标判断的唯一来源 |
| `src/shared/ipc.ts` | 三个进程共享的通道与载荷契约 |

> 计划里原本把状态机拆成独立的 `windowStateMachine.ts`，实现时发现它与窗口编排放一起
> 内聚性更好（状态迁移总是伴随窗口动作），故合并进 `windowController.ts`。

## 数据位置

配置、站点、书签、历史与网页登录态都在 `%APPDATA%\moyu-reader`。
配置写入采用「临时文件 + rename」原子替换；文件损坏时会被隔离为
`.corrupt-<时间戳>` 并回落默认值，不会因为一个坏文件导致应用起不来。

## 路线图

- 本地电子书阅读：TXT / EPUB / PDF（需要把许可证保持在 GPL-2.0-or-later，
  以便使用 Apache-2.0 的 pdf.js 做可自定义样式的 PDF 渲染）
- 自动滚动与定时翻页
- 修改网页文字颜色、隐藏图片与视频
- 按站点插件
- 自定义窗口拖拽缩放手柄
- 全屏应用检测：置顶窗口浮在全屏演示之上是一个检测向量，应自动规避

## 许可证

**GPL-2.0-or-later** —— 你可以自由使用、修改与再分发，但衍生作品必须以同样的
许可证开源（GPLv2 或你选择的任何更新版本）。

`LICENSE` 文件是 GPLv2 的逐字原文。选择「或更新版本」这一点体现在
`package.json` 的 `license` 字段与各源文件头部的 SPDX 标识符中，
这是 GPL 项目的标准做法——授权版本的选择写在声明里，而非改动许可证正文。

> 关于「开源」：本项目是**真开源**（OSI 认证许可证），因此**允许他人商用**。
> GPL 限制的是「拿了代码却把改动闭源」，不是「不许赚钱」。
> 如果你要找的是「禁止他人商用」的许可证，那类许可证都不是开源许可证，
> 准确说法是「源码可见」（source-available）。
