/** Canonical entry line formatting — the single writer of timeline syntax. */

export interface EntryParts {
  plan: boolean
  startMin: number
  endMin: number
  type: string
  note?: string
}

/** "09:15" / values >=24h wrap to plain 24h (D10: source stays ordinary clock time). */
export function formatClockPlain(minutes: number): string {
  const v = minutes >= 24 * 60 ? minutes - 24 * 60 : minutes
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`
}

/** plan 09:15-12:15 math 李林线代 */
export function formatEntryLine(p: EntryParts): string {
  const head = `${formatClockPlain(p.startMin)}-${formatClockPlain(p.endMin)} ${p.type}`
  return `${p.plan ? "plan " : ""}${head}${p.note ? " " + p.note : ""}`
}

/** "2026-08-18" -> "周二"（无效输入返回空串） */
export function weekdayZh(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return ""
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ""
  return "周" + "日一二三四五六"[d.getDay()]
}
