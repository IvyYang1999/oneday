/**
 * Grid interactions (react-grid-layout / gridstack style, yyt 2026-08-17):
 * - move: grip drag; the slot itself becomes the dashed snapped preview,
 *   a clone follows the cursor; position is pure pointer math (no flaky
 *   elementFromPoint hit-testing)
 * - resize: 8 edge/corner handles appear on slot hover, snapped to grid
 * - drop: overlaps push down, layout persists via the `layout:` header
 * Pure DOM.
 */
import { GRID_COLS, GRID_ROW_H, GridItem, SlotId, clampItem, resolveOverlaps, gridRows } from "../core/grid-layout"

export function applyItemToSlot(slot: HTMLElement, it: GridItem): void {
  slot.style.left = `${(it.x / GRID_COLS) * 100}%`
  slot.style.width = `${(it.w / GRID_COLS) * 100}%`
  slot.style.top = `${it.y * GRID_ROW_H}px`
  slot.style.height = `${it.h * GRID_ROW_H}px`
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

function setItemOnSlot(slot: HTMLElement, it: GridItem): void {
  const c = clampItem(it)
  slot.dataset.x = String(c.x)
  slot.dataset.y = String(c.y)
  slot.dataset.w = String(c.w)
  slot.dataset.h = String(c.h)
  applyItemToSlot(slot, c)
}

const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const

export function attachGridInteract(body: HTMLElement, onCommit: (items: GridItem[]) => void): void {
  const slots = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot"))

  const finish = (priorityId?: SlotId): void => {
    const items = resolveOverlaps(slots.map(itemFromSlot), priorityId)
    for (const slot of slots) setItemOnSlot(slot, items.find((it) => it.id === slot.dataset.slot)!)
    body.style.height = `${gridRows(items) * GRID_ROW_H}px`
    onCommit(items)
  }

  for (const slot of slots) {
    if (slot.querySelector(".oneday-slot-grip")) continue

    // ---- move grip ----
    const grip = document.createElement("button")
    grip.className = "oneday-slot-grip"
    grip.textContent = "⋮⋮"
    grip.title = "拖拽移动此组件"
    slot.appendChild(grip)

    grip.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const bodyRect = body.getBoundingClientRect()
      const slotRect = slot.getBoundingClientRect()
      const cellW = bodyRect.width / GRID_COLS
      const grabDX = e.clientX - slotRect.left
      const grabDY = e.clientY - slotRect.top

      const clone = slot.cloneNode(true) as HTMLElement
      clone.classList.add("oneday-drag-clone")
      clone.style.width = `${slotRect.width}px`
      clone.style.height = `${slotRect.height}px`
      clone.style.left = `${slotRect.left}px`
      clone.style.top = `${slotRect.top}px`
      document.body.appendChild(clone)
      slot.classList.add("is-placeholder")

      const item = itemFromSlot(slot)
      const onMove = (ev: PointerEvent): void => {
        clone.style.left = `${ev.clientX - grabDX}px`
        clone.style.top = `${ev.clientY - grabDY}px`
        const gx = Math.round((ev.clientX - bodyRect.left - grabDX) / cellW)
        const gy = Math.round((ev.clientY - bodyRect.top - grabDY) / GRID_ROW_H)
        setItemOnSlot(slot, { ...item, x: gx, y: Math.max(0, gy) })
      }
      const onUp = (): void => {
        document.removeEventListener("pointermove", onMove)
        document.removeEventListener("pointerup", onUp)
        clone.remove()
        slot.classList.remove("is-placeholder")
        finish(slot.dataset.slot as SlotId)
      }
      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
    })

    // ---- 8 resize handles ----
    for (const dir of DIRS) {
      const h = document.createElement("div")
      h.className = `oneday-handle oneday-handle-${dir}`
      slot.appendChild(h)

      h.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const bodyRect = body.getBoundingClientRect()
        const cellW = bodyRect.width / GRID_COLS

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
          setItemOnSlot(slot, { ...it, x, y, w, h: hh })
        }
        const onUp = (): void => {
          document.removeEventListener("pointermove", onMove)
          document.removeEventListener("pointerup", onUp)
          finish(slot.dataset.slot as SlotId)
        }
        document.addEventListener("pointermove", onMove)
        document.addEventListener("pointerup", onUp)
      })
    }
  }
}
