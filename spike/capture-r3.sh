#!/usr/bin/env bash
# 起始页改版第三轮取证：把评审要的十二个名字按同一条路数重跑一遍，
# 另加收尾线、无动画、展示字三件新证据。
#
# 每一跑都开自己的 --out 目录：图名是按「页 + 主题 + 尺寸 + 栏目」拼的，
# 同一档跑两条不同的路（比如 --plate local 与 --open-file）会写出同名文件，
# 上一张被下一张盖掉，而「盖掉」在文件系统上不留痕迹。
set -u
cd "$(dirname "$0")/.." || exit 1
OUT=spike/out/r3
rm -rf "$OUT"
probe () { timeout 120 npx electron spike/preview.js "$@"; }

echo "===== 1/6 三套主题 @912（首页 + 主题面板打开那一张） ====="
probe --home --body --themes --out "$OUT/themes"

echo "===== 2/6 三套主题 @480x270（迷你档） ====="
probe --home --body --themes --width 480 --height 270 --out "$OUT/mini"

echo "===== 3/6 栏目：离线阅读 / 视频 / 刷题 ====="
probe --home --body --plate local --out "$OUT/plates"
probe --home --body --plate local --width 480 --height 270 --out "$OUT/plates"
probe --home --body --plate video --out "$OUT/plates"
probe --home --body --plate quiz --out "$OUT/plates"
probe --home --body --plate quiz --width 480 --height 270 --out "$OUT/plates"

echo "===== 4/6 打开本机文件那一步 ====="
probe --home --body --open-file '斗破苍穹.txt,三体（全集）.pdf' --out "$OUT/openfile"

echo "===== 5/6 地址栏展开那一档 ====="
probe --home --body --address-open --out "$OUT/address"

echo "===== 6/6 换栏那条动画：关掉 / 打开「减少动态效果」各一跑 ====="
probe --home --body --no-reduced-motion --out "$OUT/motion-off"
probe --home --body --reduced-motion --out "$OUT/motion-on"

echo "===== 产物 ====="
find "$OUT" -type f | sort
