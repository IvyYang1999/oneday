/** 145fps！有人在驱动 rAF。找出源头：hook rAF 看回调里的函数名 */
import { chromium } from "playwright"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const page = browser.contexts()[0].pages()[0]
const result = await page.evaluate(() => new Promise((resolve) => {
  const names = new Map()
  const orig = window.requestAnimationFrame
  let count = 0
  const spy = (cb) => orig.call(window, (t) => {
    count++
    const fn = cb.name || cb.toString().slice(0, 60)
    names.set(fn, (names.get(fn) ?? 0) + 1)
    if (count < 300) cb(t)
    if (count >= 300) resolve([...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
    else spy(cb)
  })
  // 换掉全局 rAF 收集 300 帧的回调名
  window.requestAnimationFrame = spy
  setTimeout(() => resolve([...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)), 4000)
}))
console.log(JSON.stringify(result, null, 1))
await browser.close()
