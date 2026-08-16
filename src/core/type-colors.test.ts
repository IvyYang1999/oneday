import { describe, expect, it } from "vitest"
import { parseTypeColors, serializeTypeColors, DEFAULT_TYPE_COLORS } from "./type-colors"

describe("parseTypeColors", () => {
  it("parses type: color lines, skips blanks and // comments", () => {
    const map = parseTypeColors("math: #7fd4c1\n\n// 注释\nmicro = #9bd17b\n")
    expect(map).toEqual({ math: "#7fd4c1", micro: "#9bd17b" })
  })

  it("round-trips through serializeTypeColors", () => {
    expect(parseTypeColors(serializeTypeColors(DEFAULT_TYPE_COLORS))).toEqual(DEFAULT_TYPE_COLORS)
  })
})
