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
  /** 时间轴空白处右键（可挂「添加文字区」等入口） */
  onTrackMenu: (clientX: number, clientY: number) => void
  /** 轴向延展：拖上/下边缘线延长当天范围（整小时吸附） */
  onExtendRange: (startMin: number, endMin: number) => void
}

/** 轴端热区（px，svg 坐标） */
const AXIS_EDGE_PX = 10

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
  let extending: "top" | "bottom" | null = null
  let dragStartMin = 0
  let downBlockLine: number | null = null
  let downY = 0
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
    // 并列日程：允许从已有色块上起笔（yyt 2026-08-17）；右键菜单不受影响。
    const hit = (e.target as Element | null)?.closest("rect.oneday-block")
    downBlockLine = hit ? Number((hit as HTMLElement).dataset.line) : null
    downY = e.clientY

    // 轴端热区：上/下边缘线往外拖 = 延展当天范围（整小时吸附）
    if (!hit) {
      const rect0 = svg.getBoundingClientRect()
      const localY0 = (e.clientY - rect0.top) * (svgWidth / rect0.width)
      const yTop = yFromMinutes(doc.rangeStart, doc.rangeStart, deps.hourHeight)
      const yBottom = yFromMinutes(doc.rangeEnd, doc.rangeStart, deps.hourHeight)
      if (Math.abs(localY0 - yTop) <= AXIS_EDGE_PX || Math.abs(localY0 - yBottom) <= AXIS_EDGE_PX) {
        extending = Math.abs(localY0 - yTop) <= AXIS_EDGE_PX ? "top" : "bottom"
        dragOriginTop = rect0.top
        dragScale = svgWidth / rect0.width
        svg.setPointerCapture(e.pointerId)
        setStatus(extending === "top" ? "往下拖无效，往上拖提前开始时间" : "拖到 24 点后可继续到凌晨")
        return
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
    if (extending) {
      const raw = minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)
      const hourSnap = Math.round(raw / 60) * 60
      if (extending === "bottom") {
        const target = Math.max(doc.rangeStart + 60, Math.min(30 * 60, hourSnap))
        setStatus(`结束于 ${formatClock(target)}`)
      } else {
        const target = Math.max(0, Math.min(doc.rangeEnd - 60, hourSnap))
        setStatus(`开始于 ${formatClock(target)}`)
      }
      return
    }
    if (!dragging) return
    const cur = clampMin(snapMinutes(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    updateGhost(dragStartMin, cur)
  })

  svg.addEventListener("pointerup", (e: PointerEvent) => {
    if (extending) {
      const raw = minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)
      const hourSnap = Math.round(raw / 60) * 60
      const dir = extending
      extending = null
      svg.releasePointerCapture(e.pointerId)
      setStatus("")
      if (dir === "bottom") {
        const target = Math.max(doc.rangeStart + 60, Math.min(30 * 60, hourSnap))
        if (target !== doc.rangeEnd) deps.onExtendRange(doc.rangeStart, target)
      } else {
        const target = Math.max(0, Math.min(doc.rangeEnd - 60, hourSnap))
        if (target !== doc.rangeStart) deps.onExtendRange(target, doc.rangeEnd)
      }
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
    if (!hitBlock) {
      e.preventDefault()
      deps.onTrackMenu(e.clientX, e.clientY)
      return
    }
    e.preventDefault()
    const line = Number((hitBlock as HTMLElement).dataset.line)
    if (Number.isInteger(line)) deps.onBlockMenu(line, e.clientX, e.clientY)
  })
}
