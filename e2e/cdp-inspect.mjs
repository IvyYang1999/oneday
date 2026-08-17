/** Attach to Obsidian via CDP and inspect the oneday block render state. */
import { chromium } from "playwright"

const browser = await chromium.connectOverCDP("http://127.0.0.1:9333")
const contexts = browser.contexts()
let found = null
for (const ctx of contexts) {
  for (const page of ctx.pages()) {
    const has = await page.evaluate(() => document.querySelector(".oneday-host, .oneday-container") !== null).catch(() => false)
    if (has) { found = page; break }
  }
  if (found) break
}
if (!found) {
  // dump page list for diagnosis
  for (const ctx of contexts) for (const p of ctx.pages()) console.log("page:", p.url())
  console.error("no oneday block found in any page")
  process.exit(1)
}
const state = await found.evaluate(() => {
  const host = document.querySelector(".oneday-host")
  const body = document.querySelector(".oneday-body")
  return {
    hostExists: !!host,
    hostSize: host ? { w: host.getBoundingClientRect().width, h: host.getBoundingClientRect().height } : null,
    bodyHeight: body?.style.height ?? null,
    slotCount: document.querySelectorAll(".oneday-slot").length,
    slotSample: [...document.querySelectorAll(".oneday-slot")].slice(0, 6).map((s) => ({
      id: s.dataset.slot,
      style: s.getAttribute("style"),
      contentLen: s.innerHTML.length,
      visible: s.getBoundingClientRect().width > 0 && s.getBoundingClientRect().height > 0,
    })),
    errors: [...document.querySelectorAll(".oneday-errors")].map((e) => e.textContent),
  }
})
console.log(JSON.stringify(state, null, 2))
await browser.close()
