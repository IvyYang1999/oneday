/**
 * oneday timeline source parser (mermaid-style fenced block body, without the fences).
 *
 * Grammar v0 (技术方案.md §二):
 *   header:  "key: value" lines (date, range), terminated by an optional "---"
 *   entry:   [plan] HH:MM-HH:MM <type> [note...]
 *   annotation: @HH:MM text...
 *   blank lines and "#" comments are ignored
 *
 * Cross-midnight (D10): an entry starting before rangeStart belongs to the next
 * calendar morning but the same logical day -> shifted +24h internally.
 */
import {
  Annotation,
  DAY_MINUTES,
  DEFAULT_RANGE_END,
  DEFAULT_RANGE_START,
  Entry,
  ParseError,
  TimelineDoc,
} from "./types"

const ENTRY_RE = /^(plan\s+)?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s+([A-Za-z][\w-]*)(?:\s+(.*))?$/
const ANNOTATION_RE = /^@(\d{1,2}):(\d{2})\s+(.*)$/
const HEADER_RE = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/
const RANGE_RE = /^(\d{1,2})(?:-(\d{1,2}))?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** Accept hours 0..30 so sources may write 24:30 / 25:30 directly. */
const MAX_HOUR = 30

function toMinutes(h: string, m: string): number | null {
  const hour = Number(h)
  const minute = Number(m)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > MAX_HOUR || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

/** Normalize [start, end): cross-midnight wrap and D10 range-based shifting. */
function normalizeSpan(rawStart: number, rawEnd: number, rangeStart: number): [number, number] {
  let start = rawStart
  let end = rawEnd
  if (start < rangeStart) {
    start += DAY_MINUTES
    end += DAY_MINUTES
  }
  if (end <= start) {
    end += DAY_MINUTES
  }
  return [start, end]
}

/** Flag overlapping actual (non-plan) entries; plan entries may overlap freely. */
function findOverlaps(entries: Entry[]): ParseError[] {
  const errors: ParseError[] = []
  const actual = entries.filter((e) => !e.plan)
  for (let i = 0; i < actual.length; i++) {
    for (let j = i + 1; j < actual.length; j++) {
      const a = actual[i]
      const b = actual[j]
      if (a.startMin < b.endMin && b.startMin < a.endMin) {
        errors.push({
          line: b.line,
          text: "",
          reason: `overlap with line ${a.line + 1} (${a.type})`,
        })
      }
    }
  }
  return errors
}

export function parseTimeline(source: string): TimelineDoc {
  const doc: TimelineDoc = {
    rangeStart: DEFAULT_RANGE_START,
    rangeEnd: DEFAULT_RANGE_END,
    entries: [],
    annotations: [],
    errors: [],
  }

  const lines = source.split(/\r?\n/)
  let inHeader = true
  let sawSeparator = false

  lines.forEach((raw, line) => {
    const text = raw.trim()
    if (text === "" || text.startsWith("#")) return

    if (inHeader && text === "---") {
      inHeader = false
      sawSeparator = true
      return
    }

    if (inHeader) {
      const header = HEADER_RE.exec(text)
      // A line that parses as an entry/annotation ends the header section.
      if (!header || ENTRY_RE.test(text) || ANNOTATION_RE.test(text)) {
        inHeader = false
      } else {
        applyHeader(doc, header[1].toLowerCase(), header[2].trim(), line, raw)
        return
      }
    }

    const annotation = ANNOTATION_RE.exec(text)
    if (annotation) {
      const timeMin = toMinutes(annotation[1], annotation[2])
      if (timeMin === null) {
        doc.errors.push({ line, text: raw, reason: "invalid time" })
        return
      }
      let t = timeMin
      if (t < doc.rangeStart) t += DAY_MINUTES // D10, same rule as entries
      const item: Annotation = { timeMin: t, text: annotation[3].trim(), line }
      doc.annotations.push(item)
      return
    }

    const entry = ENTRY_RE.exec(text)
    if (entry) {
      const rawStart = toMinutes(entry[2], entry[3])
      const rawEnd = toMinutes(entry[4], entry[5])
      if (rawStart === null || rawEnd === null) {
        doc.errors.push({ line, text: raw, reason: "invalid time" })
        return
      }
      const [startMin, endMin] = normalizeSpan(rawStart, rawEnd, doc.rangeStart)
      const item: Entry = {
        plan: Boolean(entry[1]),
        startMin,
        endMin,
        type: entry[6],
        note: entry[7]?.trim() || undefined,
        line,
      }
      doc.entries.push(item)
      return
    }

    doc.errors.push({ line, text: raw, reason: sawSeparator || !inHeader ? "unrecognized line" : "unrecognized line" })
  })

  // Axis extends past rangeEnd to cover after-midnight entries (D10 自然延伸).
  for (const e of doc.entries) {
    if (e.endMin > doc.rangeEnd) doc.rangeEnd = e.endMin
  }
  for (const a of doc.annotations) {
    if (a.timeMin > doc.rangeEnd) doc.rangeEnd = a.timeMin
  }

  doc.errors.push(...findOverlaps(doc.entries))
  return doc
}

function applyHeader(doc: TimelineDoc, key: string, value: string, line: number, raw: string): void {
  switch (key) {
    case "date": {
      if (DATE_RE.test(value)) {
        doc.date = value
      } else {
        doc.errors.push({ line, text: raw, reason: "date must be YYYY-MM-DD" })
      }
      return
    }
    case "range": {
      const m = RANGE_RE.exec(value)
      if (!m) {
        doc.errors.push({ line, text: raw, reason: "range must look like 7-23" })
        return
      }
      const start = Number(m[1])
      const end = m[2] !== undefined ? Number(m[2]) : DEFAULT_RANGE_END / 60
      if (start < 0 || start > 23 || end <= start || end > MAX_HOUR) {
        doc.errors.push({ line, text: raw, reason: "range out of bounds" })
        return
      }
      doc.rangeStart = start * 60
      doc.rangeEnd = end * 60
      return
    }
    default:
      doc.errors.push({ line, text: raw, reason: `unknown header key: ${key}` })
  }
}
