import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "./prompt"
import { parseTimeline } from "../core/parser"

describe("buildSystemPrompt", () => {
  it("includes grammar, types, current time and existing entries", () => {
    const doc = parseTimeline("09:00-10:00 math 行列式")
    const p = buildSystemPrompt({
      typeColors: { math: "#7fd4c1", fitness: "#f6c667" },
      now: new Date(2026, 7, 18, 21, 35),
      doc,
    })
    expect(p).toContain("21:35")
    expect(p).toContain("math, fitness")
    expect(p).toContain("09:00-10:00 math 行列式")
    expect(p).toContain("不得与之重叠")
    expect(p).toContain("HH:MM-HH:MM")
  })

  it("notes when the day is still empty", () => {
    const p = buildSystemPrompt({ typeColors: { misc: "#ccc" }, now: new Date(), doc: parseTimeline("") })
    expect(p).toContain("还没有实际色块")
  })
})
