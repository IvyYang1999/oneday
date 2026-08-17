/**
 * oneday core types — pure TS, zero Obsidian deps.
 * Markdown source is the single source of truth; these are the parsed forms.
 */

export interface TimelineDoc {
  /** YYYY-MM-DD, optional in source (falls back to note name/frontmatter at render time). */
  date?: string
  /** Axis start, minutes from midnight. Default 7*60. */
  rangeStart: number
  /** Axis end, minutes from midnight (may exceed 1440 when the axis extends past midnight, D10). */
  rangeEnd: number
  entries: Entry[]
  annotations: Annotation[]
  errors: ParseError[]
  /** Per-block hidden highlighters (`hide:` header); global palette minus these is shown. */
  hiddenTypes: string[]
  /** Per-block width override in px (`width:` header, base width without the label lane). */
  width?: number
  /** Float the block right so text wraps on the left (`float: right` header). */
  floatRight?: boolean
}

export interface Entry {
  /** plan-layer block (低透明度背景，实际块覆盖其上) */
  plan: boolean
  /** Minutes from midnight; may exceed 1440 for after-midnight entries (D10). */
  startMin: number
  endMin: number
  /** Task type key; color comes from settings mapping (D2). */
  type: string
  note?: string
  /** 0-based source line inside the code block, for write-back. */
  line: number
}

export interface Annotation {
  timeMin: number
  text: string
  line: number
}

export interface ParseError {
  line: number
  text: string
  reason: string
}

export const DEFAULT_RANGE_START = 7 * 60
export const DEFAULT_RANGE_END = 23 * 60
export const DAY_MINUTES = 24 * 60
