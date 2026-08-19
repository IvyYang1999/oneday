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
import { relatedTextColor } from "../core/contrast"
import { formatClock, formatHours, durationMinutes } from "../core/duration"
import { AXIS_PAD_TOP, AXIS_PAD_BOTTOM, LABEL_W, TRACK_PAD, inlineFontSize } from "../core/geometry"

export interface RenderOptions {
  /** type -> css color (D2). Unknown types fall back to FALLBACK_COLOR. */
  typeColors: Record<string, string>
  /** px per hour, default 48 */
  hourHeight?: number
  /** total svg width, default 200 */
  width?: number
  /** 视图：全部 / 只看记录 / 只看计划（yyt 2026-08-17） */
  view?: "all" | "actual" | "plan"
}

export const FALLBACK_COLOR = "#bdbdbd"
const PAD_TOP = AXIS_PAD_TOP
const PAD_BOTTOM = AXIS_PAD_BOTTOM
const PLAN_OPACITY = 0.12
const BLOCK_OPACITY = 0.95 // 盖住底部 plan 层，文字不糊（yyt 2026-08-17）
/** 统一留白 x（yyt 2026-08-19 定稿）：色块间/贴边/并列列间距全部一致 */
const GAP_X = 2
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

let hatchUid = 0

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
    // 贴边布局（yyt 2026-08-19）：首列贴左缘、末列贴右缘，列间固定 gap
    // 统一间距：贴边 x、列间 x（yyt 规范：n 列有 n-1 个列间 + 左右各 1 个贴边）
    const colW = (trackW - GAP_X * (n + 1)) / n
    for (const e of cluster) {
      const col = assignment.get(e.line) ?? 0
      placed.push({ entry: e, x: trackX + GAP_X + col * (colW + GAP_X), w: colW })
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

/** 长备注按宽度贪心换行（yyt：字多直接多行，放不下才截断）。 */
function wrapNote(text: string, blockW: number, maxLines: number): string[] {
  const perLine = Math.max(3, Math.floor((blockW - 16) / 8.5)) // 左右各留 ~8px margin
  const lines: string[] = []
  let rest = text
  while (rest.length > 0 && lines.length < maxLines) {
    lines.push(rest.slice(0, perLine))
    rest = rest.slice(perLine)
  }
  if (rest.length > 0 && lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + "…"
  }
  return lines
}

/** Side labels must stay inside the svg: cap length. */
function truncate(text: string, max = 12): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

export function renderTimelineSvg(doc: TimelineDoc, opts: RenderOptions): string {
  const view = opts.view ?? "all"
  const entries = doc.entries.filter((e) => (view === "all" ? true : view === "plan" ? e.plan : !e.plan))
  return renderTimelineSvgEntries(doc, entries, opts)
}

function renderTimelineSvgEntries(doc: TimelineDoc, entries: Entry[], opts: RenderOptions): string {
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
    parts.push(`<text class="oneday-hour" x="${LABEL_W - 6}" y="${yy + 4}" text-anchor="end">${h % 24}</text>`) // 跨零点回绕：25->1
  }
  // Track frame
  parts.push(
    `<rect class="oneday-track" x="${trackX}" y="${y(doc.rangeStart)}" width="${trackW}" height="${y(doc.rangeEnd) - y(doc.rangeStart)}"/>`
  )

  // Plan layer first (full-width translucent background + diagonal hatch, D3 覆盖语义)
  const planColors = [...new Set(entries.filter((e) => e.plan).map((e) => opts.typeColors[e.type] ?? hashTypeColor(e.type)))]
  // id 必须每次渲染唯一：同页多个时间轴块的 defs 同名 id 会跨 svg 冲撞（斜线丢失/错色）
  const uid = ++hatchUid
  if (planColors.length > 0) {
    const defs = planColors
      .map(
        (c, i) =>
          `<pattern id="oneday-hatch-${uid}-${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
          `<line x1="0" y1="0" x2="0" y2="6" stroke="${escapeXml(c)}" stroke-width="1.6" stroke-opacity="0.8"/></pattern>`
      )
      .join("")
    parts.push(`<defs>${defs}</defs>`)
  }
  for (const e of entries.filter((e) => e.plan)) {
    const color = opts.typeColors[e.type] ?? hashTypeColor(e.type)
    const hatchId = `oneday-hatch-${uid}-${planColors.indexOf(color)}`
    const yy = y(e.startMin)
    const hh = Math.max(2, y(e.endMin) - yy)
    parts.push(
      `<rect class="oneday-block oneday-plan" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${trackX + GAP_X}" y="${yy + GAP_X / 2}" width="${trackW - GAP_X * 2}" height="${hh - GAP_X}" rx="3" fill="${escapeXml(color)}" fill-opacity="${PLAN_OPACITY}" stroke="${escapeXml(color)}" stroke-opacity="0.7" stroke-width="1"></rect>` +
        `<rect pointer-events="none" class="oneday-plan-hatch" x="${trackX + GAP_X}" y="${yy + GAP_X / 2}" width="${trackW - GAP_X * 2}" height="${hh - GAP_X}" rx="3" fill="url(#${hatchId})"/>`
    )
    // plan 块也显示时长/备注（yyt 2026-08-17），样式淡一档
    const label = formatHours(durationMinutes(e.startMin, e.endMin))
    const fs = inlineFontSize(trackW - GAP_X * 2, hh - GAP_X, label)
    if (fs > 0) {
      const showNote = hh >= MIN_NOTE_H && e.note
      parts.push(
        `<text pointer-events="none" class="oneday-duration oneday-plan-label" data-line="${e.line}" font-size="${fs}" x="${trackX + trackW / 2}" y="${yy + hh / 2 + (showNote ? -4 : fs / 2 - 1.5)}" text-anchor="middle">${label}</text>`
      )
      if (showNote) {
        parts.push(
          `<text pointer-events="none" class="oneday-note oneday-plan-label" data-line="${e.line}" x="${trackX + trackW / 2}" y="${yy + hh / 2 + 12}" text-anchor="middle">${escapeXml(truncate(e.note ?? ""))}</text>`
        )
      }
    }
  }

  // Actual blocks: overlapping ones split into side-by-side columns (并列日程,
  // calendar-style; yyt 2026-08-17). Plans do not participate in columns.
  for (const p of placeActual(entries.filter((e) => !e.plan), trackX, trackW)) {
    const e = p.entry
    const color = opts.typeColors[e.type] ?? hashTypeColor(e.type)
    // 纵向每块自身内缩 x/2（yyt 规范：相邻块间隙=x，不挤压不累计）
    const yy = y(e.startMin) + GAP_X / 2
    const hh = Math.max(2, y(e.endMin) - y(e.startMin) - GAP_X)
    parts.push(
      `<rect class="oneday-block" data-line="${e.line}" data-type="${escapeXml(e.type)}" x="${p.x}" y="${yy}" width="${p.w}" height="${hh}" rx="3" fill="${escapeXml(color)}" fill-opacity="${BLOCK_OPACITY}"></rect>`
    )
    const label = formatHours(durationMinutes(e.startMin, e.endMin))
    // 备注排版（yyt 2026-08-17）：短备注与时长同行；长备注且块够高 ->
    // 时长加粗居中 + 备注第二行小字不加粗；再不行才去侧栏
    const combined = e.note ? `${label} · ${truncate(e.note, 8)}` : label
    const fsCombined = e.note ? inlineFontSize(p.w, hh, combined) : 0
    const fs = inlineFontSize(p.w, hh, label)
    const shortNote = Boolean(e.note) && (e.note?.length ?? 0) <= 8
    const canTwoLine = Boolean(e.note) && hh >= MIN_NOTE_H && fs > 0
    if (e.note && shortNote && fsCombined > 0) {
      parts.push(
        `<text pointer-events="none" class="oneday-duration" data-line="${e.line}" style="font-size:${fsCombined}px;fill:${relatedTextColor(color)}" x="${p.x + p.w / 2}" y="${yy + hh / 2 + fsCombined / 2 - 1.5}" text-anchor="middle">${escapeXml(combined)}</text>`
      )
    } else if (canTwoLine) {
      // 长备注多行：时长加粗居中在上，备注小字换行在下（放不下才省略号）
      const maxNoteLines = Math.max(1, Math.floor((hh - fs - 8) / 11))
      const noteLines = wrapNote(e.note ?? "", p.w, maxNoteLines)
      const totalH = fs + noteLines.length * 11
      const startY = yy + (hh - totalH) / 2
      parts.push(
        `<text pointer-events="none" class="oneday-duration" data-line="${e.line}" style="font-size:${fs}px;fill:${relatedTextColor(color)}" x="${p.x + p.w / 2}" y="${startY + fs - 2}" text-anchor="middle">${label}</text>`
      )
      noteLines.forEach((ln, i) => {
        parts.push(
          `<text pointer-events="none" class="oneday-note" data-line="${e.line}" style="fill:${relatedTextColor(color)}" x="${p.x + p.w / 2}" y="${startY + fs + 11 * (i + 1)}" text-anchor="middle">${escapeXml(ln)}</text>`
        )
      })
    } else if (e.note && fsCombined > 0) {
      parts.push(
        `<text pointer-events="none" class="oneday-duration" data-line="${e.line}" style="font-size:${fsCombined}px;fill:${relatedTextColor(color)}" x="${p.x + p.w / 2}" y="${yy + hh / 2 + fsCombined / 2 - 1.5}" text-anchor="middle">${escapeXml(combined)}</text>`
      )
    } else if (fs > 0) {
      parts.push(
        `<text pointer-events="none" class="oneday-duration" data-line="${e.line}" style="font-size:${fs}px;fill:${relatedTextColor(color)}" x="${p.x + p.w / 2}" y="${yy + hh / 2 + fs / 2 - 1.5}" text-anchor="middle">${label}</text>`
      )
      if (e.note) {
        // 实在放不进 -> 右侧标注车道
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
