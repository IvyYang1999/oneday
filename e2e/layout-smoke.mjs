/**
 * Layout drag smoke: floating clone + drop placeholder (rbd/SortableJS pattern).
 * Two columns of slots; drag "stats" grip below "dialog"; assert clone +
 * placeholder during drag and committed order after drop.
 */
import esbuild from "esbuild"
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(os.tmpdir(), "oneday-layout-smoke")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

fs.writeFileSync(path.join(out, "entry.ts"), `
import { attachLayoutDrag } from "${path.join(here, "../src/edit/layout-drag")}"
const body = document.getElementById("body")
for (const ids of [["text"], ["toolbar", "timeline", "stats", "dialog"]]) {
  const colEl = document.createElement("div")
  colEl.className = "oneday-col"
  for (const id of ids) {
    const slot = document.createElement("div")
    slot.className = "oneday-slot"
    slot.dataset.slot = id
    slot.textContent = id
    slot.style.height = "40px"
    colEl.appendChild(slot)
  }
  body.appendChild(colEl)
}
window.__committed = []
window.__during = null
attachLayoutDrag(body, (cols) => window.__committed.push(cols))
`)
await esbuild.build({
  entryPoints: [path.join(out, "entry.ts")],
  bundle: true, format: "iife", logLevel: "silent",
  outfile: path.join(out, "bundle.js"),
})
const css = fs.readFileSync(path.join(here, "../styles.css"), "utf8")
const html = `<!doctype html><html><head><style>${css}
#body { display: flex; gap: 12px; }
.oneday-col { width: 200px; border: 1px solid #ccc; }
</style></head><body><div id="body"></div><script>${fs.readFileSync(path.join(out, "bundle.js"), "utf8")}</script></body></html>`
fs.writeFileSync(path.join(out, "index.html"), html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 600, height: 400 } })
page.on("pageerror", (e) => { console.error("pageerror:", e.message); process.exit(1) })
await page.goto("file://" + path.join(out, "index.html"))
await page.waitForSelector(".oneday-slot-grip")

const grip = await page.locator('.oneday-slot[data-slot="stats"] .oneday-slot-grip').boundingBox()
const dialogSlot = await page.locator('.oneday-slot[data-slot="dialog"]').boundingBox()

await page.mouse.move(grip.x + 4, grip.y + 4)
await page.mouse.down()
await page.mouse.move(grip.x + 4, grip.y + 60, { steps: 3 })
// mid-drag state: clone exists, original is placeholder
const during = await page.evaluate(() => ({
  clone: document.querySelector(".oneday-drag-clone") !== null,
  placeholder: document.querySelector('.oneday-slot[data-slot="stats"]')?.classList.contains("is-placeholder") ?? false,
}))
console.log("during drag:", JSON.stringify(during))
if (!during.clone || !during.placeholder) { console.error("missing clone/placeholder"); process.exit(1) }

// drop below dialog
await page.mouse.move(dialogSlot.x + 50, dialogSlot.y + dialogSlot.height - 4, { steps: 3 })
await page.mouse.up()

const committed = await page.evaluate(() => window.__committed)
await browser.close()
console.log("committed:", JSON.stringify(committed))
const expected = [["text"], ["toolbar", "timeline", "dialog", "stats"]]
if (JSON.stringify(committed[committed.length - 1]) !== JSON.stringify(expected)) {
  console.error("order mismatch"); process.exit(1)
}
console.log("OK layout smoke passed")
