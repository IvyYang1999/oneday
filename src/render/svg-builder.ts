/**
 * Pure SVG string builder for the oneday timeline (no DOM/Obsidian deps).
 * Layout mirrors the paper page: hour labels on the left, vertical track,
 * plan layer as translucent background, actual blocks on top (D3),
 * duration centered in the block (moved right when too thin, D6),
 * @annotations as right-side text with a leader line (D5).
 */
import { Entry, TimelineDoc } from "../core/types"
import { formatClock, formatHours, durationMinutes } from "../core/duration"
import { AXIS_PAD_TOP, AXIS_PAD_BOTTOM, LABEL_W, TRACK_PAD } from "../core/geometry"

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
const PLAN_OPACITY = 0.22
const BLOCK_OPACITY = 0.85
/** Below this height (px) the duration label moves to the right of the block. */
const MIN_INLINE_LABEL_H = 30
/** Below this width (px) the duration label moves to the right (并列分列后列宽变窄). */
const MIN_INLINE_LABEL_W = 56
/** Tall enough to also show the note inside the block. */
const MIN_NOTE_H = 54

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
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
  const width = opts.width ?? 200
  const trackX = LABEL_W
  const trackW = width - LABEL_W - TRACK_PAD
  const y = (min: number): number => PAD_TOP + ((min - doc.rangeStart) / 60) * hourHeight
  const height = PAD_TOP + ((doc.rangeEnd - doc.rangeStart) / 60) * hourHeight + PAD_BOTTOM

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="oneday-svg" style="overflow:visible" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)

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

  // Plan layer first (full-width translucent background, D3 覆盖语义).
  for (const e of doc.entries.filter((e) => e.plan)) {
    const color = opts.typeColors[e.type] ?? FALLBACK_COLOR
    const yy = y(e.startMin)
    const hh = Math.max(2, y(e.endMin) - yy)
    parts.push(
      `<rect class="oneday-block oneday-plan" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${trackX + 2}" y="${yy}" width="${trackW - 4}" height="${hh}" rx="3" fill="${escapeXml(color)}" fill-opacity="${PLAN_OPACITY}">` +
        `<title>${escapeXml(formatClock(e.startMin))}–${escapeXml(formatClock(e.endMin))} ${escapeXml(e.type)}${e.note ? " · " + escapeXml(e.note) : ""}</title></rect>`
    )
  }

  // Actual blocks: overlapping ones split into side-by-side columns (并列日程,
  // calendar-style; yyt 2026-08-17). Plans do not participate in columns.
  for (const p of placeActual(doc.entries.filter((e) => !e.plan), trackX, trackW)) {
    const e = p.entry
    const color = opts.typeColors[e.type] ?? FALLBACK_COLOR
    const yy = y(e.startMin)
    const hh = Math.max(2, y(e.endMin) - yy)
    parts.push(
      `<rect class="oneday-block" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${p.x}" y="${yy}" width="${p.w}" height="${hh}" rx="3" fill="${escapeXml(color)}" fill-opacity="${BLOCK_OPACITY}">` +
        `<title>${escapeXml(formatClock(e.startMin))}–${escapeXml(formatClock(e.endMin))} ${escapeXml(e.type)}${e.note ? " · " + escapeXml(e.note) : ""}</title></rect>`
    )
    const label = formatHours(durationMinutes(e.startMin, e.endMin))
    const fitsInside = p.w >= MIN_INLINE_LABEL_W && hh >= MIN_INLINE_LABEL_H
    if (fitsInside) {
      const showNoteInside = hh >= MIN_NOTE_H && e.note
      parts.push(
        `<text pointer-events="none" class="oneday-duration" x="${p.x + p.w / 2}" y="${yy + hh / 2 + (showNoteInside ? -4 : 4)}" text-anchor="middle">${label}</text>`
      )
      if (showNoteInside) {
        parts.push(
          `<text pointer-events="none" class="oneday-note" x="${p.x + p.w / 2}" y="${yy + hh / 2 + 12}" text-anchor="middle">${escapeXml(truncate(e.note ?? ""))}</text>`
        )
      } else if (e.note) {
        // 备注放不进块内 -> 显示在轨道右侧（yyt 2026-08-17：备注必须看得见）
        parts.push(`<text pointer-events="none" class="oneday-note oneday-side" x="${trackX + trackW + 2}" y="${yy + hh / 2 + 3}">${escapeXml(truncate(e.note))}</text>`)
      }
    } else {
      // D6: thin/narrow block, duration (+note) to the right of the track
      const side = e.note ? `${label} · ${truncate(e.note)}` : label
      parts.push(`<text pointer-events="none" class="oneday-duration oneday-thin" x="${trackX + trackW + 2}" y="${yy + hh / 2 + 3}">${escapeXml(side)}</text>`)
    }
  }

  // @annotations: leader line + right-side text (D5)
  for (const a of doc.annotations) {
    const yy = y(a.timeMin)
    parts.push(`<line class="oneday-anno-line" x1="${trackX}" y1="${yy}" x2="${trackX - 8}" y2="${yy}"/>`)
    parts.push(`<text class="oneday-anno" x="${trackX + trackW + 2}" y="${yy + 3}">${escapeXml(a.text)}</text>`)
  }

  parts.push("</svg>")
  return parts.join("")
}
