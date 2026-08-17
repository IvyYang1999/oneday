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

/** Add a type to the block's `hide:` header (per-day highlighter hiding). */
export function addHiddenType(source: string, type: string): string {
  const lines = source.split("\n")
  const idx = lines.findIndex((l) => /^hide\s*:/.test(l.trim()))
  if (idx >= 0) {
    const existing = lines[idx].split(":")[1].split(/[\s,，]+/).filter(Boolean)
    if (existing.includes(type)) return source
    lines[idx] = `hide: ${[...existing, type].join(" ")}`
    return lines.join("\n")
  }
  // No hide header yet: insert at the top (header order doesn't matter to the parser).
  return `hide: ${type}\n${source}`
}

/** Remove a type from the block's `hide:` header (re-show a hidden highlighter). */
export function removeHiddenType(source: string, type: string): string {
  const lines = source.split("\n")
  const idx = lines.findIndex((l) => /^hide\s*:/.test(l.trim()))
  if (idx < 0) return source
  const remaining = lines[idx].split(":")[1].split(/[\s,，]+/).filter((t) => t && t !== type)
  if (remaining.length === 0) {
    lines.splice(idx, 1) // drop the header entirely when nothing is hidden anymore
  } else {
    lines[idx] = `hide: ${remaining.join(" ")}`
  }
  return lines.join("\n")
}

/** Set a header key (width/float/hide...), updating in place or inserting into the header zone. */
export function setHeaderValue(source: string, key: string, value: string): string {
  const lines = source.split("\n")
  const re = new RegExp(`^${key}\\s*:`)
  const idx = lines.findIndex((l) => re.test(l.trim()))
  if (idx >= 0) {
    lines[idx] = `${key}: ${value}`
    return lines.join("\n")
  }
  // Insert before the --- separator if present, else at the top.
  const sep = lines.findIndex((l) => l.trim() === "---")
  lines.splice(sep >= 0 ? sep : 0, 0, `${key}: ${value}`)
  return lines.join("\n")
}

/** Remove a header key entirely (no-op when absent). */
export function removeHeaderValue(source: string, key: string): string {
  const lines = source.split("\n")
  const re = new RegExp(`^${key}\\s*:`)
  const idx = lines.findIndex((l) => re.test(l.trim()))
  if (idx < 0) return source
  lines.splice(idx, 1)
  return lines.join("\n")
}

/**
 * Replace a fenced block's body inside whole-note content, preserving any
 * callout/quote prefix (e.g. "> ") of the opening fence on every body line.
 * Without this, editing a timeline inside `> [!note|right]` would break the callout.
 */
export function replaceBlockInContent(
  content: string,
  section: { lineStart: number; lineEnd: number },
  newSource: string
): string {
  const lines = content.split("\n")
  const openFence = lines[section.lineStart] ?? ""
  const prefix = /^(\s*(?:>\s*)*)/.exec(openFence)?.[1] ?? ""
  const body = newSource.split("\n").map((l) => (l === "" ? prefix.trimEnd() : prefix + l))
  lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, ...body)
  return lines.join("\n")
}

/** Set/replace the free-text section (`===` below the entries). Empty text removes the section. */
export function setTextSection(source: string, text: string): string {
  const lines = source.split("\n")
  const sep = lines.findIndex((l) => l.trim() === "===")
  const head = sep >= 0 ? lines.slice(0, sep) : lines
  // trim trailing blanks in the entry zone
  while (head.length > 0 && head[head.length - 1].trim() === "") head.pop()
  const trimmed = text.trim()
  if (trimmed === "") return head.join("\n")
  return [...head, "===", ...trimmed.split("\n")].join("\n")
}
