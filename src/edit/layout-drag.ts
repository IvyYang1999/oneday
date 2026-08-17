/**
 * Component drag-to-reorder with the "floating clone + drop placeholder"
 * pattern (react-beautiful-dnd / SortableJS ghostClass style, yyt 2026-08-17):
 * - grab: original slot becomes a dashed placeholder keeping its space,
 *   a semi-transparent clone follows the cursor
 * - move: placeholder jumps between slots = live drop-target preview
 * - drop: clone vanishes, slot lands at the placeholder, layout persists
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

      const rect = slot.getBoundingClientRect()
      const clone = slot.cloneNode(true) as HTMLElement
      clone.classList.add("oneday-drag-clone")
      clone.style.width = `${rect.width}px`
      clone.style.left = `${rect.left}px`
      clone.style.top = `${rect.top}px`
      document.body.appendChild(clone)
      slot.classList.add("is-placeholder")

      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top

      const onMove = (ev: PointerEvent): void => {
        clone.style.left = `${ev.clientX - offsetX}px`
        clone.style.top = `${ev.clientY - offsetY}px`
        // 落点预览：占位框移到目标槽位前/后
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".oneday-slot")
        if (!(target instanceof HTMLElement) || target === slot) return
        const tr = target.getBoundingClientRect()
        if (ev.clientY < tr.top + tr.height / 2) {
          target.before(slot)
        } else {
          target.after(slot)
        }
      }
      const onUp = (): void => {
        document.removeEventListener("pointermove", onMove)
        document.removeEventListener("pointerup", onUp)
        clone.remove()
        slot.classList.remove("is-placeholder")
        const cols = Array.from(body.querySelectorAll<HTMLElement>(".oneday-col")).map((col) =>
          Array.from(col.querySelectorAll<HTMLElement>(".oneday-slot")).map((s) => s.dataset.slot as SlotId)
        )
        onCommit(cols.filter((c) => c.length > 0))
      }
      // 监听挂在 document：拖动中原槽位 DOM 移动会导致 grip 的 pointer capture
      // 丢失（lostpointercapture），挂 grip 上永远收不到 pointerup
      document.addEventListener("pointermove", onMove)
      document.addEventListener("pointerup", onUp)
    })
  }
}
