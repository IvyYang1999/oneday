/**
 * Canvas-style drawing on the rendered SVG timeline (M3):
 * pick a highlighter (toolbar) -> drag on the track -> ghost preview with
 * live time/duration -> release writes a new entry line into the source.
 * Right-click a block -> context menu (handled by caller).
 *
 * Pure DOM (no Obsidian imports) so Playwright can smoke it headlessly.
 */
import { TimelineDoc } from "../core/types"
import { durationMinutes, formatClock, formatHours } from "../core/duration"
import { formatEntryLine } from "../core/format"
import { minutesFromY, snapMinutes, SNAP_MINUTES, yFromMinutes } from "../core/geometry"

export interface DrawDeps {
  hourHeight: number
  getActiveType: () => string
  typeColor: (type: string) => string
  onCreate: (entryLine: string, startMin: number) => void
  onBlockMenu: (line: number, clientX: number, clientY: number) => void
}

const SVGNS = "http://www.w3.org/2000/svg"

/** True if [start,end) overlaps any actual (non-plan) entry. Plan layers are meant to be covered (D3). */
export function overlapsActual(doc: TimelineDoc, startMin: number, endMin: number): boolean {
  return doc.entries.some((e) => !e.plan && e.startMin < endMin && startMin < e.endMin)
}

export function attachDrawInteraction(container: HTMLElement, doc: TimelineDoc, deps: DrawDeps): void {
  const svg = container.querySelector<SVGSVGElement>("svg.oneday-svg")
  const track = container.querySelector<SVGRectElement>("rect.oneday-track")
  const statusEl = container.querySelector<HTMLElement>(".oneday-draw-status")
  if (!svg || !track) return

  const trackX = Number(track.getAttribute("x"))
  const trackW = Number(track.getAttribute("width"))
  const svgWidth = Number(svg.getAttribute("width"))

  let dragOriginTop = 0
  let dragScale = 1
  const toLocalY = (clientY: number): number => (clientY - dragOriginTop) * dragScale
  const clampMin = (m: number): number => Math.min(doc.rangeEnd, Math.max(doc.rangeStart, m))

  let dragging = false
  let dragStartMin = 0
  let ghost: SVGRectElement | null = null

  const setStatus = (text: string): void => {
    if (statusEl) statusEl.textContent = text
  }

  const removeGhost = (): void => {
    ghost?.remove()
    ghost = null
  }

  svg.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as Element | null
    const hitBlock = target?.closest("rect.oneday-block")
    // Actual blocks: reserved for future drag-move; plan blocks: draw over them (D3).
    if (hitBlock && !hitBlock.classList.contains("oneday-plan")) return

    dragging = true
    const rect = svg.getBoundingClientRect()
    dragOriginTop = rect.top
    dragScale = svgWidth / rect.width
    dragStartMin = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    svg.setPointerCapture(e.pointerId)

    ghost = document.createElementNS(SVGNS, "rect")
    ghost.setAttribute("class", "oneday-ghost")
    ghost.setAttribute("x", String(trackX + 2))
    ghost.setAttribute("width", String(trackW - 4))
    ghost.setAttribute("rx", "3")
    ghost.setAttribute("fill", deps.typeColor(deps.getActiveType()))
    svg.appendChild(ghost)
    updateGhost(dragStartMin, dragStartMin)
  })

  const updateGhost = (a: number, b: number): void => {
    if (!ghost) return
    const y1 = yFromMinutes(Math.min(a, b), doc.rangeStart, deps.hourHeight)
    const y2 = yFromMinutes(Math.max(a, b), doc.rangeStart, deps.hourHeight)
    ghost.setAttribute("y", String(y1))
    ghost.setAttribute("height", String(Math.max(2, y2 - y1)))
    const type = deps.getActiveType()
    setStatus(
      `${formatClock(Math.min(a, b))} – ${formatClock(Math.max(a, b))} · ${formatHours(durationMinutes(Math.min(a, b), Math.max(a, b)))}（${type}）`
    )
  }

  svg.addEventListener("pointermove", (e: PointerEvent) => {
    if (!dragging) return
    const cur = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    updateGhost(dragStartMin, cur)
  })

  svg.addEventListener("pointerup", (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    const end = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    const startMin = Math.min(dragStartMin, end)
    const endMin = Math.max(dragStartMin, end)
    removeGhost()
    svg.releasePointerCapture(e.pointerId)

    if (endMin - startMin < SNAP_MINUTES) {
      setStatus("")
      return
    }
    if (overlapsActual(doc, startMin, endMin)) {
      setStatus("与已有色块重叠，未创建")
      return
    }
    const line = formatEntryLine({ plan: false, startMin, endMin, type: deps.getActiveType() })
    setStatus("")
    deps.onCreate(line, startMin)
  })

  svg.addEventListener("contextmenu", (e: MouseEvent) => {
    const target = e.target as Element | null
    const hitBlock = target?.closest("rect.oneday-block")
    if (!hitBlock) return
    e.preventDefault()
    const line = Number((hitBlock as HTMLElement).dataset.line)
    if (Number.isInteger(line)) deps.onBlockMenu(line, e.clientX, e.clientY)
  })
}
