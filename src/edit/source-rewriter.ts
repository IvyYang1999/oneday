/**
 * Insert a new entry line into a timeline block source, keeping entries
 * sorted by start time. Pure string surgery; the caller (dialog) locates
 * the code block in the note via MarkdownPostProcessorContext.
 */
import { parseTimeline } from "../core/parser"

/** Insert sourceLine into source. Returns the new block source. */
export function insertEntryLine(source: string, sourceLine: string, newStartMin: number): string {
  const lines = source.split("\n")
  // Drop trailing blank lines so we insert before the fence, not after them.
  let tail = lines.length
  while (tail > 0 && lines[tail - 1].trim() === "") tail--
  const body = lines.slice(0, tail)
  const trailing = lines.slice(tail)

  const doc = parseTimeline(source)
  // Entry lines sorted in source; find the last entry starting <= newStartMin.
  const entryLines = doc.entries.map((e) => e.line).sort((a, b) => a - b)
  let insertAt = -1
  for (const e of doc.entries) {
    if (e.startMin <= newStartMin && (insertAt === -1 || e.line > insertAt)) {
      insertAt = e.line
    }
  }
  if (insertAt >= 0) {
    body.splice(insertAt + 1, 0, sourceLine)
  } else {
    // Before the first entry; after header/separator if present.
    const firstEntry = entryLines[0]
    body.splice(firstEntry !== undefined ? firstEntry : body.length, 0, sourceLine)
  }
  return [...body, ...trailing].join("\n")
}

/** Replace the 0-based line inside the block source. */
export function replaceEntryLine(source: string, line: number, newLine: string): string {
  const lines = source.split("\n")
  if (line < 0 || line >= lines.length) throw new Error(`行号越界：${line}`)
  lines[line] = newLine
  return lines.join("\n")
}

/** Delete the 0-based line from the block source. */
export function deleteEntryLine(source: string, line: number): string {
  const lines = source.split("\n")
  if (line < 0 || line >= lines.length) throw new Error(`行号越界：${line}`)
  lines.splice(line, 1)
  return lines.join("\n")
}
