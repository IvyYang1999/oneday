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

/** Find the first {...} or [...] JSON value in arbitrary text (tolerates code fences). */
export function extractJson(text: string): unknown | null {
  const fence = /```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/.exec(text)
  const candidate = fence ? fence[1] : /(\[[\s\S]*\]|\{[\s\S]*\})/.exec(text)?.[1]
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
  if (!/^\S+$/.test(type)) {
    return { ok: false, reason: "type 不能含空白字符" }
  }
  const [startMin, endMin] = normalizeSpan(rawStart, rawEnd, doc.rangeStart)
  if (endMin - startMin < 5) {
    return { ok: false, reason: "时长不足 5 分钟，疑似有误" }
  }
  const plan = obj.plan === true
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

export type ResponsesResult =
  | { ok: true; entries: ValidatedEntry[] }
  | { ok: false; reason: string }

/** target = 提示词里「已有色块」列表的编号（1 起，按开始时间排序，plan 除外） */
export type AgentAction =
  | { kind: "create"; entry: ValidatedEntry }
  | { kind: "update"; targetIndex: number; patch: { startMin?: number; endMin?: number; type?: string; note?: string } }
  | { kind: "delete"; targetIndex: number }

export type ActionsResult =
  | { ok: true; actions: AgentAction[] }
  | { ok: false; reason: string }

/** 多段描述：一句话多个色块（JSON 数组）；单对象也接受（yyt 2026-08-19）。 */
export function interpretResponses(text: string, doc: TimelineDoc): ResponsesResult {
  const json = extractJson(text)
  if (json === null) {
    const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0)
    return { ok: false, reason: firstLine ? `模型没按 JSON 格式回答：${firstLine.slice(0, 60)}` : "返回中没有 JSON" }
  }
  const list = Array.isArray(json) ? json : [json]
  const entries: ValidatedEntry[] = []
  for (const item of list) {
    const r = validateEntry(item, doc)
    if (!r.ok) return { ok: false, reason: r.reason }
    entries.push(r.entry)
  }
  return { ok: true, entries: entries.sort((a, b) => a.startMin - b.startMin) }
}

/** 编辑动作管道：create（裸对象）/ update / delete / error，数组混合。 */
export function interpretActions(text: string, doc: TimelineDoc): ActionsResult {
  const json = extractJson(text)
  if (json === null) {
    const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0)
    return { ok: false, reason: firstLine ? `模型没按 JSON 格式回答：${firstLine.slice(0, 60)}` : "返回中没有 JSON" }
  }
  const list = Array.isArray(json) ? json : [json]
  const actions: AgentAction[] = []
  for (const raw of list) {
    if (raw === null || typeof raw !== "object") return { ok: false, reason: "返回不是 JSON 对象" }
    const obj = raw as Record<string, unknown>
    if (typeof obj.error === "string") return { ok: false, reason: obj.error }
    const action = typeof obj.action === "string" ? obj.action : "create"

    if (action === "create") {
      const r = validateEntry(obj, doc)
      if (!r.ok) return { ok: false, reason: r.reason }
      actions.push({ kind: "create", entry: r.entry })
      continue
    }

    // update / delete 需要 target
    const target = typeof obj.target === "number" ? obj.target : NaN
    const actualCount = doc.entries.filter((e) => !e.plan).length
    if (!Number.isInteger(target) || target < 1 || target > actualCount) {
      return { ok: false, reason: `target 应为 1-${actualCount} 的编号` }
    }
    if (action === "delete") {
      actions.push({ kind: "delete", targetIndex: target - 1 })
      continue
    }
    if (action === "update") {
      const patch: { startMin?: number; endMin?: number; type?: string; note?: string } = {}
      if (obj.start !== undefined) {
        const v = parseClock(obj.start)
        if (v === null) return { ok: false, reason: "start 时间格式应为 HH:MM" }
        patch.startMin = v
      }
      if (obj.end !== undefined) {
        const v = parseClock(obj.end)
        if (v === null) return { ok: false, reason: "end 时间格式应为 HH:MM" }
        patch.endMin = v
      }
      if (obj.type !== undefined) {
        const t = String(obj.type).trim()
        if (!/^\S+$/.test(t)) return { ok: false, reason: "type 不能含空白字符" }
        patch.type = t
      }
      if (obj.note !== undefined) patch.note = String(obj.note).trim()
      if (Object.keys(patch).length === 0) return { ok: false, reason: "update 没有要改的字段" }
      actions.push({ kind: "update", targetIndex: target - 1, patch })
      continue
    }
    return { ok: false, reason: `未知 action：${action}` }
  }
  return { ok: true, actions }
}
