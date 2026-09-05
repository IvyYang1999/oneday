import { describe, expect, it } from "vitest"
import { clockDayOffset, durationInputMinutes, durationInputValue, durationMinutes, formatClock, formatClock24, formatHours, preferredDurationUnit } from "./duration"

describe("duration", () => {
  it("computes minutes", () => {
    expect(durationMinutes(555, 735)).toBe(180)
  })

  it("formats like the paper convention", () => {
    expect(formatHours(180)).toBe("3h")
    expect(formatHours(195)).toBe("3.25h")
    expect(formatHours(45)).toBe("0.75h")
    expect(formatHours(210)).toBe("3.5h")
  })

  it("formats clock, including >24h (D10)", () => {
    expect(formatClock(555)).toBe("09:15")
    expect(formatClock(25 * 60 + 30)).toBe("25:30")
    expect(formatClock24(25 * 60 + 30)).toBe("01:30")
    expect(clockDayOffset(25 * 60 + 30)).toBe(1)
  })

  it("converts minute/hour duration controls through canonical minutes", () => {
    expect(preferredDurationUnit(30)).toBe("minutes")
    expect(preferredDurationUnit(60)).toBe("hours")
    expect(durationInputValue(30, "hours")).toBe("0.5")
    expect(durationInputValue(275, "hours")).toBe("4.58")
    expect(durationInputMinutes("0.5", "hours")).toBe(30)
    expect(durationInputMinutes("0.02", "hours")).toBe(1)
    expect(durationInputMinutes("0.001", "hours")).toBe(1)
    expect(durationInputMinutes("30", "minutes")).toBe(30)
  })
})
