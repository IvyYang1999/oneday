/**
 * Grid interact smoke: move (clone + snapped placeholder) and resize
 * (e-handle) with grid snapping + push-down, asserted via onCommit items.
 */
import esbuild from "esbuild"
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(os.tmpdir(), "oneday-grid-smoke")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

fs.writeFileSync(path.join(out, "entry.ts"), `
import { attachGridInteract, applyItemToSlot } from "${path.join(here, "../src/edit/grid-interact")}"
const body = document.getElementById("body")
const items = [
  { id: "toolbar", x: 0, y: 0, w: 12, h: 2 },
  { id: "timeline", x: 0, y: 2, w: 12, h: 10 },
]
for (const it of items) {
  const slot = document.createElement("div")
  slot.className = "oneday-slot"
  slot.dataset.slot = it.id
  slot.dataset.x = it.x; slot.dataset.y = it.y; slot.dataset.w = it.w; slot.dataset.h = it.h
  slot.textContent = it.id
  applyItemToSlot(slot, it)
  body.appendChild(slot)
}
body.style.height = "240px"
window.__committed = []
attachGridInteract(body, (items) => window.__committed.push(items))
`)
await esbuild.build({
  entryPoints: [path.join(out, "entry.ts")],
  bundle: true, format: "iife", logLevel: "silent",
  outfile: path.join(out, "bundle.js"),
})
const css = fs.readFileSync(path.join(here, "../styles.css"), "utf8")
const html = `<!doctype html><html><head><style>${css}
#body { position: relative; width: 600px; }
.oneday-slot { background: #eee; }
</style></head><body><div id="body"></div><script>${fs.readFileSync(path.join(out, "bundle.js"), "utf8")}</script></body></html>`
fs.writeFileSync(path.join(out, "index.html"), html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
page.on("pageerror", (e) => { console.error("pageerror:", e.message); process.exit(1) })
await page.goto("file://" + path.join(out, "index.html"))
await page.waitForSelector(".oneday-slot-grip")

const bodyBox = await page.locator("#body").boundingBox()
// cellW = 600/12 = 50, rowH = 20

// 1. move toolbar (grip) down ~5 rows: y 0 -> 5; timeline (y2,h10) should push below? toolbar h2 at y5 overlaps timeline(y2..12) -> timeline pushed to 7
const grip = await page.locator('.oneday-slot[data-slot="toolbar"] .oneday-slot-grip').boundingBox()
await page.mouse.move(grip.x + 4, grip.y + 4)
await page.mouse.down()
await page.mouse.move(grip.x + 4, grip.y + 4 + 100, { steps: 4 })
const during = await page.evaluate(() => ({
  clone: document.querySelector(".oneday-drag-clone") !== null,
  placeholder: document.querySelector('.oneday-slot[data-slot="toolbar"]')?.classList.contains("is-placeholder") ?? false,
}))
if (!during.clone || !during.placeholder) { console.error("missing clone/placeholder", during); process.exit(1) }
await page.mouse.up()

// 2. resize timeline via e-handle: w 12 -> 6 (drag left edge of right side)
const tl = await page.locator('.oneday-slot[data-slot="timeline"]').boundingBox()
await page.mouse.move(tl.x + tl.width - 2, tl.y + tl.height / 2)
await page.mouse.down()
await page.mouse.move(tl.x + 300, tl.y + tl.height / 2, { steps: 4 })
await page.mouse.up()

const commits = await page.evaluate(() => window.__committed)
await browser.close()
console.log("commits:", JSON.stringify(commits))
if (commits.length !== 2) { console.error("expected 2 commits"); process.exit(1) }
const [move, resize] = commits
const mvToolbar = move.find((i) => i.id === "toolbar")
const mvTimeline = move.find((i) => i.id === "timeline")
if (mvToolbar.y !== 5) { console.error("move y mismatch", mvToolbar); process.exit(1) }
if (mvTimeline.y !== 7) { console.error("push-down mismatch", mvTimeline); process.exit(1) }
const rzTimeline = resize.find((i) => i.id === "timeline")
if (rzTimeline.w !== 6) { console.error("resize w mismatch", rzTimeline); process.exit(1) }
console.log("OK grid smoke passed")
