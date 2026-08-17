/** y(px) <-> minutes mapping shared by the SVG builder and draw interaction. */

export const AXIS_PAD_TOP = 8
export const AXIS_PAD_BOTTOM = 8
export const LABEL_W = 36
export const TRACK_PAD = 6
export const DEFAULT_HOUR_HEIGHT = 48
export const SNAP_MINUTES = 15

export function yFromMinutes(min: number, rangeStart: number, hourHeight: number): number {
  return AXIS_PAD_TOP + ((min - rangeStart) / 60) * hourHeight
}

export function minutesFromY(y: number, rangeStart: number, hourHeight: number): number {
  return rangeStart + ((y - AXIS_PAD_TOP) / hourHeight) * 60
}

/** Snap minutes to the grid (default 15min, paper granularity). */
export function snapMinutes(min: number, snap = SNAP_MINUTES): number {
  return Math.round(min / snap) * snap
}

/**
 * Adaptive inline font size for duration labels (yyt 2026-08-17:
 * 时长永远居中，字号自适应). Returns 0 when the block is too small for
 * any readable label (caller falls back to the side lane).
 */
export function inlineFontSize(w: number, h: number, text: string): number {
  const byWidth = (w - 8) / (text.length * 0.62)
  const byHeight = h * 0.55
  const size = Math.min(11, byWidth, byHeight)
  if (size < 6) return 0
  return Math.floor(size * 2) / 2
}
