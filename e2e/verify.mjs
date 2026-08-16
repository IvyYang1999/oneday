import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto("file://" + path.join(here, ".smoke", "index.html"))
await page.waitForSelector("svg.oneday-svg")
const counts = await page.evaluate(() => ({
  blocks: document.querySelectorAll("rect.oneday-block").length,
  plans: document.querySelectorAll("rect.oneday-plan").length,
  durations: [...document.querySelectorAll("text.oneday-duration")].map((t) => t.textContent),
  thin: document.querySelectorAll("text.oneday-thin").length,
  annos: [...document.querySelectorAll("text.oneday-anno")].map((t) => t.textContent),
  hours: [...document.querySelectorAll("text.oneday-hour")].map((t) => t.textContent).join(","),
}))
console.log(JSON.stringify(counts, null, 2))
await browser.close()
