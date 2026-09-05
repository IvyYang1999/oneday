/** Duration calculation & formatting (paper convention: "3h", "3.25h", "0.75h"). */

/** Smallest authored span used when a point-like object is placed on the timeline. */
export const MIN_TIMELINE_SPAN_MINUTES = 5

export function durationMinutes(startMin: number, endMin: number): number {
  return Math.max(0, endMin - startMin)
}

/** 180 -> "3h"; 195 -> "3.25h"; 45 -> "0.75h". Up to 2 decimals, trailing zeros trimmed. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60
  const rounded = Math.round(hours * 100) / 100
  const text = String(rounded)
  return `${text}h`
}

/** "09:15" style display; values >= 24h shown as "25:30" (D10 same-logical-day). */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Clock-face presentation for timeline coordinates (26:30 -> 02:30). */
export function formatClock24(minutes: number): string {
  const day = 24 * 60
  const wrapped = ((minutes % day) + day) % day
  return formatClock(wrapped)
}

/** Day offset carried by a monotonic timeline coordinate (26:30 -> 1). */
export function clockDayOffset(minutes: number): number {
  return Math.max(0, Math.floor(minutes / (24 * 60)))
}

export type DurationInputUnit = "minutes" | "hours"

/** Prefer hours for longer values while keeping short durations easy to scan. */
export function preferredDurationUnit(minutes: number): DurationInputUnit {
  return minutes >= 60 ? "hours" : "minutes"
}

/** Canonical minutes -> compact editable value in the selected unit. */
export function durationInputValue(minutes: number, unit: DurationInputUnit): string {
  const value = unit === "hours" ? minutes / 60 : minutes
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

/** Editable value -> canonical integer minutes used by Markdown and metrics. */
export function durationInputMinutes(value: string | number, unit: DurationInputUnit): number {
  const entered = Math.max(0, Number(value) || 0)
  if (entered === 0) return 0
  // Markdown stores integer minutes. Preserve any positive authored intent
  // instead of silently collapsing a small decimal-hour value back to zero.
  return Math.max(1, Math.round(entered * (unit === "hours" ? 60 : 1)))
}
