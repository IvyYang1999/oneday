import { describe, expect, it } from "vitest"
import { parseColor, readableTextColor } from "./contrast"

describe("contrast", () => {
  it("parses hex and hsl", () => {
    expect(parseColor("#ff0000")).toEqual([1, 0, 0])
    expect(parseColor("hsl(120 50% 50%)")).toEqual([0.25, 0.75, 0.25])
  })
  it("dark bg -> white text, light bg -> dark text", () => {
    expect(readableTextColor("#1a1a1a")).toBe("#ffffff")
    expect(readableTextColor("#7fd4c1")).toBe("#1a1a1a")
    expect(readableTextColor("#b91c1c")).toBe("#ffffff") // 深红
  })
})
