/**
 * Track width handle: a slim strip at the timeline's right edge.
 * The axis keeps its natural narrow width (`width:` header); dragging this
 * adjusts it. Distinct from grid slot handles (component layout).
 * Pure DOM.
 */
export function attachWidthHandle(
  container: HTMLElement,
  currentTotalWidth: number,
  onCommit: (totalWidth: number) => void
): void {
  const slot = container.querySelector<HTMLElement>(".oneday-slot-timeline")
  if (!slot) return
  slot.querySelector(".oneday-width-handle")?.remove()

  const handle = document.createElement("div")
  handle.className = "oneday-width-handle"
  handle.style.left = `${currentTotalWidth}px` // svg 从槽位左缘开始
  slot.appendChild(handle)

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = currentTotalWidth
    handle.classList.add("is-active")

    const onMove = (ev: PointerEvent): void => {
      const w = Math.min(752, Math.max(252, startW + (ev.clientX - startX)))
      handle.style.left = `${Math.round(w)}px`
    }
    const onUp = (ev: PointerEvent): void => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      handle.classList.remove("is-active")
      const w = Math.min(752, Math.max(252, startW + (ev.clientX - startX)))
      if (Math.abs(w - startW) > 4) onCommit(Math.round(w))
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  })
}
