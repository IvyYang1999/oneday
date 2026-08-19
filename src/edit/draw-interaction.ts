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
import { AXIS_PAD_TOP, minutesFromY, snapMinutes, SNAP_MINUTES, yFromMinutes } from "../core/geometry"

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
  /** 色块编辑态：当前正在编辑的源码行号（跨渲染保持），null=未编辑 */
  getEditingLine: () => number | null
  setEditingLine: (line: number | null) => void
  /** 编辑态提交新的起止（移动/边缘拖拽） */
  onUpdateSpan: (line: number, startMin: number, endMin: number) => void
  /** 选中块双击 -> 编辑备注（色块本质是文本框，yyt 2026-08-19） */
  onEditNote: (line: number) => void
  /** 选中块按 Delete -> 删除（yyt 2026-08-19） */
  onDeleteEntry: (line: number) => void
}

/** 轴端热区（px，svg 坐标） */
const AXIS_EDGE_PX = 4 // 热区收窄（yyt：±10px 抢画块手势）

const SVGNS = "http://www.w3.org/2000/svg"

/** 延展预览层：拖动轴端时实时画出延伸区域和新小时刻度（窗口拖拽式实时反馈） */
const AXIS_PAD_TOP_LOCAL = AXIS_PAD_TOP

function updateExtendPreview(
  g: SVGGElement,
  dir: "top" | "bottom",
  fromMin: number,
  toMin: number,
  rangeStart: number,
  hourHeight: number,
  trackX: number,
  trackW: number
): void {
  while (g.firstChild) g.removeChild(g.firstChild)
  if (toMin === fromMin) return
  const y = (m: number): number => AXIS_PAD_TOP_LOCAL + ((m - rangeStart) / 60) * hourHeight
  const y1 = y(Math.min(fromMin, toMin))
  const y2 = y(Math.max(fromMin, toMin))
  const zone = document.createElementNS(SVGNS, "rect")
  zone.setAttribute("class", "oneday-extend-zone")
  zone.setAttribute("x", String(trackX))
  zone.setAttribute("y", String(y1))
  zone.setAttribute("width", String(trackW))
  zone.setAttribute("height", String(Math.max(1, y2 - y1)))
  g.appendChild(zone)
  const startHour = dir === "bottom" ? Math.ceil(fromMin / 60) : Math.floor(toMin / 60)
  const endHour = dir === "bottom" ? Math.floor(toMin / 60) : Math.ceil(fromMin / 60)
  for (let h = startHour; h <= endHour; h++) {
    const yy = y(h * 60)
    if (yy < y1 - 1 || yy > y2 + 1) continue
    const line = document.createElementNS(SVGNS, "line")
    line.setAttribute("class", "oneday-grid oneday-extend-tick")
    line.setAttribute("x1", String(trackX))
    line.setAttribute("y1", String(yy))
    line.setAttribute("x2", String(trackX + trackW))
    line.setAttribute("y2", String(yy))
    g.appendChild(line)
    const label = document.createElementNS(SVGNS, "text")
    label.setAttribute("class", "oneday-hour")
    label.setAttribute("x", String(trackX - 6))
    label.setAttribute("y", String(yy + 4))
    label.setAttribute("text-anchor", "end")
    label.textContent = String(h % 24) // 跨零点标注回绕：25->1
    g.appendChild(label)
  }
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
  let fineSnap = false // ⌥Option 按下时 1 分钟吸附（yyt：精确编辑入口）
  const snapMin = (m: number): number => snapMinutes(m, fineSnap ? 1 : SNAP_MINUTES)

  let dragging = false
  let extending: "top" | "bottom" | null = null
  // 色块编辑态：边缘拖拽改起止 / 中部拖动移动整块
  let editDrag: { mode: "top" | "bottom" | "move"; startMin: number; endMin: number; grabOffsetMin: number } | null = null
  let extendPreview: SVGGElement | null = null
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
    fineSnap = e.altKey
    // 编辑态：目标块的边缘/中部手势优先
    const editing = editingRect()
    if (editing) {
      const target = (e.target as Element | null)?.closest("rect.oneday-block")
      if (target === editing) {
        const rect0 = svg.getBoundingClientRect()
        dragOriginTop = rect0.top
        dragScale = svgWidth / rect0.width
        const localY0 = toLocalY(e.clientY)
        const line = Number(editing.dataset.line)
        const entry = doc.entries.find((it) => it.line === line)
        if (entry) {
          const top = Number(editing.getAttribute("y"))
          const h = Number(editing.getAttribute("height"))
          const bottom = top + h
          // 小块（<24px）禁用边缘判定：8px 热区会覆盖整块，双击会误触 resize（yyt 2026-08-19）
          const edgeZone = h >= 24 ? 8 : 0
          const nearTop = edgeZone > 0 && Math.abs(localY0 - top) <= edgeZone
          const nearBottom = edgeZone > 0 && Math.abs(localY0 - bottom) <= edgeZone
          const mode = nearTop ? "top" : nearBottom ? "bottom" : "move"
          editing.style.cursor = mode === "move" ? "grabbing" : "ns-resize" // 拖拽中保持
          editDrag = {
            mode,
            startMin: entry.startMin,
            endMin: entry.endMin,
            grabOffsetMin: snapMin(minutesFromY(localY0, doc.rangeStart, deps.hourHeight)) - entry.startMin,
          }
          svg.setPointerCapture(e.pointerId)
          return
        }
      } else {
        // 点在别处 -> 退出编辑态（本次点击不触发其它操作）
        exitEdit()
        return
      }
    }

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
      // 单侧热区：顶线只认线上方、底线只认线下方（顶线下方起拖=画块）
      const nearTop = localY0 >= yTop - 6 && localY0 <= yTop + 1
      const nearBottom = localY0 >= yBottom - 1 && localY0 <= yBottom + 6
      if (nearTop || nearBottom) {
        extending = nearTop ? "top" : "bottom"
        dragOriginTop = rect0.top
        dragScale = svgWidth / rect0.width
        svg.setPointerCapture(e.pointerId)
        extendPreview = document.createElementNS(SVGNS, "g")
        extendPreview.setAttribute("class", "oneday-extend-preview")
        svg.appendChild(extendPreview)
        return
      }
    }

    dragging = true
    const rect = svg.getBoundingClientRect()
    dragOriginTop = rect.top
    dragScale = svgWidth / rect.width
    dragStartMin = clampMin(snapMin(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
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
    if (editDrag) {
      const rect = editingRect()
      if (!rect) {
        editDrag = null
        return
      }
      const cur = clampMin(snapMin(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
      const { mode, grabOffsetMin } = editDrag
      let ns = editDrag.startMin
      let ne = editDrag.endMin
      if (mode === "top") ns = Math.min(cur, editDrag.endMin - SNAP_MINUTES)
      else if (mode === "bottom") ne = Math.max(cur, editDrag.startMin + SNAP_MINUTES)
      else {
        const dur = editDrag.endMin - editDrag.startMin
        ns = Math.min(30 * 60 - dur, Math.max(0, cur - grabOffsetMin))
        ne = ns + dur
      }
      const y1 = yFromMinutes(ns, doc.rangeStart, deps.hourHeight)
      const y2 = yFromMinutes(ne, doc.rangeStart, deps.hourHeight)
      rect.setAttribute("y", String(y1))
      rect.setAttribute("height", String(Math.max(2, y2 - y1)))
      setStatus(`${formatClock(ns % (24 * 60))} – ${formatClock(ne % (24 * 60))} · ${formatHours(durationMinutes(ns, ne))}`)
      return
    }
    if (extending) {
      const raw = minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)
      const hourSnap = Math.round(raw / 60) * 60
      // 缩短也允许：钳在内容边界（最后一块内容整点收/起点整点放）
      const contentEnd = Math.max(0, ...doc.entries.map((en) => en.endMin), ...doc.annotations.map((a) => a.timeMin))
      const contentStart = Math.min(30 * 60, ...doc.entries.map((en) => en.startMin), ...doc.annotations.map((a) => a.timeMin))
      if (extending === "bottom") {
        const minEnd = Math.max(doc.rangeStart + 60, contentEnd > 0 ? Math.ceil(contentEnd / 60) * 60 : 0)
        const target = Math.max(minEnd, Math.min(30 * 60, hourSnap))
        setStatus(`结束于 ${formatClock(target % (24 * 60))}`) // 回绕显示：28点 -> 4:00
        if (extendPreview) updateExtendPreview(extendPreview, "bottom", doc.rangeEnd, target, doc.rangeStart, deps.hourHeight, trackX, trackW)
      } else {
        const maxStart = Math.min(doc.rangeEnd - 60, contentStart < 30 * 60 ? Math.floor(contentStart / 60) * 60 : doc.rangeEnd - 60)
        const target = Math.max(0, Math.min(maxStart, hourSnap))
        setStatus(`开始于 ${formatClock(target % (24 * 60))}`)
        if (extendPreview) updateExtendPreview(extendPreview, "top", doc.rangeStart, target, doc.rangeStart, deps.hourHeight, trackX, trackW)
      }
      return
    }
    if (!dragging) {
      // 编辑态光标：目标块边缘 ns-resize / 中部 grab；冻结块 default
      const editing = editingRect()
      if (editing) {
        const target0 = (e.target as Element | null)?.closest("rect.oneday-block")
        if (target0 === editing) {
          const rect0 = svg.getBoundingClientRect()
          const ly = (e.clientY - rect0.top) * (svgWidth / rect0.width)
          const top = Number(editing.getAttribute("y"))
          const h = Number(editing.getAttribute("height"))
          const bottom = top + h
          const edgeZone = h >= 24 ? 8 : 0
          // 光标必须设在色块自己身上（元素的 cursor 盖过 svg 的，yyt：悬停出不来）
          editing.style.cursor = edgeZone > 0 && (Math.abs(ly - top) <= edgeZone || Math.abs(ly - bottom) <= edgeZone) ? "ns-resize" : "grab"
        } else {
          editing.style.cursor = ""
        }
        return
      }
      // hover 光标反馈：轴端热区 -> ns-resize；色块 -> context-menu；其余 crosshair
      const target = e.target as Element | null
      let cursor = "crosshair"
      if (target?.closest("rect.oneday-block")) {
        cursor = "context-menu"
      } else {
        const rect = svg.getBoundingClientRect()
        const localY = (e.clientY - rect.top) * (svgWidth / rect.width)
        const yTop = yFromMinutes(doc.rangeStart, doc.rangeStart, deps.hourHeight)
        const yBottom = yFromMinutes(doc.rangeEnd, doc.rangeStart, deps.hourHeight)
        const hovTop = localY >= yTop - 6 && localY <= yTop + 1
        const hovBottom = localY >= yBottom - 1 && localY <= yBottom + 6
        if (hovTop || hovBottom) {
          cursor = "ns-resize"
        }
      }
      svg.style.cursor = cursor
      return
    }
    const cur = clampMin(snapMin(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    updateGhost(dragStartMin, cur)
  })

  svg.addEventListener("pointercancel", () => {
    // 中断拖拽也要清理临时元素（否则留下幽灵线）
    extendPreview?.remove()
    extendPreview = null
    extending = null
    removeGhost()
    dragging = false
    editDrag = null
    setStatus("")
  })

  svg.addEventListener("pointerup", (e: PointerEvent) => {
    if (editDrag) {
      const rect = editingRect()
      const drag = editDrag
      editDrag = null
      svg.releasePointerCapture(e.pointerId)
      svg.style.cursor = ""
      setStatus("")
      if (rect) {
        const line = Number(rect.dataset.line)
        const cur = clampMin(snapMin(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
        let ns = drag.startMin
        let ne = drag.endMin
        if (drag.mode === "top") ns = Math.min(cur, drag.endMin - SNAP_MINUTES)
        else if (drag.mode === "bottom") ne = Math.max(cur, drag.startMin + SNAP_MINUTES)
        else {
          const dur = drag.endMin - drag.startMin
          ns = Math.min(30 * 60 - dur, Math.max(0, cur - drag.grabOffsetMin))
          ne = ns + dur
        }
        if (ns !== drag.startMin || ne !== drag.endMin) {
          deps.onUpdateSpan(line, ns, ne)
        } else if (Math.abs(e.clientY - downY) < 4) {
          // 选中态再点一下（没动）-> 退出编辑
          exitEdit()
        }
      }
      return
    }
    if (extending) {
      const raw = minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)
      const hourSnap = Math.round(raw / 60) * 60
      const dir = extending
      extending = null
      svg.releasePointerCapture(e.pointerId)
      setStatus("")
      extendPreview?.remove()
      extendPreview = null
      const contentEnd = Math.max(0, ...doc.entries.map((en) => en.endMin), ...doc.annotations.map((a) => a.timeMin))
      const contentStart = Math.min(30 * 60, ...doc.entries.map((en) => en.startMin), ...doc.annotations.map((a) => a.timeMin))
      if (dir === "bottom") {
        const minEnd = Math.max(doc.rangeStart + 60, contentEnd > 0 ? Math.ceil(contentEnd / 60) * 60 : 0)
        const target = Math.max(minEnd, Math.min(30 * 60, hourSnap))
        if (target !== doc.rangeEnd) deps.onExtendRange(doc.rangeStart, target)
      } else {
        const maxStart = Math.min(doc.rangeEnd - 60, contentStart < 30 * 60 ? Math.floor(contentStart / 60) * 60 : doc.rangeEnd - 60)
        const target = Math.max(0, Math.min(maxStart, hourSnap))
        if (target !== doc.rangeStart) deps.onExtendRange(target, doc.rangeEnd)
      }
      return
    }
    if (!dragging) return
    dragging = false
    const end = clampMin(snapMin(minutesFromY(toLocalY(e.clientY), doc.rangeStart, deps.hourHeight)))
    const startMin = Math.min(dragStartMin, end)
    const endMin = Math.max(dragStartMin, end)
    svg.releasePointerCapture(e.pointerId)

    if (endMin - startMin < (fineSnap ? 1 : SNAP_MINUTES)) {
      removeGhost()
      setStatus("")
      // 未拖动的点击落在色块上 -> 选中即编辑（yyt 2026-08-19：选中态默认进入编辑态）
      if (downBlockLine !== null && Math.abs(e.clientY - downY) < 4) {
        deps.onBlockClick(downBlockLine)
        if (deps.getEditingLine() !== downBlockLine) {
          deps.setEditingLine(downBlockLine)
          syncEditVisual()
        }
      }
      downBlockLine = null
      return
    }
    downBlockLine = null
    const line = formatEntryLine({ plan: deps.getMode() === "plan", startMin, endMin, type: deps.getActiveType() })
    setStatus("")
    // 乐观渲染：ghost 直接变成正式色块样式，写回+重渲染完成前用户无感知（yyt：创建有延迟）
    if (ghost) {
      ghost.setAttribute("class", "oneday-block oneday-preview-block")
      ghost.setAttribute("fill-opacity", "0.85")
    }
    ghost = null
    deps.onCreate(line, startMin)
  })

  const editingRect = (): SVGRectElement | null => {
    const line = deps.getEditingLine()
    if (line === null) return null
    return svg.querySelector<SVGRectElement>(`rect.oneday-block[data-line="${line}"]`)
  }

  const syncEditVisual = (): void => {
    const rect = editingRect()
    svg.classList.toggle("is-editing-block", rect !== null)
    svg.querySelectorAll("rect.oneday-block").forEach((r) => {
      r.classList.toggle("is-edit-target", rect !== null && r === rect)
      r.classList.toggle("is-frozen", rect !== null && r !== rect)
    })
    // 文字也跟随冻结（yyt：只灰色块文字没变，看着懵）
    const editLine = deps.getEditingLine()
    svg.querySelectorAll("text[data-line]").forEach((t) => {
      const mine = Number((t as HTMLElement).dataset.line) === editLine
      t.classList.toggle("is-frozen", editLine !== null && !mine)
    })
  }

  const exitEdit = (): void => {
    const rect = editingRect()
    if (rect) rect.style.cursor = ""
    deps.setEditingLine(null)
    editDrag = null
    syncEditVisual()
    container.querySelectorAll(".is-focus").forEach((el) => el.classList.remove("is-focus"))
  }

  // Esc 退出编辑：document 级监听只挂一份（每次渲染重复挂会泄漏+重复触发，性能审计 2026-08-19）
  const onEditKey = (e: Event): void => {
    const ke = e as KeyboardEvent
    const key = (e as CustomEvent).detail?.key ?? ke.key // 委托的自定义事件没有 .key（真机翻车点）
    const editing = deps.getEditingLine()
    if (editing === null) return
    if (key === "Escape") {
      e.preventDefault()
      exitEdit()
    } else if (key === "Delete" || key === "Backspace") {
      // 选中即删除（yyt 2026-08-19）；焦点可能不在输入框，文本框内不劫持
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return
      e.preventDefault()
      deps.onDeleteEntry(editing)
      exitEdit()
    }
  }
  if (!document.body.dataset.onedayEscArmed) {
    document.body.dataset.onedayEscArmed = "1"
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      // 委托：所有实例共用一个监听，行为由当前 DOM 状态决定
      const editingSvg = document.querySelector(".oneday-svg.is-editing-block")
      if (editingSvg && (e.key === "Escape" || e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault()
        editingSvg.dispatchEvent(new CustomEvent("oneday-esc", { detail: { key: e.key } }))
      }
    })
  }
  svg.addEventListener("oneday-esc", onEditKey as EventListener)

  // 进入编辑态的视觉同步（挂载时若已在编辑态则恢复）
  syncEditVisual()

  svg.addEventListener("dblclick", (e: MouseEvent) => {
    // dblclick 的 target 取自 pointerup——capture 期间被重定向成 svg；
    // 且第二击 pointerup 的 no-move 分支已退出编辑态。所以一律用 elementFromPoint 找真实色块
    const hit = (e.target as Element | null)?.closest("rect.oneday-block")
      ?? (document.elementFromPoint(e.clientX, e.clientY)?.closest("rect.oneday-block") as Element | null)
    if (!hit) return
    const line = Number((hit as HTMLElement).dataset.line)
    if (!Number.isInteger(line)) return
    e.preventDefault()
    e.stopPropagation()
    // 双击 = 选中并进编辑态 + 直接改备注（不要求先单击选中——单击 toggle 会吃掉预选）
    if (deps.getEditingLine() !== line) {
      deps.setEditingLine(line)
      deps.onBlockClick(line)
      syncEditVisual()
    }
    deps.onEditNote(line)
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
