/**
 * Component layout model (yyt 2026-08-17: 块内组件自由布局).
 * The block body is up to two columns of named slots; the `layout:` header
 * persists the arrangement:  layout: text | toolbar,timeline,stats,dialog
 */

export const SLOT_IDS = ["text", "toolbar", "timeline", "stats", "dialog"] as const
export type SlotId = (typeof SLOT_IDS)[number]

export function parseLayout(value: string): SlotId[][] | null {
  const cols = value.split("|").map((col) =>
    col
      .split(/[\s,，]+/)
      .map((s) => s.trim())
      .filter((s): s is SlotId => (SLOT_IDS as readonly string[]).includes(s))
  )
  const flat = cols.flat()
  if (flat.length === 0) return null
  // dedupe, keep order
  const seen = new Set<string>()
  const deduped = cols.map((col) => col.filter((id) => (seen.has(id) ? false : (seen.add(id), true))))
  return deduped.filter((col) => col.length > 0)
}

export function serializeLayout(cols: SlotId[][]): string {
  return cols.map((col) => col.join(",")).join(" | ")
}

/** Default layout: text left, everything else right (honors `side` and text absence). */
export function defaultLayout(hasText: boolean, side: "left" | "right" | undefined): SlotId[][] {
  const rail: SlotId[] = ["toolbar", "timeline", "stats", "dialog"]
  if (!hasText) return [rail]
  return side === "left" ? [rail, ["text"]] : [["text"], rail]
}

/**
 * Effective layout: parsed header (if any) with missing slots appended to
 * sensible columns, text slot dropped when the block has no text section.
 */
export function resolveLayout(parsed: SlotId[][] | null, hasText: boolean, side: "left" | "right" | undefined): SlotId[][] {
  const base = parsed ?? defaultLayout(hasText, side)
  let cols = base.map((col) => col.filter((id) => hasText || id !== "text"))
  const present = new Set(cols.flat())
  const required: SlotId[] = hasText ? [...SLOT_IDS] : SLOT_IDS.filter((id) => id !== "text") as SlotId[]
  for (const id of required) {
    if (present.has(id)) continue
    // missing: text goes left, everything else joins the timeline column (or last)
    if (id === "text") {
      cols.unshift(["text"])
    } else {
      const timelineCol = cols.find((col) => col.includes("timeline"))
      ;(timelineCol ?? cols[cols.length - 1]).push(id)
    }
    present.add(id)
  }
  cols = cols.filter((col) => col.length > 0)
  return cols.length > 0 ? cols : defaultLayout(hasText, side)
}
