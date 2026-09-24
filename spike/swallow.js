/**
 * 主进程里「错误没人接」会发生什么（见 docs/spike-findings.md 的 Q30）。
 *
 * 这个脚本**故意出错**，用来量一件反直觉的事：两处错都不会把进程带走。
 *
 *   A) 一次没人 `.catch()` 的 promise 拒绝 —— 打一条 UnhandledPromiseRejectionWarning
 *      就过去了，进程照活；
 *   B) 定时器回调里抛出的同步异常 —— **连一行都不打**，进程照样活着。
 *
 * 于是「探针挂了」在终端上的表现可能是什么都没有：不是崩溃、不是报错，而是停在那里。
 * 这就是每个探针都要自己装 `process.on('unhandledRejection')` 的原因。
 *
 * 跑法：npx electron spike/swallow.js
 *      （它会自己退出；若两秒后没有打出「还活着」，说明本机行为与这里记的不一样）
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
const { app } = require('electron')

app.whenReady().then(() => {
  console.log('A) 丢一个没人接的 promise 拒绝出去——看它会不会带走进程')
  Promise.reject(new Error('探针故意丢的'))

  setTimeout(() => {
    console.log('B) 在定时器回调里抛一个同步异常——这次连警告都不会有')
    throw new Error('探针故意抛的')
  }, 100)

  setTimeout(() => {
    console.log('\n两秒后进程还活着：上面两处错都没能把主进程带走。')
    console.log('所以探针不能指望「崩了会报出来」——要自己装 unhandledRejection 与看门狗。')
    app.exit(0)
  }, 2000)
})
