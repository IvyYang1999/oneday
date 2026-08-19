/** RecalcStyleCount 117/6s！样式在持续重算。找出 invalidate 源：改 style 的 observer */
import { chromium } from "playwright"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const page = browser.contexts()[0].pages()[0]
const out = await page.evaluate(() => new Promise((resolve) => {
  // MutationObserver 记录 6s 内所有 style/class/子树变动
  const changes = new Map()
  const rec = (target, attr) => {
    const cls = (target.className?.toString?.() || target.nodeName).slice(0, 40)
    const key = `${cls}${attr ? " @" + attr : ""}`
    changes.set(key, (changes.get(key) ?? 0) + 1)
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") rec(m.target, m.attributeName)
      else if (m.type === "childList") rec(m.target)
    }
  })
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["style", "class"], childList: true })
  setTimeout(() => {
    mo.disconnect()
    resolve([...changes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12))
  }, 6000)
}))
console.log("6 秒内 DOM 变动：")
for (const [k, c] of out) console.log(String(c).padStart(5), k)
await browser.close()
