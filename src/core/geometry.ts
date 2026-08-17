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
