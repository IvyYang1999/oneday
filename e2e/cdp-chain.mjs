import { chromium } from "playwright"
const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
for (const ctx of browser.contexts()) {
  for (const page of ctx.pages()) {
    const has = await page.evaluate(() => document.querySelector(".oneday-host") !== null).catch(() => false)
    if (!has) continue
    console.log("PAGE:", await page.title())
    const probe = await page.evaluate(() => {
      const q = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), display: cs.display, visibility: cs.visibility, opacity: cs.opacity }
      }
      return {
        host: q(".oneday-host"),
        container: q(".oneday-container"),
        body: q(".oneday-body"),
        slotToolbar: q(".oneday-slot-toolbar"),
        slotTimeline: q(".oneday-slot-timeline"),
        svg: q("svg.oneday-svg"),
      }
    })
    console.log(JSON.stringify(probe, null, 1))
  }
}
await browser.close()
