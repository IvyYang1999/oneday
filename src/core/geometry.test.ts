import { describe, expect, it } from "vitest"
import { inlineFontSize, minutesFromY, snapMinutes, yFromMinutes, AXIS_PAD_TOP } from "./geometry"

describe("geometry", () => {
  it("round-trips y <-> minutes", () => {
    const rangeStart = 7 * 60
    const hourHeight = 48
    expect(yFromMinutes(9 * 60, rangeStart, hourHeight)).toBe(AXIS_PAD_TOP + 96)
    expect(minutesFromY(AXIS_PAD_TOP + 96, rangeStart, hourHeight)).toBe(9 * 60)
  })

  it("snaps to 15min grid", () => {
    expect(snapMinutes(9 * 60 + 7)).toBe(9 * 60)
    expect(snapMinutes(9 * 60 + 8)).toBe(9 * 60 + 15)
    expect(snapMinutes(9 * 60 + 52)).toBe(9 * 60 + 45)
    expect(snapMinutes(9 * 60 + 53)).toBe(10 * 60)
  })
})

describe("inlineFontSize (时长恒居中·自适应字号)", () => {
  it("full-size for roomy blocks", () => {
    expect(inlineFontSize(150, 144, "3.25h")).toBe(11)
  })

  it("still fits 5-char labels in 3-column width (~49px)", () => {
    expect(inlineFontSize(49, 144, "3.75h")).toBe(11)
  })

  it("shrinks for very narrow blocks", () => {
    const size = inlineFontSize(30, 144, "3.75h")
    expect(size).toBeGreaterThanOrEqual(6)
    expect(size).toBeLessThan(11)
  })

  it("returns 0 when nothing readable fits", () => {
    expect(inlineFontSize(16, 10, "3.75h")).toBe(0)
  })
})
