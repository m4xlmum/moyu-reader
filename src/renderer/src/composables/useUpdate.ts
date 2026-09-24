/**
 * 更新状态的响应式镜像。
 *
 * 与 useWindowState / useConfig 逐字同构：挂载时拉一次、订阅广播、卸载退订。
 * 提示条与设置页各持有一份，靠同一条广播对齐——因此设置页点「下载」时，
 * 窗口顶部那条提示上的百分比是同一个数。
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { onMounted, onUnmounted, ref } from 'vue'
import type { UpdateState } from '@shared/types'

export function useUpdate() {
  const state = ref<UpdateState | null>(null)
  let unsubscribe: (() => void) | null = null

  onMounted(async () => {
    state.value = await window.moyu.update.get()
    unsubscribe = window.moyu.update.onState((next) => {
      state.value = next
    })
  })

  onUnmounted(() => unsubscribe?.())

  /** 查一次。手动查不受「自动检查更新」那个开关管 */
  async function check(): Promise<void> {
    state.value = await window.moyu.update.check()
  }

  async function download(): Promise<void> {
    state.value = await window.moyu.update.download()
  }

  /**
   * 起安装程序并退出本进程。
   *
   * 不等回执也不用回执——这个调用成功的话，本进程马上就不在了。
   */
  function install(): void {
    void window.moyu.update.install()
  }

  /** 忽略这个版本（传 null 是撤销）；下一次查到别的版本照常提示 */
  async function ignore(version: string | null): Promise<void> {
    state.value = await window.moyu.update.ignore({ version })
  }

  return { state, check, download, install, ignore }
}
