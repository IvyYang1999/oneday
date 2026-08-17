/**
 * M3 draw-interaction smoke in real Chromium: render timeline, drag on the
 * track with real mouse events, assert the entry line produced; right-click
 * a block, assert the menu callback fires. Run: npm run e2e:draw
 */
import esbuild from "esbuild"
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(os.tmpdir(), "oneday-draw-smoke")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

fs.writeFileSync(path.join(out, "entry.ts"), `
import { parseTimeline } from "${path.join(here, "../src/core/parser")}"
import { renderTimelineSvg } from "${path.join(here, "../src/render/svg-builder")}"
import { buildToolbar } from "${path.join(here, "../src/edit/toolbar")}"
import { attachDrawInteraction } from "${path.join(here, "../src/edit/draw-interaction")}"

const COLORS = { math: "#7fd4c1", sleep: "#d9d9d9", fitness: "#f6c667" }
const source = "07:00-08:00 sleep\\n"
const doc = parseTimeline(source)
const container = document.getElementById("app")
const toolbar = buildToolbar({ typeColors: COLORS, activeType: "math", onSelect: (t) => { window.__active = t } })
container.appendChild(toolbar.el)
const holder = document.createElement("div")
holder.innerHTML = renderTimelineSvg(doc, { typeColors: COLORS })
container.appendChild(holder)
container.appendChild(toolbar.statusEl)

window.__active = "math"
window.__created = []
window.__menu = []

attachDrawInteraction(container, doc, {
  hourHeight: 48,
  getActiveType: () => window.__active,
  typeColor: (t) => COLORS[t] ?? "#bdbdbd",
  onCreate: (line, startMin) => window.__created.push({ line, startMin }),
  onBlockMenu: (line, x, y) => window.__menu.push({ line, x, y }),
})
`)
await esbuild.build({
  entryPoints: [path.join(out, "entry.ts")],
  bundle: true, format: "iife", logLevel: "silent",
  outfile: path.join(out, "bundle.js"),
})
const html = `<!doctype html><html><body style="margin:0"><div id="app" style="width:200px"></div><script>${fs.readFileSync(path.join(out, "bundle.js"), "utf8")}</script></body></html>`
fs.writeFileSync(path.join(out, "index.html"), html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 1000 } })
page.on("pageerror", (e) => { console.error("pageerror:", e.message); process.exit(1) })
await page.goto("file://" + path.join(out, "index.html"))
await page.waitForSelector("svg.oneday-svg")

const box = await page.locator("svg.oneday-svg").boundingBox()
// geometry: hourHeight 48, rangeStart 420 (7:00), PAD_TOP 8, LABEL_W 36, TRACK_PAD 6
const yFor = (min) => box.y + 8 + ((min - 420) / 60) * 48
const trackCX = box.x + 36 + (200 - 36 - 6) / 2

async function drag(fromMin, toMin) {
  await page.mouse.move(trackCX, yFor(fromMin))
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(trackCX, yFor(fromMin + ((toMin - fromMin) * i) / 6))
  }
  await page.mouse.up()
}

// 1. drag down 10:00 -> 11:30 creates a math block
await drag(600, 690)
// 2. drag up 14:00 -> 12:30 also works
await drag(840, 750)
// 3. overlapping the sleep block (07:00-08:00) is rejected
await drag(450, 510)
// 4. right-click the sleep block fires menu with line 0
await page.mouse.click(trackCX, yFor(450), { button: "right" })

const created = await page.evaluate(() => window.__created)
const menu = await page.evaluate(() => window.__menu)
console.log("created:", JSON.stringify(created))
console.log("menu:", JSON.stringify(menu))
await browser.close()

const expectCreated = [
  { line: "10:00-11:30 math", startMin: 600 },
  { line: "12:30-14:00 math", startMin: 750 },
]
if (JSON.stringify(created) !== JSON.stringify(expectCreated)) { console.error("created mismatch"); process.exit(1) }
if (menu.length !== 1 || menu[0].line !== 0) { console.error("menu mismatch"); process.exit(1) }
console.log("OK draw smoke passed")
