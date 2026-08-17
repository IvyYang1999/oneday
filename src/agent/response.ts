/** Extract & validate the agent's structured entry (D7 插件统一校验). */
import { normalizeSpan } from "../core/parser"
import { TimelineDoc } from "../core/types"
import { formatEntryLine } from "../core/format"

export interface AgentEntry {
  start: string
  end: string
  type: string
  note?: string
  plan?: boolean
}

export interface ValidatedEntry {
  startMin: number
  endMin: number
  type: string
  note?: string
  plan: boolean
  /** Canonical source line to insert, e.g. "09:15-12:15 math 李林线代" */
  sourceLine: string
}

export type ResponseResult =
  | { ok: true; entry: ValidatedEntry }
  | { ok: false; reason: string }

/** Find the first {...} JSON object in arbitrary text (tolerates code fences). */
export function extractJson(text: string): unknown | null {
  const fence = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text)
  const candidate = fence ? fence[1] : /\{[\s\S]*\}/.exec(text)?.[0]
  if (!candidate) return null
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/

function parseClock(s: unknown): number | null {
  if (typeof s !== "string") return null
  const m = TIME_RE.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 30 || min < 0 || min > 59) return null
  return h * 60 + min
}

export function validateEntry(raw: unknown, doc: TimelineDoc): ResponseResult {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "返回不是 JSON 对象" }
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.error === "string") {
    return { ok: false, reason: obj.error }
  }
  const rawStart = parseClock(obj.start)
  const rawEnd = parseClock(obj.end)
  if (rawStart === null || rawEnd === null) {
    return { ok: false, reason: "start/end 时间格式应为 HH:MM" }
  }
  const type = typeof obj.type === "string" ? obj.type.trim() : ""
  if (!/^[A-Za-z][\w-]*$/.test(type)) {
    return { ok: false, reason: "type 必须是标识符" }
  }
  const [startMin, endMin] = normalizeSpan(rawStart, rawEnd, doc.rangeStart)
  if (endMin - startMin < 5) {
    return { ok: false, reason: "时长不足 5 分钟，疑似有误" }
  }
  const plan = obj.plan === true
  if (!plan) {
    const overlap = doc.entries.some((e) => !e.plan && e.startMin < endMin && startMin < e.endMin)
    if (overlap) {
      return { ok: false, reason: "与当天已有色块重叠，请手动调整" }
    }
  }
  const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : undefined
  const sourceLine = formatEntryLine({ plan, startMin, endMin, type, note })
  return { ok: true, entry: { startMin, endMin, type, note, plan, sourceLine } }
}

/** Full pipeline: raw agent text -> validated entry. */
export function interpretResponse(text: string, doc: TimelineDoc): ResponseResult {
  const json = extractJson(text)
  if (json === null) {
    return { ok: false, reason: "返回中没有 JSON" }
  }
  return validateEntry(json, doc)
}
