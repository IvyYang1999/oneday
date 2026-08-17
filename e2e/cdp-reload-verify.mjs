import { chromium } from "playwright"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
for (const ctx of browser.contexts()) {
  for (const page of ctx.pages()) {
    if (!(await page.evaluate(() => document.querySelector(".oneday-host") !== null).catch(() => false))) continue
    await page.reload()
    await page.waitForSelector(".oneday-slot", { timeout: 20000 })
    await page.waitForTimeout(1500)
    const probe = await page.evaluate(() => {
      const q = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }
      return { body: q(".oneday-body"), timeline: q(".oneday-slot-timeline"), text: q(".oneday-slot-text") }
    })
    console.log("after reload:", JSON.stringify(probe))
    const ok = probe.body && probe.body.w > 100 && probe.timeline && probe.timeline.w > 100
    console.log(ok ? "VERIFY OK" : "VERIFY FAIL")
  }
}
await browser.close()
