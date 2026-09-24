<script setup lang="ts">
/**
 * 系统设置。分区导航 + 设置项。
 *
 * 快捷键改绑必须如实反馈注册失败——globalShortcut.register 返回 false 时是静默的，
 * 不提示的话用户会以为设置成功了。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  BALL_CUSTOM_FITS,
  BALL_ICONS,
  CUSTOM_BALL_ICON,
  HOME_THEMES,
  SIZE_PRESETS,
  type SizePreset
} from '@shared/constants'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, HotkeyInfo } from '@shared/types'
import BallGlyph from '../chrome/BallGlyph.vue'
import Icon from '../chrome/Icon.vue'
import BallIconCropper from './BallIconCropper.vue'
import { useBallIcon } from '../composables/useBallIcon'

type SectionKey = 'general' | 'stealth' | 'hotkey' | 'data' | 'about'

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'general', label: '通用' },
  { key: 'stealth', label: '隐蔽' },
  { key: 'hotkey', label: '快捷键' },
  { key: 'data', label: '数据' },
  { key: 'about', label: '关于' }
]

const active = ref<SectionKey>('general')
const config = ref<AppConfig | null>(null)
const hotkeys = ref<{ bossMinimize: HotkeyInfo; bossHideToTray: HotkeyInfo } | null>(null)
const hotkeyMessage = ref<string>('')
const capturing = ref<'bossMinimize' | 'bossHideToTray' | null>(null)

const sizePresets = computed(() => Object.keys(SIZE_PRESETS) as SizePreset[])
const SIZE_LABEL: Record<SizePreset, string> = {
  mini: '迷你',
  small: '小',
  medium: '中',
  large: '大'
}

/** 版本号来自构建时写入的 package.json，见 electron.vite.config.ts */
const APP_VERSION = __APP_VERSION__

/** 当前起始页主题的一句话说明，取自主题表，不在模板里再写一遍 */
const themeHint = computed(
  () => HOME_THEMES.find((t) => t.id === config.value?.ui.homeTheme)?.hint ?? ''
)

/**
 * 悬浮球图标。
 *
 * 它同时牵动两处：配置里的 ballIcon / ballCustomFit（内置图标与落法）与
 * 单独一份的自定义图。两份来源的拼接规则写在 useBallIcon 里，这一页只负责画。
 */
const {
  customSrc,
  choice: ballChoice,
  fit: ballFit,
  custom: ballCustom,
  setIcon,
  setFit,
  setImage
} = useBallIcon()

const cropperOpen = ref(false)

const fitHint = computed(() => BALL_CUSTOM_FITS.find((f) => f.id === ballFit.value)?.hint ?? '')

/** 图标选择器下面那一行说明。内置与自定义各说各的 */
const ballIconHint = computed(() =>
  ballChoice.value === CUSTOM_BALL_ICON
    ? fitHint.value
    : '球面上只有 18 像素画图形，所以每枚图标都只取剪影'
)

/**
 * 点「自定义」那一格。
 *
 * 已经有图就直接选它；还没有图就把裁剪弹窗打开——否则这一格点下去毫无反应，
 * 用户会以为它坏了。
 */
function pickCustom(): void {
  if (ballCustom.value) void setIcon(CUSTOM_BALL_ICON)
  else cropperOpen.value = true
}

/** 保存裁剪结果。存下来之后再把它选上，用户按「确定」的意图就是「用它」 */
async function saveCustomIcon(dataUrl: string): Promise<void> {
  cropperOpen.value = false
  await setImage(dataUrl)
  await setIcon(CUSTOM_BALL_ICON)
}

/**
 * 清除自定义图。
 *
 * 只清图，不自己改 ballIcon——主进程在清除时会顺手把选择退回内置图标
 * （见 ipc/registerDataIpc.ts），那一条规则只写在那一处。
 */
async function clearCustomIcon(): Promise<void> {
  await setImage(null)
}

let offConfig: (() => void) | null = null

onMounted(async () => {
  config.value = await window.moyu.config.get()
  hotkeys.value = await window.moyu.hotkey.list()
  // 起始页也能换主题，那一边改完只有这条广播会通知到这里。
  // 本页自己发的 patch 也会回广播一次，值相同，不冲突。
  offConfig = window.moyu.config.onChanged((next) => {
    config.value = next
  })
})

onUnmounted(() => {
  offConfig?.()
})

async function patch(input: ConfigPatch): Promise<void> {
  config.value = await window.moyu.config.patch(input)
}

async function reloadHotkeys(): Promise<void> {
  hotkeys.value = await window.moyu.hotkey.list()
}

/** 把键盘事件转成 Electron 的 accelerator 字符串 */
function toAccelerator(event: KeyboardEvent): string | null {
  const mods: string[] = []
  if (event.ctrlKey) mods.push('Control')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')

  const key = event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null
  // 必须带修饰键，否则会劫持用户所有的普通按键
  if (mods.length === 0) return null

  const name = key.length === 1 ? key.toUpperCase() : key
  return [...mods, name].join('+')
}

async function captureHotkey(
  which: 'bossMinimize' | 'bossHideToTray',
  event: KeyboardEvent
): Promise<void> {
  const accelerator = toAccelerator(event)
  if (!accelerator) {
    hotkeyMessage.value = '请至少带一个修饰键（Alt / Ctrl / Shift）'
    return
  }

  const result = await window.moyu.hotkey.set({ which, accelerator })
  hotkeyMessage.value = result.ok
    ? `已改为 ${result.accelerator}`
    : `注册失败：${result.reason ?? '未知原因'}`
  await reloadHotkeys()
}

function startCapture(which: 'bossMinimize' | 'bossHideToTray'): void {
  capturing.value = which
  hotkeyMessage.value = '请按下新的组合键（需包含 Alt / Ctrl / Shift）'
}

async function clearHistory(): Promise<void> {
  await window.moyu.history.clear()
  hotkeyMessage.value = '历史记录已清空'
}

// 模板里的 window 指向组件实例而非全局对象，因此全局调用都要包一层方法
function setSizePreset(preset: SizePreset): void {
  void window.moyu.win.setSize({ preset })
}
</script>

<template>
  <div class="layout">
    <nav class="sidebar">
      <div class="brand">摸鱼阅读</div>
      <button
        v-for="s in SECTIONS"
        :key="s.key"
        class="nav-item"
        :class="{ active: active === s.key }"
        @click="active = s.key"
      >
        {{ s.label }}
      </button>
    </nav>

    <main class="content" v-if="config">
      <!-- 通用 -->
      <section v-if="active === 'general'">
        <h2>通用</h2>

        <div class="card">
          <div class="field">
            <label>整体透明度</label>
            <div class="control">
              <input
                type="range"
                min="5"
                max="100"
                :value="Math.round(config.window.opacity * 100)"
                @input="
                  patch({
                    window: { opacity: Number(($event.target as HTMLInputElement).value) / 100 }
                  })
                "
              />
              <span class="value">{{ Math.round(config.window.opacity * 100) }}%</span>
            </div>
          </div>
          <p class="hint">
            无极调节，整扇窗一起淡，网页也跟着淡。下限为 5%：0% 会让窗口不可见却仍可交互，
            容易把自己锁在外面。真正要藏起来请用老板键或托盘。
          </p>

          <div class="field">
            <label>背景透明度</label>
            <div class="control">
              <input
                type="range"
                min="0"
                max="100"
                :value="Math.round(config.ui.backgroundOpacity * 100)"
                @input="
                  patch({
                    ui: {
                      backgroundOpacity: Number(($event.target as HTMLInputElement).value) / 100
                    }
                  })
                "
              />
              <span class="value">{{ Math.round(config.ui.backgroundOpacity * 100) }}%</span>
            </div>
          </div>
          <p class="hint">
            只淡界面自己画的底板：顶栏、地址栏、右侧栏与弹出面板。字与图标始终不透明，
            因此下限可以给到 0%——那时剩下的是浮在桌面上的一排按钮，仍然点得到，
            不会把自己锁在外面。<b>网页与这一页都不受影响</b>：它们是被读的内容，
            不是窗口的边框。两条滑块配合着用：整体管「连网页一起淡」，
            背景只管「窗口自己的边框」。
          </p>

          <div class="field">
            <label>窗口尺寸</label>
            <div class="control">
              <button v-for="p in sizePresets" :key="p" @click="setSizePreset(p)">
                {{ SIZE_LABEL[p] }}
              </button>
            </div>
          </div>

          <div class="field">
            <label>置顶</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.window.alwaysOnTop"
                @change="
                  patch({
                    window: { alwaysOnTop: ($event.target as HTMLInputElement).checked }
                  })
                "
              />
              <span class="dim">始终显示在其他窗口之上</span>
            </div>
          </div>

          <div class="field">
            <label>显示在任务栏</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.window.showInTaskbar"
                @change="
                  patch({
                    window: { showInTaskbar: ($event.target as HTMLInputElement).checked }
                  })
                "
              />
              <span class="warn">开启后会同时出现在 Alt+Tab 中，显著降低隐蔽性</span>
            </div>
          </div>

          <div class="field">
            <label>顶部功能栏</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.ui.topBarOpen"
                @change="
                  patch({ ui: { topBarOpen: ($event.target as HTMLInputElement).checked } })
                "
              />
              <span class="dim">
                藏起来之后悬浮球改浮在右上角，右键点球可以再把它叫回来
              </span>
            </div>
          </div>

          <div class="field">
            <label>右侧功能栏</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.ui.railOpen"
                @change="patch({ ui: { railOpen: ($event.target as HTMLInputElement).checked } })"
              />
              <span class="dim">顶栏藏起来时这一栏会被保留，它是悬浮球的落脚处</span>
            </div>
          </div>

          <div class="field">
            <label>起始页主题</label>
            <div class="control column">
              <div class="themes">
                <button
                  v-for="t in HOME_THEMES"
                  :key="t.id"
                  :class="{ on: config.ui.homeTheme === t.id }"
                  @click="patch({ ui: { homeTheme: t.id } })"
                >
                  {{ t.label }}
                </button>
              </div>
              <span class="dim">{{ themeHint }}</span>
            </div>
          </div>
          <p class="hint">
            主题不只换配色，还决定起始页披哪一层皮：纸白与暗夜是现代行式列表，磷绿是命令行。
            三套主题的划分与操作完全一致，换的只是观感。
            它只作用在起始页上——那是「自己的一页」，换个样子不影响阅读网页时的观感。
            起始页最底下那条状态行里也能直接换。
          </p>

          <div class="field">
            <label>悬浮球图标</label>
            <div class="control column">
              <div class="ball-icons">
                <button
                  v-for="i in BALL_ICONS"
                  :key="i.id"
                  class="ball-chip"
                  :class="{ on: ballChoice === i.id }"
                  :title="i.label"
                  :aria-label="i.label"
                  @click="setIcon(i.id)"
                >
                  <span class="ball-face"><BallGlyph :name="i.id" /></span>
                </button>

                <!--
                  最后一格是自定义。还没有图时点它直接开裁剪弹窗——
                  否则这一格点下去毫无反应，看起来像是坏的。
                -->
                <button
                  class="ball-chip"
                  :class="{ on: ballChoice === CUSTOM_BALL_ICON }"
                  :title="ballCustom ? '自定义图标' : '上传一张图当图标'"
                  aria-label="自定义图标"
                  @click="pickCustom"
                >
                  <span class="ball-face">
                    <img
                      v-if="ballCustom"
                      :src="customSrc ?? undefined"
                      alt=""
                      draggable="false"
                    />
                    <Icon v-else name="plus" :size="16" />
                  </span>
                </button>
              </div>

              <span class="dim">{{ ballIconHint }}</span>

              <div v-if="ballChoice === CUSTOM_BALL_ICON" class="ball-icon-ops">
                <div class="themes">
                  <button
                    v-for="f in BALL_CUSTOM_FITS"
                    :key="f.id"
                    :class="{ on: ballFit === f.id }"
                    @click="setFit(f.id)"
                  >
                    {{ f.label }}
                  </button>
                </div>
                <div class="themes">
                  <button @click="cropperOpen = true">
                    {{ ballCustom ? '重新裁剪' : '上传图片' }}
                  </button>
                  <button class="danger" :disabled="!ballCustom" @click="clearCustomIcon">
                    清除
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p class="hint">
            自定义的图按 128×128 存下来，不跟着球的大小变；上传之后还能随时换回内置的
            某一枚，图不会被删掉。这一排格子就是球本身那个尺寸，选中的那一格画的是
            它在球上的样子。
          </p>
        </div>
      </section>

      <!-- 隐蔽 -->
      <section v-if="active === 'stealth'">
        <h2>隐蔽</h2>

        <div class="card">
          <p class="hint">
            顶栏里那颗球是收起开关：点一下整个界面缩进球里，再点一下展开。
            收起时窗口是真的变小了，屏幕上不会留下任何看不见却仍在接收点击的区域。
          </p>

          <div class="field">
            <label>鼠标移出时自动收起</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.stealth.autoCollapse"
                @change="
                  patch({
                    stealth: { autoCollapse: ($event.target as HTMLInputElement).checked }
                  })
                "
              />
              <span class="dim">默认关闭。开启后鼠标移开一段时间也会自动收起</span>
            </div>
          </div>

          <div class="field" v-if="config.stealth.autoCollapse">
            <label>自动收起延迟</label>
            <div class="control">
              <input
                type="number"
                min="200"
                max="5000"
                step="100"
                :value="config.stealth.hideDelayMs"
                @change="
                  patch({
                    stealth: { hideDelayMs: Number(($event.target as HTMLInputElement).value) }
                  })
                "
              />
              <span class="dim">毫秒。数值越大越不容易误收起</span>
            </div>
          </div>

          <div class="field">
            <label>收起时暂停音视频</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.stealth.muteMediaOnCollapse"
                @change="
                  patch({
                    stealth: { muteMediaOnCollapse: ($event.target as HTMLInputElement).checked }
                  })
                "
              />
              <span class="dim">
                收起成球、藏进托盘、最小化都算；回到展开态接着放。右栏最上面那一格是同一个开关
              </span>
            </div>
          </div>

          <div class="field">
            <label>防截屏 / 防共享</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.stealth.contentProtection"
                @change="
                  patch({
                    stealth: { contentProtection: ($event.target as HTMLInputElement).checked }
                  })
                "
              />
              <span class="dim">
                开启后窗口不会出现在屏幕共享与截图中。注意：你自己截的图里也不会有它。
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 快捷键 -->
      <section v-if="active === 'hotkey'">
        <h2>快捷键</h2>

        <div class="card">
          <div class="field">
            <label>老板键 1 · 最小化 / 恢复</label>
            <div class="control">
              <button class="key" @click="startCapture('bossMinimize')">
                {{ capturing === 'bossMinimize' ? '按下组合键…' : hotkeys?.bossMinimize.accelerator || '未设置' }}
              </button>
              <span v-if="hotkeys && !hotkeys.bossMinimize.registered" class="warn">注册失败</span>
            </div>
          </div>

          <div class="field">
            <label>老板键 2 · 藏进托盘</label>
            <div class="control">
              <button class="key" @click="startCapture('bossHideToTray')">
                {{
                  capturing === 'bossHideToTray'
                    ? '按下组合键…'
                    : hotkeys?.bossHideToTray.accelerator || '未设置'
                }}
              </button>
              <span v-if="hotkeys && !hotkeys.bossHideToTray.registered" class="warn">注册失败</span>
            </div>
          </div>

          <input
            v-if="capturing"
            class="capture"
            type="text"
            readonly
            autofocus
            placeholder="请按下新的组合键"
            @keydown.prevent="captureHotkey(capturing, $event)"
          />

          <p v-if="hotkeyMessage" class="hint">{{ hotkeyMessage }}</p>

          <p class="hint">
            组合键被其它程序占用时注册会失败。这种情况下按钮旁会显示「注册失败」，
            请换一个组合键——否则窗口藏起来后可能只剩托盘图标能把它叫回来。
          </p>
        </div>
      </section>

      <!-- 数据 -->
      <section v-if="active === 'data'">
        <h2>数据</h2>
        <div class="card">
          <p class="hint">
            配置、站点、书签与历史保存在 <code>%APPDATA%\moyu-reader</code>。
            网页登录态由 Chromium 自行管理，位于同一目录下。
          </p>
          <div class="field">
            <label>浏览历史</label>
            <div class="control">
              <button class="danger" @click="clearHistory">清空历史记录</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section v-if="active === 'about'">
        <h2>关于</h2>
        <div class="card">
          <p><b>摸鱼阅读</b> · 版本 {{ APP_VERSION }}</p>
          <p class="hint">
            以 GPL-2.0-or-later 授权发布。你可以自由使用、修改与再分发，
            但衍生作品必须以同样的许可证开源。
          </p>
          <p class="hint">
            这是一个功能对标商业产品、但代码独立实现的项目：
            不包含任何来自该产品的资源或代码。
          </p>
          <p class="hint">
            <a href="https://github.com/m4xlmum/moyu-reader" target="_blank" rel="noreferrer">
              github.com/m4xlmum/moyu-reader
            </a>
          </p>
        </div>
      </section>
    </main>

    <!--
      裁剪弹窗。它在 .layout 之内而不是之外：这一页本身就是窗口里的一份文档，
      没有「页面之外」可放。定位是 fixed，所以与侧边栏、内容区互不影响。
    -->
    <BallIconCropper
      v-if="cropperOpen"
      :source="customSrc"
      :fit="ballFit"
      @save="saveCustomIcon"
      @cancel="cropperOpen = false"
    />
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
  /* 底板画在这里，而不是只画在 html/body 上：见样式表开头的说明 */
  background: var(--bg);
}

.sidebar {
  flex: 0 0 160px;
  padding: 14px 10px;
  background: #eef0f3;
  border-right: 1px solid var(--border);
}

.brand {
  padding: 4px 10px 14px;
  font-weight: 700;
}

.nav-item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  margin-bottom: 2px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-dim);
  text-align: left;
}

.nav-item:hover {
  background: #e2e5ea;
}

.nav-item.active {
  background: var(--card);
  color: var(--accent);
  font-weight: 600;
}

.content {
  flex: 1 1 auto;
  padding: 18px 22px;
  overflow-y: auto;
}

h2 {
  margin: 0 0 14px;
  font-size: 15px;
}

.card {
  padding: 14px 16px;
  margin-bottom: 14px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.field {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 7px 0;
}

.field > label {
  flex: 0 0 150px;
  padding-top: 2px;
  color: var(--text-dim);
}

.control {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.control.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.inline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.control button {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
}

.control button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.control button.danger {
  color: var(--danger);
}

.control button.danger:hover {
  border-color: var(--danger);
  background: #fdf3f2;
}

.themes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.control button.on {
  border-color: var(--accent);
  background: #eef4fd;
  color: var(--accent);
  font-weight: 600;
}

/* ---------------------------------------------------------------- 窄窗口 */

/*
 * 系统设置现在是窗口内的一页，宽度跟着主窗口走（最窄时正文只有四百多像素）。
 * 窄到放不下侧边栏时把它折成顶部一条：160px 的竖栏留在那儿，
 * 右边剩下的地方连一个设置项都排不开。
 */
@media (max-width: 720px) {
  .layout {
    flex-direction: column;
  }

  .sidebar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: none;
  }

  .nav-item {
    width: auto;
    margin-bottom: 0;
    white-space: nowrap;
  }

  .content {
    padding: 14px;
  }

  .field {
    flex-direction: column;
    gap: 4px;
  }

  .field > label {
    flex: 0 0 auto;
  }
}

.key {
  min-width: 140px;
  font-family: Consolas, monospace;
}

.capture {
  width: 100%;
  margin-top: 8px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  outline: none;
}

.value {
  min-width: 40px;
  color: var(--text-dim);
}

.dim {
  color: var(--text-dim);
}

.warn {
  color: var(--danger);
}

.hint {
  margin: 6px 0 0;
  color: var(--text-dim);
  line-height: 1.6;
}

/* ---------------------------------------------------------------- 悬浮球图标 */

/*
 * 图标选择器：一排 40px 的球面——与真实的球同样大小。
 * 选中的那一格直接画成球的样子（强调色底、白色图形），
 * 于是「选中的是哪一个」和「它长什么样」是同一件事，不必再看第二眼。
 *
 * 这些规则写成 `.ball-icons .ball-chip` 而不是只用 `.ball-chip`：
 * 上面那条 `.control button` 同样是「一个类 + 一个标签」的分量，
 * 单靠类名压不过它，只能靠写法比它更具体。
 */
.ball-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ball-icons .ball-chip {
  width: 40px;
  height: 40px;
  padding: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: #ffffff;
  color: var(--text-dim);
}

.ball-icons .ball-chip.on {
  border-color: transparent;
  background: var(--accent);
  color: #ffffff;
}

.ball-face {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}

.ball-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ball-icon-ops {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 4px;
}

code {
  padding: 1px 5px;
  background: #eef0f3;
  border-radius: 4px;
  font-family: Consolas, monospace;
}
</style>
