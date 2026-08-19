import { describe, expect, it } from "vitest"
import { parseTimeline } from "../core/parser"
import { extractJson, interpretActions, interpretResponse, interpretResponses } from "./response"

const DOC = parseTimeline("range: 7-23\n---\n09:00-10:00 math\n")

describe("extractJson", () => {
  it("extracts bare JSON and fenced JSON", () => {
    expect(extractJson('{"start":"10:00","end":"10:30","type":"math"}')).toBeTruthy()
    expect(extractJson('当然！```json\n{"start":"10:00","end":"10:30","type":"math"}\n```')).toBeTruthy()
    expect(extractJson("没有 json")).toBeNull()
  })
})

describe("interpretResponse", () => {
  it("validates a good entry and produces a canonical source line", () => {
    const r = interpretResponse('{"start":"10:00","end":"10:30","type":"fitness","note":"健身"}', DOC)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entry.sourceLine).toBe("10:00-10:30 fitness 健身")
  })

  it("passes through agent error as reason", () => {
    const r = interpretResponse('{"error":"几点开始的呢？"}', DOC)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("几点开始的呢？")
  })

  it("allows overlap with existing actual entries (并列日程)", () => {
    const r = interpretResponse('{"start":"09:30","end":"10:30","type":"misc"}', DOC)
    expect(r.ok).toBe(true)
  })

  it("rejects bad time format and tiny durations", () => {
    expect(interpretResponse('{"start":"十点","end":"10:30","type":"misc"}', DOC).ok).toBe(false)
    expect(interpretResponse('{"start":"10:00","end":"10:02","type":"misc"}', DOC).ok).toBe(false)
  })

  it("writes cross-midnight entries back in plain 24h (D10)", () => {
    const r = interpretResponse('{"start":"23:30","end":"00:30","type":"reading"}', DOC)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entry.startMin).toBe(23 * 60 + 30)
      expect(r.entry.endMin).toBe(24 * 60 + 30)
      expect(r.entry.sourceLine).toBe("23:30-00:30 reading")
    }
  })
})

describe("interpretResponses (一句话多个色块)", () => {
  it("accepts an array and sorts by start time", () => {
    const r = interpretResponses(
      '[{"start":"10:00","end":"11:00","type":"fitness","note":"健身"},{"start":"09:00","end":"10:00","type":"math"}]',
      DOC
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entries).toHaveLength(2)
      expect(r.entries[0].startMin).toBe(9 * 60) // 排过序
    }
  })

  it("single object still works", () => {
    const r = interpretResponses('{"start":"10:00","end":"10:30","type":"math"}', DOC)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.entries).toHaveLength(1)
  })

  it("any invalid item fails the whole batch", () => {
    const r = interpretResponses('[{"start":"10:00","end":"11:00","type":"math"},{"start":"bad","end":"11:00","type":"math"}]', DOC)
    expect(r.ok).toBe(false)
  })
})

describe("interpretActions (编辑已有色块)", () => {
  const DOC2 = parseTimeline("09:00-10:00 math 行列式\n10:00-11:00 fitness 健身")

  it("update with partial patch", () => {
    const r = interpretActions('{"action":"update","target":2,"end":"11:30"}', DOC2)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.actions[0]).toEqual({ kind: "update", targetIndex: 1, patch: { endMin: 690 } })
  })

  it("delete", () => {
    const r = interpretActions('{"action":"delete","target":1}', DOC2)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.actions[0]).toEqual({ kind: "delete", targetIndex: 0 })
  })

  it("mixed array: create + update", () => {
    const r = interpretActions('[{"start":"12:00","end":"13:00","type":"meal"},{"action":"update","target":1,"note":"改备注"}]', DOC2)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.actions[0].kind).toBe("create")
      expect(r.actions[1]).toMatchObject({ kind: "update", targetIndex: 0 })
    }
  })

  it("target out of range fails", () => {
    expect(interpretActions('{"action":"delete","target":9}', DOC2).ok).toBe(false)
  })

  it("update with empty patch fails", () => {
    expect(interpretActions('{"action":"update","target":1}', DOC2).ok).toBe(false)
  })
})
