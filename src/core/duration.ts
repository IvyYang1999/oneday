/** Duration calculation & formatting (paper convention: "3h", "3.25h", "0.75h"). */

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
