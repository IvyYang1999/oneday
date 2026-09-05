import { describe, expect, it } from "vitest"
import { extractDatedTimelineEntries, filterWeekEntries, weekBounds } from "./weekly-ledger"

describe("weekly Markdown ledger", () => {
  it("uses Monday-Sunday bounds", () => {
    expect(weekBounds("2026-08-23")).toEqual({ start: "2026-08-17", end: "2026-08-23" })
    expect(weekBounds("2026-08-24")).toEqual({ start: "2026-08-24", end: "2026-08-30" })
  })

  it("extracts every timeline fence and filters entries to the requested week", () => {
    const content = [
      "```timeline", "date: 2026-08-22", "---", "09:00-10:00 开发 [todo:weekly-build]", "```",
      "text",
      "```timeline", "date: 2026-08-24", "---", "10:00-11:00 开发", "```",
    ].join("\n")
    const dated = extractDatedTimelineEntries(content, "fallback")
    expect(dated).toHaveLength(2)
    expect(filterWeekEntries(dated, "2026-08-23").map((item) => item.date)).toEqual(["2026-08-22"])
    expect(dated[0].entries[0].todoId).toBe("weekly-build")
  })
})
