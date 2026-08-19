/** CDP Performance.getMetrics + 强制渲染统计：找出渲染引擎在忙什么 */
import { chromium } from "playwright"
import { execSync } from "node:child_process"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const page = browser.contexts()[0].pages()[0]
const session = await page.context().newCDPSession(page)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await session.send("Performance.enable")
const snap = async () => {
  const { metrics } = await session.send("Performance.getMetrics")
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  return m
}
const a = await snap()
await sleep(6000)
const b = await snap()
const delta = {}
for (const k of Object.keys(b)) if (b[k] !== a[k]) delta[k] = b[k] - a[k]
console.log("6 秒内的增量指标：")
console.log(JSON.stringify(delta, null, 1))

// requestAnimationFrame 帧率：如果有人在持续 invalidate，rAF 会满帧
const fps = await page.evaluate(() => new Promise((resolve) => {
  let n = 0
  const t0 = performance.now()
  const tick = () => {
    n++
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
    else resolve((n / 3).toFixed(0))
  }
  requestAnimationFrame(tick)
}))
console.log("rAF fps:", fps, "(60=满帧有人在画)")
await browser.close()
