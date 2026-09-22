<script setup lang="ts">
/**
 * 个人中心。分区导航 + 设置项。
 *
 * 快捷键改绑必须如实反馈注册失败——globalShortcut.register 返回 false 时是静默的，
 * 不提示的话用户会以为设置成功了。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { computed, onMounted, ref } from 'vue'
import { SIZE_PRESETS, type SizePreset } from '@shared/constants'
import type { ConfigPatch } from '@shared/ipc'
import type { AppConfig, BallCorner, HotkeyInfo } from '@shared/types'

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

const BALL_CORNERS: Array<{ value: BallCorner; label: string }> = [
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下' }
]

onMounted(async () => {
  config.value = await window.moyu.config.get()
  hotkeys.value = await window.moyu.hotkey.list()
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

function toggleMiniMode(event: Event): void {
  void window.moyu.win.toggleMini({ enabled: (event.target as HTMLInputElement).checked })
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
            <label>默认透明度</label>
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
            无极调节。下限为 5%：0% 会让窗口不可见却仍可交互，容易把自己锁在外面。
            真正要藏起来请用老板键或托盘。
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
            <label>迷你模式</label>
            <div class="control">
              <input
                type="checkbox"
                :checked="config.window.miniMode"
                @change="toggleMiniMode"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 隐蔽 -->
      <section v-if="active === 'stealth'">
        <h2>隐蔽</h2>

        <div class="card">
          <p class="hint">
            窗口角上那颗球是收起开关：点一下整个界面缩进球里，再点一下展开。
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
            <label>悬浮球停靠位置</label>
            <div class="control">
              <button
                v-for="c in BALL_CORNERS"
                :key="c.value"
                :class="{ active: config.stealth.ballCorner === c.value }"
                @click="patch({ stealth: { ballCorner: c.value } })"
              >
                {{ c.label }}
              </button>
              <span class="dim">指窗口的哪个角</span>
            </div>
          </div>

          <div class="field">
            <label>悬浮球大小</label>
            <div class="control">
              <input
                type="range"
                min="36"
                max="96"
                step="2"
                :value="config.stealth.ballSize"
                @input="
                  patch({
                    stealth: { ballSize: Number(($event.target as HTMLInputElement).value) }
                  })
                "
              />
              <span class="value">{{ config.stealth.ballSize }} px</span>
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
          <p><b>摸鱼阅读</b> · 版本 0.1.0</p>
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
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  height: 100%;
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

code {
  padding: 1px 5px;
  background: #eef0f3;
  border-radius: 4px;
  font-family: Consolas, monospace;
}
</style>
