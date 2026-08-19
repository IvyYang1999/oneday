/** rAF spy 没抓到——145fps 可能来自 rAF 之外（requestIdleCallback/定时器/wheel 事件）。直接数事件触发频率 */
import { chromium } from "playwright"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const page = browser.contexts()[0].pages()[0]
const counts = await page.evaluate(() => new Promise((resolve) => {
  const ev = {}
  const track = (name) => () => { ev[name] = (ev[name] ?? 0) + 1 }
  const names = ["pointermove", "mousemove", "scroll", "wheel", "resize", "keydown", "input", "pointerover", "mouseout", "mouseover"]
  const handlers = {}
  for (const n of names) { handlers[n] = track(n); window.addEventListener(n, handlers[n], true) }
  // rAF 单独数
  let raf = 0
  const tick = () => { raf++; if (raf < 1000) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  setTimeout(() => {
    for (const n of names) window.removeEventListener(n, handlers[n], true)
    resolve({ ...ev, rAF_5s: raf })
  }, 5000)
}))
console.log(JSON.stringify(counts, null, 1))
await browser.close()
