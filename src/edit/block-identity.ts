const TIMELINE_FENCE = /^\s*(?:>\s*)*```timeline(?:\s|$)/i
const TIMELINE_OPEN = /^(\s*(?:>\s*)*)(`{3,}|~{3,})\s*timeline(?:\s.*)?$/i

/**
 * Stable identity for a timeline block while its own or earlier contents
 * change line count. The ordinal changes only if a whole timeline fence is
 * inserted or removed before it, which Oneday's in-block transforms never do.
 */
export function timelineFenceOrdinal(content: string, lineStart: number): number {
  const lines = content.split("\n")
  let ordinal = 0
  const limit = Math.max(0, Math.min(lineStart, lines.length))
  for (let line = 0; line < limit; line += 1) {
    if (TIMELINE_FENCE.test(lines[line])) ordinal += 1
  }
  return ordinal
}

/** Read the current body of the Nth timeline fence from whole-note content. */
export interface TimelineFenceLocation {
  lineStart: number
  lineEnd: number
  source: string
}

/** Locate the Nth timeline fence in the current note, independent of old DOM line numbers. */
export function timelineFenceAtOrdinal(content: string, targetOrdinal: number): TimelineFenceLocation | null {
  if (!Number.isInteger(targetOrdinal) || targetOrdinal < 0) return null
  const lines = content.split("\n")
  let ordinal = 0
  for (let start = 0; start < lines.length; start += 1) {
    const opening = TIMELINE_OPEN.exec(lines[start] ?? "")
    if (!opening) continue
    const prefix = opening[1] ?? ""
    const fence = opening[2]
    if (ordinal !== targetOrdinal) {
      ordinal += 1
      continue
    }

    const emptyQuotedLine = prefix.trimEnd()
    const body: string[] = []
    for (let end = start + 1; end < lines.length; end += 1) {
      const line = lines[end] ?? ""
      if (line.slice(prefix.length).trim() === fence && (prefix === "" || line.startsWith(prefix))) {
        return { lineStart: start, lineEnd: end, source: body.join("\n") }
      }
      if (prefix === "") body.push(line)
      else if (line.startsWith(prefix)) body.push(line.slice(prefix.length))
      else if (line === emptyQuotedLine) body.push("")
      else return null
    }
    return null
  }
  return null
}

/** Read the current body of the Nth timeline fence from whole-note content. */
export function timelineSourceAtOrdinal(content: string, targetOrdinal: number): string | null {
  return timelineFenceAtOrdinal(content, targetOrdinal)?.source ?? null
}
