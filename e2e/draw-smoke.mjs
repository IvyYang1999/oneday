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
import { buildLayerToggles, buildToolbar } from "${path.join(here, "../src/edit/toolbar")}"
import { attachDrawInteraction } from "${path.join(here, "../src/edit/draw-interaction")}"
import { attachHoverInfo } from "${path.join(here, "../src/edit/hover-info")}"
import { showActionMenuAtPoint } from "${path.join(here, "../src/edit/custom-menu")}"
import { attachCascadeMenu } from "${path.join(here, "../src/edit/cascade-menu")}"

const COLORS = { math: "#7fd4c1", sleep: "#d9d9d9", fitness: "#f6c667" }
const source = "07:00-08:00 sleep\\n15:30-15:55 sleep\\nplan 07:00-09:00 math\\n"
const doc = parseTimeline(source)
const container = document.getElementById("app")
const toolbar = buildToolbar({
  typeColors: COLORS,
  hiddenTypes: ["fitness"],
  activeType: "math",
  brushMode: "actual",
  onBrushModeChange: (m) => { window.__mode = m },
  onSelect: (t) => { window.__active = t },
  onHide: (t) => window.__hidden.push(t),
  onShow: (t) => window.__shown.push(t),
  onAddNew: () => { window.__addNew += 1 },
})
container.appendChild(toolbar.el)
const holder = document.createElement("div")
holder.innerHTML = renderTimelineSvg(doc, { typeColors: COLORS })
container.appendChild(holder)
container.appendChild(toolbar.statusEl)
const layerToggles = buildLayerToggles({ actual: true, plan: true }, () => {})
layerToggles.id = "layer-toggle-size-check"
container.appendChild(layerToggles)

window.__active = "math"
window.__mode = "actual"
window.__created = []
window.__menu = []
window.__focus = []
window.__hidden = []
window.__shown = []
window.__addNew = 0
window.__mountNoHiddenToolbar = () => {
  const noHidden = buildToolbar({
    typeColors: COLORS,
    hiddenTypes: [],
    activeType: "math",
    brushMode: "actual",
    onBrushModeChange: () => {},
    onSelect: () => {},
    onHide: () => {},
    onShow: () => {},
    onAddNew: () => { window.__addNew += 1 },
  })
  noHidden.el.id = "no-hidden-toolbar"
  container.appendChild(noHidden.el)
}
window.__mountEmptyToolbars = () => {
  const zero = buildToolbar({
    typeColors: {},
    hiddenTypes: [],
    activeType: "",
    brushMode: "actual",
    onBrushModeChange: () => {},
    onSelect: () => {},
    onHide: () => {},
    onShow: () => {},
    onAddNew: () => { window.__addNew += 1 },
  })
  zero.el.id = "zero-toolbar"
  container.appendChild(zero.el)
  const allHidden = buildToolbar({
    typeColors: { math: COLORS.math },
    hiddenTypes: ["math"],
    activeType: "",
    brushMode: "actual",
    onBrushModeChange: () => {},
    onSelect: () => {},
    onHide: () => {},
    onShow: (type) => window.__shown.push(type),
    onAddNew: () => { window.__addNew += 1 },
  })
  allHidden.el.id = "all-hidden-toolbar"
  container.appendChild(allHidden.el)
}
window.__componentHidden = 0
window.__showComponentMenu = (x, y) => showActionMenuAtPoint(
  document, x, y, "统计组件操作", "隐藏", () => { window.__componentHidden += 1 }
)
window.__cascadeSelected = []
window.__mountCascadeFixture = (left = 80) => {
  document.querySelector("#cascade-fixture")?.remove()
  const primary = document.createElement("div")
  primary.id = "cascade-fixture"
  primary.className = "menu"
  primary.style.cssText = "position:fixed;left:" + left + "px;top:180px;width:150px;padding:4px"
  const trigger = document.createElement("button")
  trigger.type = "button"
  trigger.className = "menu-item"
  trigger.textContent = "更改类型…"
  const sibling = document.createElement("button")
  sibling.type = "button"
  sibling.className = "menu-item"
  sibling.textContent = "删除色块"
  primary.append(trigger, sibling)
  document.body.appendChild(primary)
  attachCascadeMenu(primary, trigger, [
    { title: "开发", checked: true },
    { title: "运动", checked: false },
    { title: "睡觉", checked: false },
  ], "选择色块类型", (index) => {
    window.__cascadeSelected.push(index)
    primary.remove()
  })
}
window.__trackmenu = []
window.__extend = []
window.__editing = null
window.__editnotes = []
window.__span = []

attachHoverInfo(container, doc)
attachDrawInteraction(container, doc, {
  hourHeight: 48,
  getActiveType: () => window.__active,
  getMode: () => window.__mode,
  typeColor: (t) => COLORS[t] ?? "#bdbdbd",
  onBlockClick: (line) => window.__focus.push(line),
  onTrackMenu: (x, y) => window.__trackmenu.push({ x, y }),
  onExtendRange: (startMin, endMin) => window.__extend.push({ startMin, endMin }),
  onEditNote: (line) => window.__editnotes.push(line),
  getEditingLine: () => window.__editing,
  setEditingLine: (l) => { window.__editing = l },
  onUpdateSpan: (line, startMin, endMin) => window.__span.push({ line, startMin, endMin }),
  onCreate: (line, startMin) => window.__created.push({ line, startMin }),
  onBlockMenu: (line, x, y) => window.__menu.push({ line, x, y }),
})
`)
await esbuild.build({
  entryPoints: [path.join(out, "entry.ts")],
  bundle: true, format: "iife", logLevel: "silent",
  outfile: path.join(out, "bundle.js"),
})
const css = fs.readFileSync(path.join(here, "../styles.css"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="margin:0"><div id="app" class="oneday-container" style="width:200px;position:relative"></div><script>${fs.readFileSync(path.join(out, "bundle.js"), "utf8")}</script></body></html>`
fs.writeFileSync(path.join(out, "index.html"), html)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 1000 } })
page.on("pageerror", (e) => { console.error("pageerror:", e.message); process.exit(1) })
await page.goto("file://" + path.join(out, "index.html"))
const setTheme = async (dark) => page.evaluate((isDark) => {
  const root = document.documentElement.style
  root.setProperty("--background-primary", isDark ? "rgb(30, 30, 30)" : "rgb(245, 245, 245)")
  root.setProperty("--background-secondary", isDark ? "rgb(38, 38, 38)" : "rgb(238, 238, 238)")
  root.setProperty("--background-modifier-hover", isDark ? "rgb(52, 52, 52)" : "rgb(224, 224, 224)")
  root.setProperty("--background-modifier-border", isDark ? "rgb(70, 70, 70)" : "rgb(205, 205, 205)")
  root.setProperty("--text-normal", isDark ? "rgb(225, 225, 225)" : "rgb(32, 32, 32)")
  root.setProperty("--text-muted", isDark ? "rgb(170, 170, 170)" : "rgb(100, 100, 100)")
  root.setProperty("--text-accent", isDark ? "rgb(166, 126, 255)" : "rgb(127, 85, 255)")
  document.body.style.background = isDark ? "rgb(30, 30, 30)" : "rgb(245, 245, 245)"
}, dark)
await setTheme(false)
await page.waitForSelector("svg.oneday-svg")

const box = await page.locator("svg.oneday-svg").boundingBox()
// geometry: hourHeight 48, rangeStart 420 (7:00), PAD_TOP 8, LABEL_W 36, TRACK_PAD 6
const yFor = (min) => box.y + 8 + ((min - 420) / 60) * 48
const trackCX = box.x + 36 + (200 - 36 - 6) / 2

const snap5 = (min) => Math.round(min / 5) * 5
const clock = (min) => {
  const wrapped = ((min % (24 * 60)) + 24 * 60) % (24 * 60)
  return String(Math.floor(wrapped / 60)).padStart(2, "0") + ":" + String(wrapped % 60).padStart(2, "0")
}

async function assertLiveSpan(fromMin, toMin, { short = false, screenshot = "" } = {}) {
  const expectedMinutes = [snap5(fromMin), snap5(toMin)].sort((a, b) => a - b)
  const state = await page.evaluate(() => {
    const labels = [...document.querySelectorAll(".oneday-span-preview-label")].map((label) => ({
      text: label.querySelector(".oneday-span-preview-label-text")?.textContent,
      minute: Number(label.dataset.minute),
      edgeY: Number(label.dataset.edgeY),
      labelY: Number(label.dataset.labelY),
      leaderCount: label.querySelectorAll(".oneday-span-preview-leader").length,
    }))
    return {
      labels,
      status: document.querySelector(".oneday-draw-status")?.textContent ?? "",
    }
  })
  const expectedText = expectedMinutes.map(clock)
  if (JSON.stringify(state.labels.map((label) => label.text)) !== JSON.stringify(expectedText) ||
      JSON.stringify(state.labels.map((label) => label.minute)) !== JSON.stringify(expectedMinutes) ||
      state.status.trim() !== "") {
    console.error("live boundary labels mismatch", { state, expectedText, expectedMinutes }); process.exit(1)
  }
  const edgeGap = state.labels[1].edgeY - state.labels[0].edgeY
  const labelGap = state.labels[1].labelY - state.labels[0].labelY
  if (short) {
    if (edgeGap >= 8 || labelGap < 15 || state.labels.every((label) => label.leaderCount === 0)) {
      console.error("short-span labels did not separate while preserving true edges", { state, edgeGap, labelGap }); process.exit(1)
    }
  } else if (state.labels.some((label) => Math.abs(label.labelY - label.edgeY) > 0.5 || label.leaderCount !== 0)) {
    console.error("normal-span labels drifted from their edges", state); process.exit(1)
  }
  if (screenshot) await page.locator("svg.oneday-svg").screenshot({ path: path.join(out, screenshot) })
}

async function drag(fromMin, toMin, preview = null) {
  await page.mouse.move(trackCX, yFor(fromMin))
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(trackCX, yFor(fromMin + ((toMin - fromMin) * i) / 6))
  }
  if (preview) await assertLiveSpan(fromMin, toMin, preview)
  await page.mouse.up()
  if (await page.locator(".oneday-span-preview-labels").count() !== 0) {
    console.error("live boundary labels survived pointerup"); process.exit(1)
  }
}

// 1. creation snaps independently to a 5-minute grid (10:07 -> 11:32 becomes 10:05 -> 11:30)
await drag(607, 692, { screenshot: "live-span-normal.png" })
// 2. drag up 14:00 -> 12:30 also works
await drag(840, 750)
const optimistic = await page.evaluate(() => document.querySelectorAll(".oneday-preview-block").length)
if (optimistic < 2) { console.error("no optimistic preview blocks", optimistic); process.exit(1) }
// 3. overlapping the sleep block (07:00-08:00) is now allowed (并列日程)
await drag(450, 510)
// 3a. A five-minute block keeps both exact labels readable. Their copy may
// separate, but the ticks remain on the true four-pixel-apart boundaries.
await setTheme(true)
await drag(1140, 1147, { short: true, screenshot: "live-span-five-minute.png" })
await setTheme(false)
// 4. right-click the sleep block fires menu with line 0
await page.mouse.click(trackCX, yFor(450), { button: "right" })

// 5. plan mode: drag creates a plan-prefixed entry
await page.locator('.oneday-brush-toggle .oneday-mode-btn[data-mode="plan"]').click()
await drag(900, 960) // 15:00-16:00 in plan mode

// 5a. no visible highlighter: blank track cannot invent a hidden "misc" block.
const createdBeforeDisabledDraw = await page.evaluate(() => {
  window.__active = ""
  return window.__created.length
})
await drag(1200, 1260)
const disabledDrawState = await page.evaluate(() => ({
  created: window.__created.length,
  cursor: document.querySelector("svg.oneday-svg").style.cursor,
}))
if (disabledDrawState.created !== createdBeforeDisabledDraw || disabledDrawState.cursor !== "default") {
  console.error("drawing without a visible highlighter was not disabled", disabledDrawState); process.exit(1)
}
await page.evaluate(() => { window.__active = "math" })

await page.mouse.move(trackCX, yFor(455))
await page.waitForSelector(".oneday-tooltip", { state: "visible" })
const tooltipText = await page.locator(".oneday-tooltip").innerText()
if (!tooltipText.includes("07:00") || !tooltipText.includes("1h") || !tooltipText.includes("sleep")) {
  console.error("tooltip mismatch:", tooltipText); process.exit(1)
}
const hoverCount = await page.evaluate(() => document.querySelectorAll(".is-hover").length)
if (hoverCount < 1) { console.error("no hover pairing"); process.exit(1) }

// 5d. axis extension: drag below the 23:00 line down to 26:00 (hour snap)
{
  await page.evaluate(() => { window.__active = "" })
  const yBottom = yFor(23 * 60)
  await page.mouse.move(trackCX, yBottom + 6)
  await page.mouse.down()
  await page.mouse.move(trackCX, yFor(26 * 60 + 20), { steps: 5 }) // 26:20 -> snap 26:00
  const previewTicks = await page.evaluate(() => document.querySelectorAll(".oneday-extend-preview .oneday-extend-tick").length)
  if (previewTicks < 2) { console.error("no extend preview ticks", previewTicks); process.exit(1) }
  await page.mouse.up()
  await page.evaluate(() => { window.__active = "math" })
}

// 5e. Selecting an actual record must not reveal the lower plan hatch. Then
// prove resize and move share the same canonical 5-minute grid as creation.
await page.mouse.click(trackCX, yFor(450))
const editLayerState = await page.evaluate(() => {
  const frozenActual = document.querySelector('rect.oneday-block[data-line="1"]')
  const planHatch = document.querySelector('rect.oneday-plan-hatch[data-line="2"]')
  const selectedActual = document.querySelector('rect.oneday-block[data-line="0"]')
  return {
    selectedFillOpacity: getComputedStyle(selectedActual).fillOpacity,
    frozenActualOpacity: getComputedStyle(frozenActual).opacity,
    planHatchOpacity: getComputedStyle(planHatch).opacity,
  }
})
if (editLayerState.selectedFillOpacity !== "0.95" || editLayerState.frozenActualOpacity !== "0.3" || editLayerState.planHatchOpacity !== "0.3") {
  console.error("edit compositing exposed the plan above records", editLayerState); process.exit(1)
}
await page.locator("svg.oneday-svg").screenshot({ path: path.join(out, "record-above-plan-edit-state.png") })
await page.mouse.move(trackCX, yFor(480) - 2) // 底沿
await page.mouse.down()
await page.mouse.move(trackCX, yFor(547), { steps: 4 }) // 09:07 -> 09:05
await assertLiveSpan(420, 545)
await page.mouse.up()
if (await page.locator(".oneday-span-preview-labels").count() !== 0) {
  console.error("resize labels survived pointerup"); process.exit(1)
}
await page.mouse.move(trackCX, yFor(450)) // 中部
await page.mouse.down()
await page.mouse.move(trackCX, yFor(637), { steps: 4 }) // 10:37 -> start 10:05
await assertLiveSpan(605, 665)
await page.mouse.up()
if (await page.locator(".oneday-span-preview-labels").count() !== 0) {
  console.error("move labels survived pointerup"); process.exit(1)
}
await page.mouse.move(trackCX, yFor(1200)) // 空白处 -> 退出编辑
await page.mouse.down()
await page.mouse.up()

await page.locator('.oneday-brush-toggle .oneday-mode-btn[data-mode="actual"]').click()
await page.mouse.click(trackCX, yFor(635)) // sleep 块已被移到 10:05-11:05
// 7. toolbar: right-click a swatch hides it; "+" menu shows hidden ones back
const mathSwatch = page.locator('.oneday-swatch[data-type="math"]')
await mathSwatch.click({ button: "right" })
await page.waitForSelector(".oneday-ctx-menu")
const swatchBox = await mathSwatch.boundingBox()
const contextBox = await page.locator(".oneday-ctx-menu").boundingBox()
const expectedContextX = swatchBox ? Math.max(8, swatchBox.x) : 0
if (!swatchBox || !contextBox || Math.abs(contextBox.x - expectedContextX) > 2 || contextBox.y < swatchBox.y + swatchBox.height || contextBox.y - (swatchBox.y + swatchBox.height) > 8) {
  console.error("swatch menu is not anchored", { swatchBox, contextBox }); process.exit(1)
}
const contextStyle = await page.locator(".oneday-ctx-menu").evaluate((menu) => {
  const item = menu.querySelector(".oneday-add-item")
  const menuStyle = getComputedStyle(menu)
  const itemStyle = getComputedStyle(item)
  return {
    radius: parseFloat(menuStyle.borderTopLeftRadius),
    itemRadius: parseFloat(itemStyle.borderTopLeftRadius),
    itemPaddingLeft: parseFloat(itemStyle.paddingLeft),
    labelledBy: menu.getAttribute("aria-labelledby"),
    ariaLabel: menu.getAttribute("aria-label"),
  }
})
if (contextStyle.radius < 6 || contextStyle.itemRadius < 4 || contextStyle.itemPaddingLeft < 8 || !contextStyle.labelledBy || contextStyle.ariaLabel !== null) {
  console.error("swatch menu visual/accessibility contract regressed", contextStyle); process.exit(1)
}
await page.locator('.oneday-ctx-menu .oneday-add-item:has-text("隐藏")').click()
await page.locator(".oneday-add").click()
if (await page.locator('.oneday-add-menu .oneday-add-new:has-text("添加新荧光笔")').count() !== 1) {
  console.error("add-new option missing from hidden menu"); process.exit(1)
}
const addNewStyle = await page.locator('.oneday-add-menu .oneday-add-new').evaluate((item) => {
  const style = getComputedStyle(item)
  const separator = getComputedStyle(item, "::before")
  return {
    topLeft: parseFloat(style.borderTopLeftRadius),
    topRight: parseFloat(style.borderTopRightRadius),
    bottomRight: parseFloat(style.borderBottomRightRadius),
    bottomLeft: parseFloat(style.borderBottomLeftRadius),
    borderTopWidth: parseFloat(style.borderTopWidth),
    separatorHeight: parseFloat(separator.height),
  }
})
if (
  Math.min(addNewStyle.topLeft, addNewStyle.topRight, addNewStyle.bottomRight, addNewStyle.bottomLeft) < 4 ||
  addNewStyle.borderTopWidth !== 0 ||
  addNewStyle.separatorHeight < 1
) {
  console.error("add-new menu item rounding regressed", addNewStyle); process.exit(1)
}
await page.locator('.oneday-add-menu .oneday-add-new:has-text("添加新荧光笔")').click()
await page.locator(".oneday-add").click()
await page.locator('.oneday-add-item:has-text("fitness")').click()

// 7a. Grid component hide uses the exact same custom menu and short action copy.
await page.evaluate(() => window.__showComponentMenu(180, 240))
const componentMenu = page.locator('.oneday-ctx-menu[aria-labelledby]')
const componentMenuBox = await componentMenu.boundingBox()
if (!componentMenuBox || Math.abs(componentMenuBox.x - 180) > 2 || componentMenuBox.y < 240 || componentMenuBox.y > 250) {
  console.error("component menu is not cursor-anchored", componentMenuBox); process.exit(1)
}
await componentMenu.locator('.oneday-add-item:has-text("隐藏")').click()
if (await page.evaluate(() => window.__componentHidden) !== 1) {
  console.error("component custom hide action did not route"); process.exit(1)
}

// 7b. no hidden swatches: tail "+" opens settings directly and never opens an empty menu.
await page.evaluate(() => window.__mountNoHiddenToolbar())
await page.locator("#no-hidden-toolbar .oneday-add").click()
if (await page.locator(".oneday-add-menu").count() !== 0) {
  console.error("empty hidden menu should not open"); process.exit(1)
}

// 7c. true zero-palette is one full-size dashed creation entry. All-hidden is
// not zero: it keeps the restore menu and must not show the empty-state button.
await page.evaluate(() => window.__mountEmptyToolbars())
const zeroToolbarState = await page.locator("#zero-toolbar").evaluate((toolbar) => {
  const button = toolbar.querySelector(".oneday-toolbar-empty")
  const toolbarRect = toolbar.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  const style = getComputedStyle(button)
  return {
    label: toolbar.querySelector(".oneday-toolbar-empty-label")?.textContent,
    borderStyle: style.borderStyle,
    fillsWidth: Math.abs(toolbarRect.width - buttonRect.width) <= 1,
    fillsHeight: Math.abs(toolbarRect.height - buttonRect.height) <= 1,
    modeCount: toolbar.querySelectorAll(".oneday-brush-toggle").length,
    swatchCount: toolbar.querySelectorAll(".oneday-swatch").length,
  }
})
if (zeroToolbarState.label !== "添加第一个荧光笔" || zeroToolbarState.borderStyle !== "none" || !zeroToolbarState.fillsWidth || !zeroToolbarState.fillsHeight || zeroToolbarState.modeCount !== 0 || zeroToolbarState.swatchCount !== 0) {
  console.error("zero-highlighter empty state regressed", zeroToolbarState); process.exit(1)
}
await page.locator("#zero-toolbar .oneday-toolbar-empty").click()
await page.locator("#zero-toolbar").screenshot({ path: path.join(out, "zero-toolbar.png") })
if (await page.locator("#all-hidden-toolbar .oneday-toolbar-empty").count() !== 0 || await page.locator("#all-hidden-toolbar .oneday-add").count() !== 1) {
  console.error("all-hidden toolbar was mistaken for a zero palette"); process.exit(1)
}
await page.locator("#all-hidden-toolbar .oneday-add").click()
await page.locator('.oneday-add-menu .oneday-add-item:has-text("math")').click()

// 7d. Type cascade opens on hover, stays attached to the primary menu while
// crossing into it, and keeps click/keyboard fallbacks.
await page.evaluate(() => window.__mountCascadeFixture(80))
const cascadeTrigger = page.locator("#cascade-fixture > .menu-item").first()
await cascadeTrigger.hover()
const cascade = page.locator("#cascade-fixture > .oneday-cascade-menu")
await cascade.waitFor({ state: "visible" })
const cascadeTriggerBox = await cascadeTrigger.boundingBox()
const cascadeBox = await cascade.boundingBox()
if (!cascadeTriggerBox || !cascadeBox || cascadeBox.x < cascadeTriggerBox.x + cascadeTriggerBox.width || await page.locator("#cascade-fixture").count() !== 1) {
  console.error("cascade did not open beside its live primary menu", { cascadeTriggerBox, cascadeBox }); process.exit(1)
}
await page.mouse.move(cascadeBox.x + cascadeBox.width / 2, cascadeBox.y + cascadeBox.height / 2)
if (await page.locator("#cascade-fixture").count() !== 1 || await cascade.count() !== 1) {
  console.error("crossing into cascade closed the primary menu"); process.exit(1)
}
await cascade.locator('[role="menuitemradio"]:has-text("运动")').click()
if (JSON.stringify(await page.evaluate(() => window.__cascadeSelected)) !== JSON.stringify([1])) {
  console.error("cascade selection did not route"); process.exit(1)
}

await page.evaluate(() => window.__mountCascadeFixture(80))
const keyboardCascadeTrigger = page.locator("#cascade-fixture > .menu-item").first()
await keyboardCascadeTrigger.focus()
await page.keyboard.press("ArrowRight")
const keyboardCascadeItemFocused = await page.locator('[role="menuitemradio"]:has-text("运动")')
  .evaluate((item) => item === document.activeElement)
if (await page.locator("#cascade-fixture > .oneday-cascade-menu").count() !== 1 || !keyboardCascadeItemFocused) {
  console.error("cascade keyboard fallback regressed"); process.exit(1)
}
await page.keyboard.press("ArrowLeft")
const keyboardCascadeTriggerFocused = await keyboardCascadeTrigger.evaluate((item) => item === document.activeElement)
if (await page.locator("#cascade-fixture > .oneday-cascade-menu").count() !== 0 || !keyboardCascadeTriggerFocused) {
  console.error("cascade keyboard return regressed"); process.exit(1)
}

await page.evaluate(() => window.__mountCascadeFixture(244))
const edgeCascadeTrigger = page.locator("#cascade-fixture > .menu-item").first()
await edgeCascadeTrigger.hover()
const edgeTriggerBox = await edgeCascadeTrigger.boundingBox()
const edgeCascadeBox = await page.locator("#cascade-fixture > .oneday-cascade-menu").boundingBox()
if (!edgeTriggerBox || !edgeCascadeBox || edgeCascadeBox.x + edgeCascadeBox.width > edgeTriggerBox.x + 0.5) {
  console.error("cascade did not flip left near the viewport edge", { edgeTriggerBox, edgeCascadeBox }); process.exit(1)
}
await page.locator("#cascade-fixture").evaluate((el) => el.remove())

const created = await page.evaluate(() => window.__created)
const menu = await page.evaluate(() => window.__menu)
console.log("created:", JSON.stringify(created))
console.log("menu:", JSON.stringify(menu))

const expectCreated = [
  { line: "10:05-11:30 math", startMin: 605 },
  { line: "12:30-14:00 math", startMin: 750 },
  { line: "07:30-08:30 math", startMin: 450 },
  { line: "19:00-19:05 math", startMin: 1140 },
  { line: "plan 15:00-16:00 math", startMin: 900 },
]
if (JSON.stringify(created) !== JSON.stringify(expectCreated)) { console.error("created mismatch"); process.exit(1) }
if (menu.length !== 1 || menu[0].line !== 0) { console.error("menu mismatch"); process.exit(1) }
const spans = await page.evaluate(() => window.__span)
const expectedSpans = [
  { line: 0, startMin: 420, endMin: 545 },   // 底沿 09:07 -> 09:05
  { line: 0, startMin: 605, endMin: 665 },   // 移动也吸附到 5 分钟网格
]
if (JSON.stringify(spans) !== JSON.stringify(expectedSpans)) { console.error("span mismatch", JSON.stringify(spans)); process.exit(1) }
const extend = await page.evaluate(() => window.__extend)
if (extend.length !== 1 || extend[0].startMin !== 420 || extend[0].endMin !== 1560) {
  console.error("extend mismatch", JSON.stringify(extend)); process.exit(1)
}
// 5f. A pure double-click on a short, non-grid-aligned block must never snap
// its exact span. 15:30-15:55 is 0.42h; the lower text area overlaps the
// visual edge hot zone on this 18px-high block.
await page.keyboard.press("Escape")
const exactBlock = page.locator('rect.oneday-block[data-line="1"]')
const exactBlockBox = await exactBlock.boundingBox()
await page.mouse.click(exactBlockBox.x + 5, exactBlockBox.y + exactBlockBox.height / 2)
const spansBeforeDblclick = await page.evaluate(() => window.__span.length)
await page.mouse.dblclick(exactBlockBox.x + 5, exactBlockBox.y + exactBlockBox.height * 0.67, { delay: 40 })
const spansAfterDblclick = await page.evaluate(() => window.__span.length)
if (spansAfterDblclick !== spansBeforeDblclick) {
  console.error("double-click changed an exact 25-minute span", await page.evaluate(() => window.__span)); process.exit(1)
}
if (JSON.stringify(await page.evaluate(() => window.__editnotes)) !== JSON.stringify([1])) {
  console.error("double-click did not edit the 25-minute block note"); process.exit(1)
}
await page.keyboard.press("Escape")
await page.evaluate(() => { window.__editnotes = []; window.__focus = [] })
// 5g. dblclick on a block -> edit its note
await page.locator('rect.oneday-block[data-line="0"]').dispatchEvent("dblclick")

const editnotes = await page.evaluate(() => window.__editnotes)
if (editnotes.length !== 1 || editnotes[0] !== 0) { console.error("editnote mismatch", JSON.stringify(editnotes)); process.exit(1) }
const focus = await page.evaluate(() => window.__focus)
if (focus.length !== 1 || focus[0] !== 0) { console.error("focus mismatch", JSON.stringify(focus)); process.exit(1) }
const editingNow = await page.evaluate(() => window.__editing)
if (editingNow !== 0) { console.error("click did not enter edit mode", editingNow); process.exit(1) }
const hidden = await page.evaluate(() => window.__hidden)
const shown = await page.evaluate(() => window.__shown)
const addNew = await page.evaluate(() => window.__addNew)
const toolbarControlSize = await page.evaluate(() => {
  const mode = document.querySelector(".oneday-brush-toggle").getBoundingClientRect()
  const swatch = document.querySelector('.oneday-swatch[data-type="math"]').getBoundingClientRect()
  return {
    modeHeight: mode.height,
    swatchHeight: swatch.height,
    topDelta: mode.top - swatch.top,
    bottomDelta: mode.bottom - swatch.bottom,
  }
})
const toolbarCornerRadius = await page.evaluate(() => {
  const radii = (selector) => {
    const style = getComputedStyle(document.querySelector(selector))
    return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      .map((value) => parseFloat(value))
  }
  const mode = document.querySelector(".oneday-brush-toggle")
  return {
    mode: radii(".oneday-brush-toggle"),
    swatch: radii('.oneday-swatch[data-type="math"]'),
    add: radii(".oneday-add"),
    overflow: getComputedStyle(mode).overflow,
  }
})
const layerToggleSize = await page.evaluate(() => {
  const wrap = document.querySelector("#layer-toggle-size-check")
  const button = wrap.querySelector(".oneday-mode-btn")
  const wr = wrap.getBoundingClientRect()
  const br = button.getBoundingClientRect()
  return { wrapHeight: wr.height, buttonHeight: br.height }
})
const tooltipContract = await page.evaluate(() => ({
  nativeTitleCount: document.querySelectorAll(".oneday-toolbar [title], .oneday-view-toggle [title]").length,
  unlabelledButtonCount: [...document.querySelectorAll(".oneday-toolbar button, .oneday-view-toggle button")]
    .filter((button) => !button.getAttribute("aria-label")).length,
  swatchStyle: (() => {
    const style = getComputedStyle(document.querySelector('.oneday-swatch[data-type="math"]'))
    return { appearance: style.appearance, background: style.backgroundColor, shadow: style.boxShadow }
  })(),
}))
if (hidden.length !== 1 || hidden[0] !== "math") { console.error("hide mismatch", JSON.stringify(hidden)); process.exit(1) }
if (JSON.stringify(shown) !== JSON.stringify(["fitness", "math"])) { console.error("show mismatch", JSON.stringify(shown)); process.exit(1) }
if (addNew !== 3) { console.error("add-new routing mismatch", addNew); process.exit(1) }
const toolbarControlsShareRow = Math.abs(toolbarControlSize.topDelta) < Math.max(toolbarControlSize.modeHeight, toolbarControlSize.swatchHeight) / 2
if (Math.abs(toolbarControlSize.modeHeight - toolbarControlSize.swatchHeight) > 0.25 || (toolbarControlsShareRow && (Math.abs(toolbarControlSize.topDelta) > 0.25 || Math.abs(toolbarControlSize.bottomDelta) > 0.25))) {
  console.error("brush mode/highlighter height drifted", toolbarControlSize); process.exit(1)
}
const referenceRadius = toolbarCornerRadius.swatch[0]
if (toolbarCornerRadius.overflow !== "hidden" || [...toolbarCornerRadius.mode, ...toolbarCornerRadius.swatch, ...toolbarCornerRadius.add].some((radius) => Math.abs(radius - referenceRadius) > 0.1)) {
  console.error("toolbar control corner radius drifted", toolbarCornerRadius); process.exit(1)
}
if (layerToggleSize.wrapHeight < 30 || layerToggleSize.wrapHeight > 34 || layerToggleSize.buttonHeight > 28) {
  console.error("layer toggle size drifted", layerToggleSize); process.exit(1)
}
if (tooltipContract.nativeTitleCount !== 0 || tooltipContract.unlabelledButtonCount !== 0) {
  console.error("toolbar tooltip contract regressed", tooltipContract); process.exit(1)
}
if (tooltipContract.swatchStyle.appearance !== "none" || tooltipContract.swatchStyle.background === "rgba(0, 0, 0, 0)" || tooltipContract.swatchStyle.shadow !== "none") {
  console.error("highlighter button chrome regressed", tooltipContract.swatchStyle); process.exit(1)
}
await browser.close()
console.log("OK draw smoke passed")
