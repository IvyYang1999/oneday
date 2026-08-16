import { describe, expect, it } from "vitest"
import { durationMinutes, formatClock, formatHours } from "./duration"

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
  })
})
