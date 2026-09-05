import { describe, expect, it } from "vitest"
import { parseTimeline } from "../core/parser"
import { sourceDraftCanApply, sourceDraftMatchesLive } from "./source-mode"

describe("block source mode contracts", () => {
  it("accepts a valid editable block body and rejects parser errors", () => {
    expect(sourceDraftCanApply("date: 2026-08-24\n---\n09:00-10:00 develop", parseTimeline)).toEqual([])
    expect(sourceDraftCanApply("date: 2026/08/24\n---\n09:00-10:00 develop", parseTimeline))
      .toMatchObject([{ line: 0 }])
  })

  it("fails closed when the live Markdown changed after source mode opened", () => {
    const opened = "09:00-10:00 develop"
    expect(sourceDraftMatchesLive(opened, opened)).toBe(true)
    expect(sourceDraftMatchesLive(opened, `${opened}\n10:00-10:30 reading`)).toBe(false)
  })
})
