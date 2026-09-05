import { describe, expect, it } from "vitest"
import { formatClockPlain, formatEntryLine, formatMarkerLine, weekdayZh } from "./format"

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

describe("formatMarkerLine", () => {
  it("writes actual and plan markers with an explicit category", () => {
    expect(formatMarkerLine({ plan: false, timeMin: 10 * 60, type: "起床", text: "正式起床" }))
      .toBe("@10:00 [起床] 正式起床")
    expect(formatMarkerLine({ plan: true, timeMin: 22 * 60, type: "论文", text: "ddl" }))
      .toBe("plan @22:00 [论文] ddl")
  })

  it("wraps after-midnight marker times back to a plain clock", () => {
    expect(formatMarkerLine({ plan: false, timeMin: 25 * 60 + 5, type: "睡眠" }))
      .toBe("@01:05 [睡眠]")
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
