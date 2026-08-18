/**
 * Track width handle: a tiny hot zone hugging the track's own right edge
 * (the vertical line at LABEL_W + trackW, yyt: 不是 svg 外缘).
 * Drag shows a live vertical preview line; free width (no snap); release
 * commits the `width:` header. Pure DOM.
 */
import { LABEL_W, TRACK_PAD } from "../core/geometry"

export function attachWidthHandle(
  container: HTMLElement,
  baseWidth: number,
  onCommit: (baseWidth: number) => void
): void {
  const slot = container.querySelector<HTMLElement>(".oneday-slot-timeline")
  if (!slot) return
  slot.querySelector(".oneday-width-handle")?.remove()
  slot.querySelector(".oneday-width-preview")?.remove()

  // 实测 svg 在槽位内的水平偏移（slot padding 等），否则手柄系统性偏内
  const svgEl = slot.querySelector("svg.oneday-svg")
  const svgOffset = svgEl ? svgEl.getBoundingClientRect().left - slot.getBoundingClientRect().left : 0
  const trackRight = svgOffset + LABEL_W + (baseWidth - LABEL_W - TRACK_PAD) // 轨道竖线位置
  const handle = document.createElement("div")
  handle.className = "oneday-width-handle"
  handle.style.left = `${trackRight - 3}px` // ±3px 热区骑线（yyt：偏内侧且太宽）
  slot.appendChild(handle)

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = baseWidth
    handle.classList.add("is-active")

    // 竖线预览（不动 svg，listener 安全）
    const preview = document.createElement("div")
    preview.className = "oneday-width-preview"
    slot.appendChild(preview)
    const place = (w: number): void => {
      const x = svgOffset + LABEL_W + (w - LABEL_W - TRACK_PAD)
      preview.style.left = `${x}px`
      preview.textContent = `${Math.round(w)}px`
    }
    place(startW)

    const onMove = (ev: PointerEvent): void => {
      const w = Math.min(640, Math.max(140, startW + (ev.clientX - startX)))
      handle.style.left = `${svgOffset + LABEL_W + (w - LABEL_W - TRACK_PAD) - 3}px`
      place(w)
    }
    const onUp = (ev: PointerEvent): void => {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      handle.classList.remove("is-active")
      preview.remove()
      const w = Math.min(640, Math.max(140, Math.round(startW + (ev.clientX - startX))))
      if (Math.abs(w - startW) > 3) onCommit(w)
    }
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  })
}
