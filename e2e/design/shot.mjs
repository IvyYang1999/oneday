import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 760, height: 560 }, deviceScaleFactor: 2 })
await page.goto("file://" + path.join(here, "variants.html"))
await page.screenshot({ path: path.join(here, "toggle-variants.png"), fullPage: true })
await browser.close()
console.log("saved e2e/design/toggle-variants.png")
