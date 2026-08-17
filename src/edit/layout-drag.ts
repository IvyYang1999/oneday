/**
 * Component drag-to-reorder across columns (yyt: 组件都能用手柄拖拽移动).
 * Each slot gets a hover grip; dragging reorders live in the DOM, release
 * reports the new layout (caller persists it to the `layout:` header).
 * Pure DOM.
 */
import { SlotId } from "../core/layout"

export function attachLayoutDrag(body: HTMLElement, onCommit: (cols: SlotId[][]) => void): void {
  const slots = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot"))
  for (const slot of slots) {
    if (slot.querySelector(".oneday-slot-grip")) continue
    const grip = document.createElement("button")
    grip.className = "oneday-slot-grip"
    grip.textContent = "⋮⋮"
    grip.title = "拖拽移动此组件"
    slot.appendChild(grip)

    grip.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      grip.setPointerCapture(e.pointerId)
      slot.classList.add("is-dragging")

      const onMove = (ev: PointerEvent): void => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".oneday-slot")
        if (!(target instanceof HTMLElement) || target === slot) return
        const rect = target.getBoundingClientRect()
        // 同列：越过中线换序；跨列：直接插入目标列
        if (ev.clientY < rect.top + rect.height / 2) {
          target.before(slot)
        } else {
          target.after(slot)
        }
      }
      const onUp = (): void => {
        grip.removeEventListener("pointermove", onMove)
        grip.removeEventListener("pointerup", onUp)
        slot.classList.remove("is-dragging")
        const cols = Array.from(body.querySelectorAll<HTMLElement>(".oneday-col")).map((col) =>
          Array.from(col.querySelectorAll<HTMLElement>(".oneday-slot")).map((s) => s.dataset.slot as SlotId)
        )
        onCommit(cols.filter((c) => c.length > 0))
      }
      grip.addEventListener("pointermove", onMove)
      grip.addEventListener("pointerup", onUp)
    })
  }
}
