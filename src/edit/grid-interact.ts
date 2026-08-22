/**
 * Grid interactions (react-grid-layout / gridstack style, yyt 2026-08-17):
 * - move: grip drag; the slot itself becomes the dashed snapped preview,
 *   a clone follows the cursor; position is pure pointer math (no flaky
 *   elementFromPoint hit-testing)
 * - resize: 8 edge/corner handles appear on slot hover, snapped to grid
 * - drop: overlaps push down, layout persists via the `layout:` header
 * Pure DOM.
 */
import {
  GRID_COLS, GRID_ROW_H, GridItem, SlotId, clampItem, compactGrid, gridColumns, gridRows,
  resolveHorizontalOverlaps, resolveOverlaps,
} from "../core/grid-layout"

export function applyItemToSlot(slot: HTMLElement, it: GridItem, columns = GRID_COLS): void {
  slot.style.left = `${(it.x / columns) * 100}%`
  slot.style.width = `${(it.w / columns) * 100}%`
  slot.style.top = `${it.y * GRID_ROW_H}px`
  slot.style.height = `${it.h * GRID_ROW_H}px`
}

/** Expand the internal canvas while keeping one logical column physically stable. */
export function applyGridToBody(body: HTMLElement, items: GridItem[]): void {
  const normalized = items.map(clampItem)
  const columns = gridColumns(normalized)
  body.dataset.gridCols = String(columns)
  const fixedBaseWidth = Number(body.dataset.gridBaseWidth)
  if (Number.isFinite(fixedBaseWidth) && fixedBaseWidth > 0) {
    const canvasWidth = fixedBaseWidth * (columns / GRID_COLS)
    body.style.width = `${canvasWidth}px`
    body.style.minWidth = `${canvasWidth}px`
  } else {
    body.style.width = `${(columns / GRID_COLS) * 100}%`
    body.style.minWidth = "100%"
  }
  for (const slot of Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot"))) {
    const item = normalized.find((it) => it.id === slot.dataset.slot)
    if (!item) continue
    slot.dataset.x = String(item.x)
    slot.dataset.y = String(item.y)
    slot.dataset.w = String(item.w)
    slot.dataset.h = String(item.h)
    applyItemToSlot(slot, item, columns)
  }
}

function itemFromSlot(slot: HTMLElement): GridItem {
  return {
    id: slot.dataset.slot as SlotId,
    x: Number(slot.dataset.x),
    y: Number(slot.dataset.y),
    w: Number(slot.dataset.w),
    h: Number(slot.dataset.h),
  }
}

const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const

export function attachGridInteract(body: HTMLElement, onCommit: (items: GridItem[]) => void): void {
  const dom = body.ownerDocument
  // 清理可能残留的拖拽克隆（pointer capture 中断时没删掉）
  dom.querySelectorAll(".oneday-drag-clone").forEach((c) => c.remove())
  const slots = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot"))

  const finish = (priorityId?: SlotId): void => {
    const items = compactGrid(resolveOverlaps(slots.map(itemFromSlot), priorityId), priorityId)
    applyGridToBody(body, items)
    body.style.height = `${gridRows(items) * GRID_ROW_H}px`
    onCommit(items)
  }

  for (const slot of slots) {
    if (slot.querySelector(".oneday-slot-grip")) continue

    // ---- move grip ----
    const gripAnchor = dom.createElement("div")
    gripAnchor.className = "oneday-slot-grip-anchor"
    const grip = dom.createElement("button")
    grip.type = "button"
    grip.className = "oneday-slot-grip"
    // Obsidian uses aria-label for its black tooltip. Do not also set title,
    // otherwise Electron shows a second native tooltip for the same control.
    grip.setAttribute("aria-label", "拖拽移动此组件")
    // 六个真实点元素（伪元素在 button+grid 下不可靠，真机曾变形，yyt 2026-08-19）
    for (let i = 0; i < 6; i++) {
      const dot = dom.createElement("span")
      dot.setAttribute("aria-hidden", "true")
      grip.appendChild(dot)
    }
    gripAnchor.appendChild(grip)
    // The sticky zero-size anchor stays at the slot viewport's top-left while
    // the slot content scrolls. It must precede ordinary content so its static
    // position starts at the scroll origin rather than after the content.
    slot.prepend(gripAnchor)

    grip.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const bodyRect = body.getBoundingClientRect()
      const slotRect = slot.getBoundingClientRect()
      const columns = Number(body.dataset.gridCols) || gridColumns(slots.map(itemFromSlot))
      const cellW = bodyRect.width / columns
      const grabDX = e.clientX - slotRect.left
      const grabDY = e.clientY - slotRect.top

      const clone = slot.cloneNode(true) as HTMLElement
      clone.classList.add("oneday-drag-clone")
      clone.style.width = `${slotRect.width}px`
      clone.style.height = `${slotRect.height}px`
      clone.style.left = `${slotRect.left}px`
      clone.style.top = `${slotRect.top}px`
      dom.body.appendChild(clone)
      slot.classList.add("is-placeholder")

      const item = itemFromSlot(slot)
      const onMove = (ev: PointerEvent): void => {
        clone.style.left = `${ev.clientX - grabDX}px`
        clone.style.top = `${ev.clientY - grabDY}px`
        const gx = Math.round((ev.clientX - bodyRect.left - grabDX) / cellW)
        const gy = Math.round((ev.clientY - bodyRect.top - grabDY) / GRID_ROW_H)
        const next = clampItem({ ...item, x: gx, y: Math.max(0, gy) })
        if (next.x === item.x && next.y === item.y) return
        item.x = next.x
        item.y = next.y
        // iOS 式实时重排：被拖组件优先，其余组件立刻让位+重力压实（带 CSS 过渡）
        const current = slots.map((other) => other === slot ? next : itemFromSlot(other))
        const items = compactGrid(resolveOverlaps(current, slot.dataset.slot as SlotId), slot.dataset.slot as SlotId)
        applyGridToBody(body, items)
        body.style.height = `${gridRows(items) * GRID_ROW_H}px`
      }
      const onUp = (): void => {
        dom.removeEventListener("pointermove", onMove)
        dom.removeEventListener("pointerup", onUp)
        dom.removeEventListener("pointercancel", onUp)
        clone.remove()
        slot.classList.remove("is-placeholder")
        finish(slot.dataset.slot as SlotId)
      }
      dom.addEventListener("pointermove", onMove)
      dom.addEventListener("pointerup", onUp)
      dom.addEventListener("pointercancel", onUp)
    })

    // ---- 8 resize handles ----
    for (const dir of DIRS) {
      const h = dom.createElement("div")
      h.className = `oneday-handle oneday-handle-${dir}`
      h.setAttribute("aria-hidden", "true")
      slot.appendChild(h)

      h.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        slot.classList.add("is-resizing")
        const bodyRect = body.getBoundingClientRect()
        const columns = Number(body.dataset.gridCols) || gridColumns(slots.map(itemFromSlot))
        const cellW = bodyRect.width / columns

        const onMove = (ev: PointerEvent): void => {
          const it = itemFromSlot(slot)
          const gx = Math.round((ev.clientX - bodyRect.left) / cellW)
          const gy = Math.round((ev.clientY - bodyRect.top) / GRID_ROW_H)
          let { x, y, w, h: hh } = it
          if (dir.includes("e")) w = gx - x
          if (dir.includes("s")) hh = gy - y
          if (dir.includes("w")) {
            const nx = Math.min(gx, x + w - 1)
            w = w + (x - nx)
            x = nx
          }
          if (dir.includes("n")) {
            const ny = Math.min(gy, y + hh - 1)
            hh = hh + (y - ny)
            y = ny
          }
          const resized = clampItem({ ...it, x, y, w, h: hh })
          if (resized.x === it.x && resized.y === it.y && resized.w === it.w && resized.h === it.h) return
          const current = slots.map((other) => other === slot ? resized : itemFromSlot(other))
          const priorityId = slot.dataset.slot as SlotId
          // 宽度变化优先在水平方向腾位；只有达到十屏安全上限才降级向下。
          const resolved = resized.x !== it.x || resized.w !== it.w
            ? resolveHorizontalOverlaps(current, priorityId)
            : resolveOverlaps(current, priorityId)
          const items = compactGrid(resolved, priorityId)
          applyGridToBody(body, items)
          body.style.height = `${gridRows(items) * GRID_ROW_H}px`
        }
        const onUp = (): void => {
          dom.removeEventListener("pointermove", onMove)
          dom.removeEventListener("pointerup", onUp)
          dom.removeEventListener("pointercancel", onUp)
          slot.classList.remove("is-resizing")
          finish(slot.dataset.slot as SlotId)
        }
        dom.addEventListener("pointermove", onMove)
        dom.addEventListener("pointerup", onUp)
        dom.addEventListener("pointercancel", onUp)
      })
    }
  }
}
