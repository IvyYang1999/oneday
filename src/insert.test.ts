import { describe, expect, it } from "vitest"
import { inferDate, timelineTemplate } from "./insert"
import { parseTimeline } from "./core/parser"

describe("inferDate", () => {
  it("from daily-note filenames", () => {
    expect(inferDate("2026-08-18")).toBe("2026-08-18")
    expect(inferDate("2026.8.18 周三")).toBe("2026-08-18")
    expect(inferDate("2026.8.4tue")).toBe("2026-08-04")
  })

  it("falls back to today for non-dated notes", () => {
    const now = new Date(2026, 7, 17)
    expect(inferDate("读书笔记", now)).toBe("2026-08-17")
    expect(inferDate(null, now)).toBe("2026-08-17")
  })
})

describe("timelineTemplate", () => {
  it("parses cleanly", () => {
    const doc = parseTimeline(timelineTemplate("2026-08-18").replace(/^```timeline\n|```$/g, ""))
    expect(doc.errors).toEqual([])
    expect(doc.date).toBe("2026-08-18")
    expect(doc.rangeStart).toBe(420)
  })
})
