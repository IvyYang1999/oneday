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
  /** "actual" | "plan" — 计划模式下画出的色块带 plan 前缀 */
  getMode: () => "actual" | "plan"
  typeColor: (type: string) => string
  onCreate: (entryLine: string, startMin: number) => void
  onBlockMenu: (line: number, clientX: number, clientY: number) => void
  /** 点击（未拖动）色块 -> focus 切换 */
  onBlockClick: (line: number) => void
  /** 拖拽色块上/下沿调整起止（15min 吸附） */
  onResizeEdge: (line: number, startMin: number, endMin: number) => void
}

/** 距色块上下沿多少 px 内算「抓住边缘」 */
const EDGE_PX = 6

const SVGNS = "http://www.w3.org/2000/svg"

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
  let downBlockLine: number | null = null
  let downY = 0
  let ghost: SVGRectElement | null = null
  let resizing: { rect: SVGRectElement; entry: (typeof doc.entries)[number]; edge: "top" | "bottom" } | null = null

  const setStatus = (text: string): void => {
    if (statusEl) statusEl.textContent = text
  }

  const removeGhost = (): void => {
    ghost?.remove()
    ghost = null
  }

  svg.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    // 并列日程：允许从已有色块上起笔（yyt 2026-08-17）；右键菜单不受影响。
    const hit = (e.target as Element | null)?.closest("rect.oneday-block")
    downBlockLine = hit ? Number((hit as HTMLElement).dataset.line) : null
    downY = e.clientY

    // 抓住色块上/下沿 -> 边缘 resize 模式
    if (hit instanceof SVGRectElement) {
      const localDownY = (() => {
        const rect = svg.getBoundingClientRect()
        return (e.clientY - rect.top) * (svgWidth / rect.width)
      })()
      const top = Number(hit.getAttribute("y"))
      const bottom = top + Number(hit.getAttribute("height"))
      const nearTop = Math.abs(localDownY - top) <= EDGE_PX
      const nearBottom = Math.abs(localDownY - bottom) <= EDGE_PX
      if (nearTop || nearBottom) {
        const entry = doc.entries.find((it) => it.line === downBlockLine)
        if (entry) {
          resizing = { rect: hit, entry, edge: nearTop ? "top" : "bottom" }
          const rect = svg.getBoundingClientRect()
          dragOriginTop = rect.top
          dragScale = svgWidth / rect.width
          svg.setPointerCapture(e.pointerId)
          return
        }
      }
    }
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
    if (resizing) {
      const cur = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
      const { rect, entry, edge } = resizing
      const newStart = edge === "top" ? Math.min(cur, entry.endMin - SNAP_MINUTES) : entry.startMin
      const newEnd = edge === "bottom" ? Math.max(cur, entry.startMin + SNAP_MINUTES) : entry.endMin
      const y1 = yFromMinutes(newStart, doc.rangeStart, deps.hourHeight)
      const y2 = yFromMinutes(newEnd, doc.rangeStart, deps.hourHeight)
      rect.setAttribute("y", String(y1))
      rect.setAttribute("height", String(Math.max(2, y2 - y1)))
      setStatus(`${formatClock(newStart)} – ${formatClock(newEnd)} · ${formatHours(durationMinutes(newStart, newEnd))}`)
      return
    }
    if (!dragging) {
      // hover 指针反馈：靠近色块上下沿 -> ns-resize
      const hit = (e.target as Element | null)?.closest("rect.oneday-block")
      let cursor = "crosshair"
      if (hit instanceof SVGRectElement) {
        const rect = svg.getBoundingClientRect()
        const localY = (e.clientY - rect.top) * (svgWidth / rect.width)
        const top = Number(hit.getAttribute("y"))
        const bottom = top + Number(hit.getAttribute("height"))
        if (Math.abs(localY - top) <= EDGE_PX || Math.abs(localY - bottom) <= EDGE_PX) {
          cursor = "ns-resize"
        } else {
          cursor = "context-menu"
        }
      }
      svg.style.cursor = cursor
      return
    }
    const cur = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    updateGhost(dragStartMin, cur)
  })

  svg.addEventListener("pointerup", (e: PointerEvent) => {
    if (resizing) {
      const { entry, edge } = resizing
      resizing = null
      svg.releasePointerCapture(e.pointerId)
      const cur = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
      const newStart = edge === "top" ? Math.min(cur, entry.endMin - SNAP_MINUTES) : entry.startMin
      const newEnd = edge === "bottom" ? Math.max(cur, entry.startMin + SNAP_MINUTES) : entry.endMin
      setStatus("")
      if (newStart !== entry.startMin || newEnd !== entry.endMin) {
        deps.onResizeEdge(entry.line, newStart, newEnd)
      }
      downBlockLine = null
      return
    }
    if (!dragging) return
    dragging = false
    const end = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    const startMin = Math.min(dragStartMin, end)
    const endMin = Math.max(dragStartMin, end)
    removeGhost()
    svg.releasePointerCapture(e.pointerId)

    if (endMin - startMin < SNAP_MINUTES) {
      setStatus("")
      // 未拖动的点击落在色块上 -> focus 切换（高亮对应备注/连线）
      if (downBlockLine !== null && Math.abs(e.clientY - downY) < 4) {
        deps.onBlockClick(downBlockLine)
      }
      downBlockLine = null
      return
    }
    downBlockLine = null
    const line = formatEntryLine({ plan: deps.getMode() === "plan", startMin, endMin, type: deps.getActiveType() })
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
