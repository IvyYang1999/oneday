import { describe, expect, it } from "vitest"
import { timelineFenceAtOrdinal, timelineFenceOrdinal, timelineSourceAtOrdinal } from "./block-identity"

describe("timelineFenceOrdinal", () => {
  it("keeps a block identity when earlier block contents gain lines", () => {
    const before = [
      "```timeline", "date: 2026-08-22", "```", "middle",
      "```timeline", "date: 2026-08-23", "```",
    ].join("\n")
    const after = [
      "```timeline", "date: 2026-08-22", "extra", "extra", "```", "middle",
      "```timeline", "date: 2026-08-23", "```",
    ].join("\n")

    expect(timelineFenceOrdinal(before, 4)).toBe(1)
    expect(timelineFenceOrdinal(after, 6)).toBe(1)
  })

  it("recognizes timeline fences inside callouts without counting other code", () => {
    const content = [
      "> ```timeline", "> date: 2026-08-22", "> ```",
      "```css", "x{}", "```",
      "> [!note]", "> ```timeline foo", "> date: 2026-08-23", "> ```",
    ].join("\n")

    expect(timelineFenceOrdinal(content, 0)).toBe(0)
    expect(timelineFenceOrdinal(content, 7)).toBe(1)
  })

  it("extracts the current block source by stable ordinal for undo visual sync", () => {
    const content = [
      "before",
      "> ```timeline", "> date: 2026-08-22", "> @10:00 ddl", "> ```",
      "middle",
      "```timeline", "date: 2026-08-23", "09:00-10:00 work", "```",
    ].join("\n")

    expect(timelineSourceAtOrdinal(content, 0)).toBe("date: 2026-08-22\n@10:00 ddl")
    expect(timelineSourceAtOrdinal(content, 1)).toBe("date: 2026-08-23\n09:00-10:00 work")
    expect(timelineSourceAtOrdinal(content, 2)).toBeNull()
  })

  it("locates the current fence after earlier blocks change line count", () => {
    const content = [
      "```timeline", "date: 2026-08-22", "new", "lines", "```",
      "middle",
      "> ```timeline", "> date: 2026-08-23", "> ===", "> old text", "> ```",
    ].join("\n")

    expect(timelineFenceAtOrdinal(content, 1)).toEqual({
      lineStart: 6,
      lineEnd: 10,
      source: "date: 2026-08-23\n===\nold text",
    })
  })
})
