/** Per-type aggregation — the auto version of the paper's 酒红统计 (当日部分). */
import { Entry } from "./types"
import { durationMinutes } from "./duration"

export interface TypeStat {
  type: string
  minutes: number
}

/** Aggregate actual (non-plan) entries by type, longest first. */
export function statsByType(entries: Entry[]): TypeStat[] {
  const totals = new Map<string, number>()
  for (const e of entries) {
    if (e.plan) continue
    totals.set(e.type, (totals.get(e.type) ?? 0) + durationMinutes(e.startMin, e.endMin))
  }
  return [...totals.entries()]
    .map(([type, minutes]) => ({ type, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
}
