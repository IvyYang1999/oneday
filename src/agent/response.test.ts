import { describe, expect, it } from "vitest"
import { parseTimeline } from "../core/parser"
import { extractJson, interpretResponse } from "./response"

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
