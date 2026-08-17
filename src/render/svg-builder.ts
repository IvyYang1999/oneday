/**
 * Pure SVG string builder for the oneday timeline (no DOM/Obsidian deps).
 * Layout mirrors the paper page: hour labels on the left, vertical track,
 * plan layer as translucent background, actual blocks on top (D3),
 * duration centered in the block (moved right when too thin, D6),
 * @annotations as right-side text with a leader line (D5).
 */
import { TimelineDoc } from "../core/types"
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
/** Tall enough to also show the note inside the block. */
const MIN_NOTE_H = 54

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function renderTimelineSvg(doc: TimelineDoc, opts: RenderOptions): string {
  const hourHeight = opts.hourHeight ?? 48
  const width = opts.width ?? 200
  const trackX = LABEL_W
  const trackW = width - LABEL_W - TRACK_PAD
  const y = (min: number): number => PAD_TOP + ((min - doc.rangeStart) / 60) * hourHeight
  const height = PAD_TOP + ((doc.rangeEnd - doc.rangeStart) / 60) * hourHeight + PAD_BOTTOM

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" class="oneday-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)

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

  // Plan layer first (background), actual blocks on top (D3 覆盖).
  const ordered = [...doc.entries.filter((e) => e.plan), ...doc.entries.filter((e) => !e.plan)]
  for (const e of ordered) {
    const color = opts.typeColors[e.type] ?? FALLBACK_COLOR
    const yy = y(e.startMin)
    const hh = Math.max(2, y(e.endMin) - yy)
    const cls = e.plan ? "oneday-block oneday-plan" : "oneday-block"
    const opacity = e.plan ? PLAN_OPACITY : BLOCK_OPACITY
    parts.push(
      `<rect class="${cls}" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${trackX + 2}" y="${yy}" width="${trackW - 4}" height="${hh}" rx="3" fill="${escapeXml(color)}" fill-opacity="${opacity}">` +
        `<title>${escapeXml(formatClock(e.startMin))}–${escapeXml(formatClock(e.endMin))} ${escapeXml(e.type)}${e.note ? " · " + escapeXml(e.note) : ""}</title></rect>`
    )
    if (!e.plan) {
      const label = formatHours(durationMinutes(e.startMin, e.endMin))
      if (hh >= MIN_INLINE_LABEL_H) {
        parts.push(
          `<text pointer-events="none" class="oneday-duration" x="${trackX + trackW / 2}" y="${yy + hh / 2 + (hh >= MIN_NOTE_H && e.note ? -4 : 4)}" text-anchor="middle">${label}</text>`
        )
        if (hh >= MIN_NOTE_H && e.note) {
          parts.push(
            `<text pointer-events="none" class="oneday-note" x="${trackX + trackW / 2}" y="${yy + hh / 2 + 12}" text-anchor="middle">${escapeXml(e.note)}</text>`
          )
        }
      } else {
        // D6: thin block, label to the right
        parts.push(`<text pointer-events="none" class="oneday-duration oneday-thin" x="${trackX + trackW + 2}" y="${yy + hh / 2 + 3}">${label}</text>`)
      }
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
