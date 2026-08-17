/**
 * Edge drag handle to resize the block width (分栏, 飞书文档式).
 * Live-adjusts container width during drag; on release the caller writes
 * the `width:` header back into the block source (markdown 唯一事实源).
 * Pure DOM.
 */
export function attachResizeHandle(
  container: HTMLElement,
  initialTotalWidth: number,
  floatedRight: boolean,
  onCommit: (totalWidth: number) => void
): void {
  const handle = document.createElement("div")
  handle.className = "oneday-resize-handle" + (floatedRight ? " is-left" : " is-right")
  container.appendChild(handle)

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = container.getBoundingClientRect().width
    handle.setPointerCapture(e.pointerId)
    container.classList.add("is-resizing")

    const onMove = (ev: PointerEvent): void => {
      const dx = floatedRight ? startX - ev.clientX : ev.clientX - startX
      const w = Math.min(640 + 112, Math.max(140 + 112, startW + dx))
      container.style.width = `${Math.round(w)}px`
    }
    const onUp = (ev: PointerEvent): void => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      container.classList.remove("is-resizing")
      const dx = floatedRight ? startX - ev.clientX : ev.clientX - startX
      const w = Math.min(640 + 112, Math.max(140 + 112, startW + dx))
      onCommit(Math.round(w))
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
  })
}
