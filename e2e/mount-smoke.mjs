/**
 * Full-mount smoke: polyfill the Obsidian DOM helpers our code uses,
 * run renderTimelineInto on a doc with text section, assert every slot
 * has visible content. (Blank-block-after-restart reproducer.)
 */
import esbuild from "esbuild"
import { chromium } from "playwright"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(os.tmpdir(), "oneday-mount-smoke")
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

fs.writeFileSync(path.join(out, "entry.ts"), `
import { parseTimeline } from "${path.join(here, "../src/core/parser")}"
import { renderTimelineInto } from "${path.join(here, "../src/render/timeline-view")}"
import { attachGridInteract } from "${path.join(here, "../src/edit/grid-interact")}"

// minimal Obsidian DOM helper polyfills
HTMLElement.prototype.createDiv = function (opts = {}) {
  const d = document.createElement("div")
  if (opts.cls) d.className = opts.cls
  if (opts.text) d.textContent = opts.text
  this.appendChild(d)
  return d
}
HTMLElement.prototype.createEl = function (tag, opts = {}) {
  const d = document.createElement(tag)
  if (opts.cls) d.className = opts.cls
  if (opts.text) d.textContent = opts.text
  if (opts.attr) for (const [k, v] of Object.entries(opts.attr)) d.setAttribute(k, v)
  this.appendChild(d)
  return d
}
HTMLElement.prototype.addClass = function (c) { this.classList.add(c) }
HTMLElement.prototype.empty = function () { this.replaceChildren() }
window.createDiv = function (opts = {}) { return document.body.createDiv(opts) }

const source = \`date: 2026-08-18
range: 7-23
---
09:15-12:15 math 李林线代
12:15-13:30 meal 午饭
===
## 明日 to do
1. 线代\`
const doc = parseTimeline(source)
const el = document.getElementById("host")
try {
  renderTimelineInto(el, doc, { typeColors: { math: "#7fd4c1", meal: "#f5a3b7" } }, {
    renderMarkdown: (host, text) => { host.textContent = text },
    onSave: () => {},
  })
  attachGridInteract(el.querySelector(".oneday-body"), () => {})
  window.__ok = true
} catch (err) {
  window.__error = String(err && err.stack || err)
}
`)
await esbuild.build({
  entryPoints: [path.join(out, "entry.ts")],
  bundle: true, format: "iife", logLevel: "silent",
  outfile: path.join(out, "bundle.js"),
})
const css = fs.readFileSync(path.join(here, "../styles.css"), "utf8")
const html = `<!doctype html><html><head><style>${css}</style></head><body><div id="host" style="width:700px"></div><script>${fs.readFileSync(path.join(out, "bundle.js"), "utf8")}</script></body></html>`
fs.writeFileSync(path.join(out, "index.html"), html)

const browser = await chromium.launch()
const page = await browser.newPage()
page.on("pageerror", (e) => console.error("[pageerror]", e.message))
page.on("console", (m) => { if (m.type() === "error") console.error("[console]", m.text()) })
await page.goto("file://" + path.join(out, "index.html"))
await page.waitForTimeout(300)

const state = await page.evaluate(() => ({
  ok: window.__ok ?? false,
  error: window.__error ?? null,
  slots: [...document.querySelectorAll(".oneday-slot")].map((s) => ({
    id: s.dataset.slot, html: s.innerHTML.length, display: getComputedStyle(s).display,
    w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height,
  })),
  bodyH: document.querySelector(".oneday-body")?.style.height,
}))
await browser.close()
console.log(JSON.stringify(state, null, 2))
if (!state.ok) { console.error("MOUNT THREW"); process.exit(1) }
if (state.slots.length === 0 || state.slots.some((s) => s.html === 0)) { console.error("EMPTY SLOT"); process.exit(1) }
if (state.slots.some((s) => s.w === 0 || s.h === 0)) { console.error("COLLAPSED SLOT (zero size)"); process.exit(1) }
console.log("OK mount smoke passed")
