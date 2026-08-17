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
import { attachHoverInfo } from "${path.join(here, "../src/edit/hover-info")}"

const COLORS = { math: "#7fd4c1", sleep: "#d9d9d9", fitness: "#f6c667" }
const source = "07:00-08:00 sleep\\n"
const doc = parseTimeline(source)
const container = document.getElementById("app")
const toolbar = buildToolbar({
  typeColors: COLORS,
  hiddenTypes: ["fitness"],
  activeType: "math",
  mode: "actual",
  onSelect: (t) => { window.__active = t },
  onModeChange: (m) => { window.__mode = m },
  onHide: (t) => window.__hidden.push(t),
  onShow: (t) => window.__shown.push(t),
})
container.appendChild(toolbar.el)
const holder = document.createElement("div")
holder.innerHTML = renderTimelineSvg(doc, { typeColors: COLORS })
container.appendChild(holder)
container.appendChild(toolbar.statusEl)

window.__active = "math"
window.__mode = "actual"
window.__created = []
window.__menu = []
window.__focus = []
window.__hidden = []
window.__shown = []

attachHoverInfo(container, doc)
attachDrawInteraction(container, doc, {
  hourHeight: 48,
  getActiveType: () => window.__active,
  getMode: () => window.__mode,
  typeColor: (t) => COLORS[t] ?? "#bdbdbd",
  onBlockClick: (line) => window.__focus.push(line),
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
// 3. overlapping the sleep block (07:00-08:00) is now allowed (并列日程)
await drag(450, 510)
// 4. right-click the sleep block fires menu with line 0
await page.mouse.click(trackCX, yFor(450), { button: "right" })

// 5. plan mode: drag creates a plan-prefixed entry
await page.locator('.oneday-mode-btn[data-mode="plan"]').click()
await drag(900, 960) // 15:00-16:00 in plan mode

await page.mouse.move(trackCX, yFor(455))
await page.waitForSelector(".oneday-tooltip", { state: "visible" })
const tooltipText = await page.locator(".oneday-tooltip").innerText()
if (!tooltipText.includes("07:00") || !tooltipText.includes("1h") || !tooltipText.includes("sleep")) {
  console.error("tooltip mismatch:", tooltipText); process.exit(1)
}
const hoverCount = await page.evaluate(() => document.querySelectorAll(".is-hover").length)
if (hoverCount < 1) { console.error("no hover pairing"); process.exit(1) }

// 6. click (no drag) on the sleep block -> focus toggle callback
await page.locator('.oneday-mode-btn[data-mode="actual"]').click()
await page.mouse.click(trackCX, yFor(450))
// 7. toolbar: right-click a swatch hides it; "+" menu shows hidden ones back
await page.locator('.oneday-swatch[data-type="math"]').click({ button: "right" })
await page.locator(".oneday-add").click()
await page.locator('.oneday-add-item:has-text("fitness")').click()

const created = await page.evaluate(() => window.__created)
const menu = await page.evaluate(() => window.__menu)
console.log("created:", JSON.stringify(created))
console.log("menu:", JSON.stringify(menu))

const expectCreated = [
  { line: "10:00-11:30 math", startMin: 600 },
  { line: "12:30-14:00 math", startMin: 750 },
  { line: "07:30-08:30 math", startMin: 450 },
  { line: "plan 15:00-16:00 math", startMin: 900 },
]
if (JSON.stringify(created) !== JSON.stringify(expectCreated)) { console.error("created mismatch"); process.exit(1) }
if (menu.length !== 1 || menu[0].line !== 0) { console.error("menu mismatch"); process.exit(1) }
const focus = await page.evaluate(() => window.__focus)
if (focus.length !== 1 || focus[0] !== 0) { console.error("focus mismatch", JSON.stringify(focus)); process.exit(1) }
const hidden = await page.evaluate(() => window.__hidden)
const shown = await page.evaluate(() => window.__shown)
if (hidden.length !== 1 || hidden[0] !== "math") { console.error("hide mismatch", JSON.stringify(hidden)); process.exit(1) }
if (shown.length !== 1 || shown[0] !== "fitness") { console.error("show mismatch", JSON.stringify(shown)); process.exit(1) }
await browser.close()
console.log("OK draw smoke passed")
