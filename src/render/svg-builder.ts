/**
 * Pure SVG string builder for the oneday timeline (no DOM/Obsidian deps).
 * Layout mirrors the paper page: hour labels on the left, vertical track,
 * plan layer as translucent background, actual blocks on top (D3),
 * duration centered in the block (moved right when too thin, D6),
 * and a dedicated right "label lane" where thin-block labels, narrow-column
 * notes and @annotations share one collision-avoiding layout (M4).
 */
import { Entry, TimelineDoc } from "../core/types"
import { hashTypeColor } from "../core/type-colors"
import { formatClock, formatHours, durationMinutes } from "../core/duration"
import { AXIS_PAD_TOP, AXIS_PAD_BOTTOM, LABEL_W, TRACK_PAD, inlineFontSize } from "../core/geometry"

export interface RenderOptions {
  /** type -> css color (D2). Unknown types fall back to FALLBACK_COLOR. */
  typeColors: Record<string, string>
  /** px per hour, default 48 */
  hourHeight?: number
  /** total svg width, default 200 */
  width?: number
}

export const FALLBACK_COLOR = "#bdbdbd"
const PAD_TOP = AXIS_PAD_TOP
const PAD_BOTTOM = AXIS_PAD_BOTTOM
const PLAN_OPACITY = 0.08
const BLOCK_OPACITY = 0.85
/** Below this height (px) the duration label moves to the right of the block. */
const MIN_INLINE_LABEL_H = 30
/** Below this width (px) the duration label moves to the right (并列分列后列宽变窄). */
const MIN_INLINE_LABEL_W = 56
/** Tall enough to also show the note inside the block. */
const MIN_NOTE_H = 54
/** Right lane reserved for side labels & annotations (M4: no more clipping). */
export const SIDE_LANE_W = 112
/** Vertical row height used by the side-label collision avoidance. */
const SIDE_LINE_H = 13

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}



/** One item in the right label lane (thin-block label, side note, annotation). */
export interface SideItem {
  /** natural (ideal) center y */
  naturalY: number
  text: string
  cls: string
  /** source line of the block this label belongs to (hover pairing) */
  dataLine?: number
  /** block right-edge x; when set, a leader line is always drawn (多列时标注↔色块对应关系) */
  anchorX?: number
}

export interface PlacedSideItem extends SideItem {
  y: number
  displaced: boolean
}

/**
 * Collision-avoiding vertical layout for the label lane (M4):
 * sorted by natural y, each item pushed down just enough to clear the
 * previous one. Displaced items get a leader line from their anchor.
 */
export function layoutSideItems(items: SideItem[], lineH = SIDE_LINE_H): PlacedSideItem[] {
  const sorted = [...items].sort((a, b) => a.naturalY - b.naturalY)
  let prevBottom = -Infinity
  return sorted.map((it) => {
    const half = lineH / 2
    const y = Math.max(it.naturalY, prevBottom + half + 1)
    prevBottom = y + half
    return { ...it, y, displaced: y > it.naturalY + 0.5 }
  })
}

/** Column layout for actual entries (calendar-style parallel events). */
interface Placed {
  entry: Entry
  x: number
  w: number
}

function placeActual(actual: Entry[], trackX: number, trackW: number): Placed[] {
  const sorted = [...actual].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const placed: Placed[] = []
  let cluster: Entry[] = []
  let clusterEnd = -1

  const flush = (): void => {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const assignment = new Map<number, number>()
    for (const e of cluster) {
      let col = colEnds.findIndex((end) => end <= e.startMin)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(e.endMin)
      } else {
        colEnds[col] = e.endMin
      }
      assignment.set(e.line, col)
    }
    const n = colEnds.length
    const colW = (trackW - 4) / n
    for (const e of cluster) {
      const col = assignment.get(e.line) ?? 0
      placed.push({ entry: e, x: trackX + 2 + col * colW, w: colW - (n > 1 ? 2 : 0) })
    }
    cluster = []
  }

  for (const e of sorted) {
    if (cluster.length > 0 && e.startMin >= clusterEnd) flush()
    cluster.push(e)
    clusterEnd = Math.max(clusterEnd, e.endMin)
  }
  flush()
  return placed
}

/** Side labels must stay inside the svg: cap length. */
function truncate(text: string, max = 12): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

export function renderTimelineSvg(doc: TimelineDoc, opts: RenderOptions): string {
  const hourHeight = opts.hourHeight ?? 48
  const baseWidth = opts.width ?? 200
  const trackX = LABEL_W
  const trackW = baseWidth - LABEL_W - TRACK_PAD
  // M4: dedicated right lane for side labels & annotations (no clipping).
  const width = baseWidth + SIDE_LANE_W
  const laneX = trackX + trackW + 4
  const y = (min: number): number => PAD_TOP + ((min - doc.rangeStart) / 60) * hourHeight
  const axisBottom = PAD_TOP + ((doc.rangeEnd - doc.rangeStart) / 60) * hourHeight

  const parts: string[] = []
  const sideItems: SideItem[] = []

  // Hour gridlines + labels (including >24h hours, D10 自然延伸).
  const firstHour = Math.floor(doc.rangeStart / 60)
  const lastHour = Math.ceil(doc.rangeEnd / 60)
  for (let h = firstHour; h <= lastHour; h++) {
    const yy = y(h * 60)
    parts.push(`<line class="oneday-grid" x1="${trackX}" y1="${yy}" x2="${trackX + trackW}" y2="${yy}"/>`)
    parts.push(`<text class="oneday-hour" x="${LABEL_W - 6}" y="${yy + 4}" text-anchor="end">${h}</text>`)
  }
  // Track frame
  parts.push(
    `<rect class="oneday-track" x="${trackX}" y="${y(doc.rangeStart)}" width="${trackW}" height="${y(doc.rangeEnd) - y(doc.rangeStart)}"/>`
  )

  // Plan layer first (full-width translucent background + diagonal hatch, D3 覆盖语义)
  const planColors = [...new Set(doc.entries.filter((e) => e.plan).map((e) => opts.typeColors[e.type] ?? hashTypeColor(e.type)))]
  if (planColors.length > 0) {
    const defs = planColors
      .map(
        (c, i) =>
          `<pattern id="oneday-hatch-${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
          `<line x1="0" y1="0" x2="0" y2="6" stroke="${escapeXml(c)}" stroke-width="1.6" stroke-opacity="0.55"/></pattern>`
      )
      .join("")
    parts.push(`<defs>${defs}</defs>`)
  }
  for (const e of doc.entries.filter((e) => e.plan)) {
    const color = opts.typeColors[e.type] ?? hashTypeColor(e.type)
    const hatchId = `oneday-hatch-${planColors.indexOf(color)}`
    const yy = y(e.startMin)
    const hh = Math.max(2, y(e.endMin) - yy)
    parts.push(
      `<rect class="oneday-block oneday-plan" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${trackX + 2}" y="${yy}" width="${trackW - 4}" height="${hh}" rx="3" fill="${escapeXml(color)}" fill-opacity="${PLAN_OPACITY}"></rect>` +
        `<rect pointer-events="none" class="oneday-plan-hatch" x="${trackX + 2}" y="${yy}" width="${trackW - 4}" height="${hh}" rx="3" fill="url(#${hatchId})"/>`
    )
  }

  // Actual blocks: overlapping ones split into side-by-side columns (并列日程,
  // calendar-style; yyt 2026-08-17). Plans do not participate in columns.
  for (const p of placeActual(doc.entries.filter((e) => !e.plan), trackX, trackW)) {
    const e = p.entry
    const color = opts.typeColors[e.type] ?? hashTypeColor(e.type)
    const yy = y(e.startMin)
    const hh = Math.max(2, y(e.endMin) - yy)
    parts.push(
      `<rect class="oneday-block" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${p.x}" y="${yy}" width="${p.w}" height="${hh}" rx="3" fill="${escapeXml(color)}" fill-opacity="${BLOCK_OPACITY}"></rect>`
    )
    const label = formatHours(durationMinutes(e.startMin, e.endMin))
    const fs = inlineFontSize(p.w, hh, label)
    if (fs > 0) {
      // 时长恒居中，自适应字号（yyt 2026-08-17）
      const showNoteInside = p.w >= MIN_INLINE_LABEL_W && hh >= MIN_NOTE_H && e.note
      parts.push(
        `<text pointer-events="none" class="oneday-duration" style="font-size:${fs}px" x="${p.x + p.w / 2}" y="${yy + hh / 2 + (showNoteInside ? -4 : fs / 2 - 1.5)}" text-anchor="middle">${label}</text>`
      )
      if (showNoteInside) {
        parts.push(
          `<text pointer-events="none" class="oneday-note" x="${p.x + p.w / 2}" y="${yy + hh / 2 + 12}" text-anchor="middle">${escapeXml(truncate(e.note ?? ""))}</text>`
        )
      } else if (e.note) {
        // 备注放不进块内 -> 右侧标注车道（备注必须看得见）
        sideItems.push({ naturalY: yy + hh / 2, text: truncate(e.note, 14), cls: "oneday-note oneday-side", dataLine: e.line, anchorX: p.x + p.w })
      }
    } else {
      // 极端小块：时长(+备注)去标注车道
      const side = e.note ? `${label} · ${truncate(e.note, 14)}` : label
      sideItems.push({ naturalY: yy + hh / 2, text: side, cls: "oneday-duration oneday-thin", dataLine: e.line, anchorX: p.x + p.w })
    }
  }

  // @annotations share the same label lane (D5 + M4 collision avoidance)
  for (const a of doc.annotations) {
    sideItems.push({ naturalY: y(a.timeMin), text: truncate(a.text, 14), cls: "oneday-anno" })
  }

  const placedSide = layoutSideItems(sideItems)
  for (const it of placedSide) {
    if (it.anchorX !== undefined) {
      // 标注 ↔ 色块列的对应关系线；CSS 控制非常驻（避让偏移/focus 时才可见）
      const cls = it.displaced ? "oneday-side-leader is-displaced" : "oneday-side-leader"
      parts.push(
        `<line class="${cls}" data-line="${it.dataLine ?? ""}" x1="${it.anchorX}" y1="${it.naturalY}" x2="${laneX - 2}" y2="${it.y}"/>`
      )
    } else if (it.displaced) {
      parts.push(
        `<line class="oneday-side-leader" x1="${trackX + trackW}" y1="${it.naturalY}" x2="${laneX - 2}" y2="${it.y}"/>`
      )
    }
    const dataAttr = it.dataLine !== undefined ? ` data-line="${it.dataLine}"` : ""
    parts.push(`<text pointer-events="none" class="${it.cls}"${dataAttr} x="${laneX}" y="${it.y + 3}">${escapeXml(it.text)}</text>`)
  }

  const lastSideBottom = placedSide.length > 0 ? placedSide[placedSide.length - 1].y + SIDE_LINE_H / 2 : 0
  const height = Math.max(axisBottom, lastSideBottom) + PAD_BOTTOM

  const out = [`<svg xmlns="http://www.w3.org/2000/svg" class="oneday-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, ...parts, "</svg>"]
  return out.join("")
}
