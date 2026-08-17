/**
 * Draggable divider between text pane and timeline column (图文比例调节).
 * Live-adjusts the timeline column width; on release caller writes `width:` back.
 * Pure DOM.
 */
export function attachDivider(
  body: HTMLElement,
  initialColWidth: number,
  onCommit: (totalWidth: number) => void
): void {
  const divider = body.querySelector<HTMLElement>(".oneday-divider")
  const col = body.querySelector<HTMLElement>(".oneday-timeline-col")
  if (!divider || !col) return
  col.style.width = `${initialColWidth}px`
  col.style.flexShrink = "0"

  divider.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = col.getBoundingClientRect().width
    divider.setPointerCapture(e.pointerId)
    divider.classList.add("is-active")

    const onMove = (ev: PointerEvent): void => {
      const w = Math.min(760, Math.max(200, startW + (startX - ev.clientX)))
      col.style.width = `${Math.round(w)}px`
    }
    const onUp = (ev: PointerEvent): void => {
      divider.removeEventListener("pointermove", onMove)
      divider.removeEventListener("pointerup", onUp)
      divider.classList.remove("is-active")
      const w = Math.min(760, Math.max(200, startW + (startX - ev.clientX)))
      onCommit(Math.round(w))
    }
    divider.addEventListener("pointermove", onMove)
    divider.addEventListener("pointerup", onUp)
  })
}
