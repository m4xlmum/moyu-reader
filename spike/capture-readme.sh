#!/usr/bin/env bash
# README 那三张成品图的**原图**：把每一张按它该有的那条命令抓一遍，
# 再复制成 readme-assets.js 认得的规范名。
#
# 为什么要有这个脚本：原图与命令的对应关系原先只存在于我上一次敲过的终端历史里，
# 而「这张图是哪条命令跑出来的」正是 README 那句话（「四张都是真实渲染的截图，
# 没有任何手绘或摆拍」）能不能站住的地方。写下来之后，任何人跑一遍都能得到同一批原图。
#
# 两条容易搞混的尺寸规矩：
#   * 界面底板（chrome-*）抓的是**整扇窗** 1280×720，且**必须带 --alpha**——
#     它是垫在网页之上的那一层，正文区要透明，否则叠出来是一块灰底。
#   * 页面（home-*、settings）抓的是**正文区** 1232×676（--body），不是整扇窗。
#     抓整扇窗再塞进正文区那个矩形，图会被压扁（1280/720 与 1232/676 不是同一个比例），
#     而那在成品图上只是「看着有点扁」，很难认出来是哪个数字错了。
#
# 用法：bash spike/capture-readme.sh     （无头，不弹窗）
set -u
cd "$(dirname "$0")/.." || exit 1
OUT=spike/out/readme
mkdir -p "$OUT"
probe () { timeout 120 npx electron spike/preview.js "$@" --out "$OUT"; }
FAILED=0
cp_ () {
  if cp "$OUT/$1" "$OUT/$2"; then
    printf '%-26s ← %s\n' "$2" "$1"
  else
    # 复制失败必须当场算数：不记下来的话，目录里留着的就是**上一次**那张旧图，
    # 而旧图和新鲜图在文件名上长得一模一样（这次就撞上过一回）。
    printf '!! 复制失败：%s ← %s\n' "$2" "$1" >&2
    FAILED=$((FAILED + 1))
  fi
}

echo "===== 界面底板：整扇窗 1280×720，正文区透明 ====="
probe --alpha --width 1280 --height 720
probe --alpha --theme night --width 1280 --height 720
probe --alpha --theme crt-green --width 1280 --height 720
probe --alpha --theme crt-green --bg 0 --width 1280 --height 720
cp_ preview-default-1280x720.png            chrome.png
cp_ preview-default-night-1280x720.png      chrome-night.png
cp_ preview-default-crt-green-1280x720.png  chrome-crt-green.png
cp_ preview-default-crt-green-1280x720-bg0.png  chrome-crt-green-bg0.png

echo "===== 页面：按正文区 1232×676 渲染，叠进去是 1:1 ====="
probe --home --body --theme paper --width 1280 --height 720
probe --home --body --theme night --width 1280 --height 720
probe --home --body --theme crt-green --width 1280 --height 720
probe --settings --body --width 1280 --height 720
cp_ home-paper-1232x676.png     home-paper.png
cp_ home-night-1232x676.png     home-night.png
cp_ home-crt-green-1232x676.png home-crt-green.png
cp_ settings-1232x676.png       settings.png

echo "===== 弹出面板：真实窗口尺寸 320×420，1:1 ====="
probe --popover --width 320 --height 420
cp_ popover-sites-320x420.png   popover.png

echo "===== 悬浮球：40px 的球放大 5 倍，带透明通道 ====="
# --ball-zoom 5 而不是「抓一张大的」：球在自己那扇窗里是铺满的（40px 的窗里 40px 的球），
# 而球面上那枚图形是**固定 18px**——窗给到 200px，球跟着变成 200px，图形却还是 18px，
# 于是抓出来是一颗大球上趴着一个芝麻。把图形也放 5 倍（18→90）之后，
# 90/200 与真机的 18/40 都是 0.45，这张图才是那个球的等比放大，而不是一颗畸形的球。
probe --collapsed --alpha --width 200 --height 200 --ball-zoom 5
cp_ preview-collapsed-200x200-zoom5.png ball.png

echo "===== 成品名那一批（看时间戳，全该是刚刚） ====="
ls -la "$OUT"/chrome.png "$OUT"/chrome-night.png "$OUT"/chrome-crt-green.png \
       "$OUT"/chrome-crt-green-bg0.png "$OUT"/home-paper.png "$OUT"/home-night.png \
       "$OUT"/home-crt-green.png "$OUT"/settings.png "$OUT"/popover.png "$OUT"/ball.png |
  awk '{print $5, $6, $7, $8, $9}'

if [ "$FAILED" -ne 0 ]; then
  echo "有 $FAILED 张没复制成——上面那些成品名里混着旧图，别拿去发 README。" >&2
  exit 1
fi
echo "OK：10 张全部换成这一轮抓的原图。"
