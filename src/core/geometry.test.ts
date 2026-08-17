import { describe, expect, it } from "vitest"
import { minutesFromY, snapMinutes, yFromMinutes, AXIS_PAD_TOP } from "./geometry"

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
