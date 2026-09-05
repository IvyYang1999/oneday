import { describe, expect, it } from "vitest"
import { migrateCategoryPalettes } from "./category-palettes"

describe("category palette migration", () => {
  it("moves the old shared palette into spans and leaves markers independent", () => {
    expect(migrateCategoryPalettes({ typeColors: { develop: "#55b8d8" }, retiredTypeColors: { old: "#999999" } })).toEqual({
      spanTypeColors: { develop: "#55b8d8" }, markerTypeColors: {},
      spanRetiredTypeColors: { old: "#999999" }, markerRetiredTypeColors: { old: "#999999", develop: "#55b8d8" },
    })
  })

  it("keeps explicit palettes without resurrecting legacy values", () => {
    expect(migrateCategoryPalettes({
      typeColors: { legacy: "#111111" }, spanTypeColors: { focus: "#222222" },
      markerTypeColors: { deadline: "#e33e3e" }, spanRetiredTypeColors: { oldSpan: "#333333" },
      markerRetiredTypeColors: { oldPoint: "#444444" },
    })).toEqual({
      spanTypeColors: { focus: "#222222" }, markerTypeColors: { deadline: "#e33e3e" },
      spanRetiredTypeColors: { oldSpan: "#333333" }, markerRetiredTypeColors: { oldPoint: "#444444" },
    })
  })
})
