import type { Annotation, Entry } from "../core/types"

export interface EntryTarget {
  line: number
  signature: string
}

export interface MarkerTarget {
  line: number
  signature: string
}

function entrySignature(entry: Entry): string {
  return JSON.stringify([
    entry.plan,
    entry.startMin,
    entry.endMin,
    entry.type,
    entry.note ?? "",
    entry.todoId ?? "",
  ])
}

function markerSignature(marker: Annotation): string {
  return JSON.stringify([
    Boolean(marker.plan),
    marker.timeMin,
    marker.type ?? "",
    marker.text,
  ])
}

/**
 * Capture the semantic identity of the entry the user acted on. Source line
 * numbers are only a fast path: inserting another entry before it must not
 * redirect a later popover save to a different block.
 */
export function captureEntryTarget(entry: Entry): EntryTarget {
  return { line: entry.line, signature: entrySignature(entry) }
}

export function resolveEntryTarget(entries: readonly Entry[], target: EntryTarget): Entry | null {
  const atLine = entries.find((entry) => entry.line === target.line)
  if (atLine && entrySignature(atLine) === target.signature) return atLine
  const matches = entries.filter((entry) => entrySignature(entry) === target.signature)
  return matches.length === 1 ? matches[0] : null
}

export function captureMarkerTarget(marker: Annotation): MarkerTarget {
  return { line: marker.line, signature: markerSignature(marker) }
}

export function resolveMarkerTarget(markers: readonly Annotation[], target: MarkerTarget): Annotation | null {
  const atLine = markers.find((marker) => marker.line === target.line)
  if (atLine && markerSignature(atLine) === target.signature) return atLine
  const matches = markers.filter((marker) => markerSignature(marker) === target.signature)
  return matches.length === 1 ? matches[0] : null
}
