import { describe, expect, it } from "vitest"
import { formatClockPlain, formatEntryLine, weekdayZh } from "./format"

describe("formatEntryLine", () => {
  it("formats plain and plan lines", () => {
    expect(formatEntryLine({ plan: false, startMin: 555, endMin: 735, type: "math", note: "行列式" }))
      .toBe("09:15-12:15 math 行列式")
    expect(formatEntryLine({ plan: true, startMin: 480, endMin: 570, type: "math" }))
      .toBe("plan 08:00-09:30 math")
  })

  it("wraps >24h back to plain clock (D10)", () => {
    expect(formatClockPlain(25 * 60 + 30)).toBe("01:30")
    expect(formatEntryLine({ plan: false, startMin: 23 * 60 + 30, endMin: 24 * 60 + 30, type: "reading" }))
      .toBe("23:30-00:30 reading")
  })
})

describe("weekdayZh", () => {
  it("returns the Chinese weekday", () => {
    expect(weekdayZh("2026-08-18")).toBe("周二")
    expect(weekdayZh("2026-08-17")).toBe("周一")
  })
  it("empty on invalid input", () => {
    expect(weekdayZh("8.18")).toBe("")
  })
})
