import { describe, expect, it } from "vitest"
import { parseTimeline } from "./parser"
import { statsByType } from "./stats"

describe("statsByType", () => {
  it("aggregates actual entries by type, longest first, excluding plan", () => {
    const doc = parseTimeline([
      "plan 08:00-12:00 math",
      "09:15-12:15 math",
      "13:30-17:00 micro",
      "19:00-20:00 math",
    ].join("\n"))
    expect(statsByType(doc.entries)).toEqual([
      { type: "math", minutes: 240 },
      { type: "micro", minutes: 210 },
    ])
  })

  it("returns empty for plan-only days", () => {
    const doc = parseTimeline("plan 08:00-09:00 math")
    expect(statsByType(doc.entries)).toEqual([])
  })
})
