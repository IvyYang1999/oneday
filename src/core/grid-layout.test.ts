import { describe, expect, it } from "vitest"
import {
  clampItem, compactGrid, defaultGrid, gridRows, overlaps, parseLayoutHeader, resolveGrid, resolveOverlaps, serializeLayoutHeader,
} from "./grid-layout"

describe("parse/serialize layout header", () => {
  it("round-trips grid tokens", () => {
    const items = parseLayoutHeader("text@0,0,6,12 toolbar@6,0,6,3")
    expect(items).toEqual([
      { id: "text", x: 0, y: 0, w: 6, h: 12 },
      { id: "toolbar", x: 6, y: 0, w: 6, h: 3 },
    ])
    expect(serializeLayoutHeader(items!)).toBe("text@0,0,6,12 toolbar@6,0,6,3")
  })

  it("returns null on garbage / old column format", () => {
    expect(parseLayoutHeader("foo bar")).toBeNull()
    expect(parseLayoutHeader("text | toolbar,timeline")).toBeNull()
  })

  it("clamps out-of-grid items and dedupes", () => {
    const items = parseLayoutHeader("text@10,0,6,3 text@0,0,6,3")
    expect(items).toHaveLength(1)
    expect(items![0].x).toBe(6) // 12-6
  })
})

describe("resolveOverlaps (push down)", () => {
  it("pushes overlapping items below", () => {
    const out = resolveOverlaps([
      { id: "toolbar", x: 0, y: 0, w: 6, h: 3 },
      { id: "timeline", x: 0, y: 1, w: 6, h: 10 },
    ])
    expect(out.find((i) => i.id === "timeline")!.y).toBe(3)
  })

  it("leaves non-overlapping items alone", () => {
    const items = [
      { id: "text" as const, x: 0, y: 0, w: 6, h: 5 },
      { id: "toolbar" as const, x: 6, y: 0, w: 6, h: 3 },
    ]
    expect(resolveOverlaps(items)).toEqual(items)
  })
})

describe("resolveGrid", () => {
  it("default with text: two halves, rail stacked", () => {
    const grid = resolveGrid(null, true, undefined, 40)
    expect(grid.find((i) => i.id === "text")).toMatchObject({ x: 0, w: 6 })
    expect(grid.find((i) => i.id === "toolbar")).toMatchObject({ x: 6, y: 0 })
    expect(grid.find((i) => i.id === "timeline")).toMatchObject({ x: 6, y: 3 })
  })

  it("appends missing slots below existing content", () => {
    const grid = resolveGrid(parseLayoutHeader("timeline@0,0,12,20"), false, undefined, 40)
    const toolbar = grid.find((i) => i.id === "toolbar")!
    expect(toolbar.y).toBeGreaterThanOrEqual(20)
    expect(grid.flatMap((i) => i.id).sort()).toEqual(["dialog", "stats", "timeline", "toolbar"])
  })

  it("drops text when the block has no text section", () => {
    const grid = resolveGrid(parseLayoutHeader("text@0,0,6,10 toolbar@6,0,6,3"), false, undefined, 40)
    expect(grid.find((i) => i.id === "text")).toBeUndefined()
  })
})

describe("grid helpers", () => {
  it("overlaps / clampItem / gridRows", () => {
    expect(overlaps({ id: "text", x: 0, y: 0, w: 2, h: 2 }, { id: "stats", x: 1, y: 1, w: 2, h: 2 })).toBe(true)
    expect(clampItem({ id: "text", x: -1, y: -1, w: 99, h: 0 })).toMatchObject({ x: 0, y: 0, w: 12, h: 1 })
    expect(gridRows(defaultGrid(true, undefined, 40))).toBeGreaterThan(40)
  })
})

describe("compactGrid (重力压实)", () => {
  it("falls items up to remove top gaps", () => {
    const out = compactGrid([
      { id: "toolbar", x: 0, y: 5, w: 12, h: 2 },
      { id: "timeline", x: 0, y: 7, w: 12, h: 10 },
    ])
    expect(out.find((i) => i.id === "toolbar")!.y).toBe(0)
    expect(out.find((i) => i.id === "timeline")!.y).toBe(2)
  })

  it("anchor stays put, others compact around it", () => {
    const out = compactGrid(
      [
        { id: "toolbar", x: 0, y: 5, w: 12, h: 2 },
        { id: "timeline", x: 0, y: 0, w: 12, h: 10 },
      ],
      "toolbar"
    )
    expect(out.find((i) => i.id === "toolbar")!.y).toBe(5)
    expect(out.find((i) => i.id === "timeline")!.y).toBe(7) // 被顶到 anchor 下面
  })

  it("slides left after falling up", () => {
    const out = compactGrid([{ id: "stats", x: 6, y: 0, w: 6, h: 1 }])
    expect(out[0].x).toBe(0)
  })
})

describe("resolveGrid with hiddenSlots", () => {
  it("drops hidden slots and does not re-append them", () => {
    const grid = resolveGrid(null, false, undefined, 40, ["stats", "dialog"])
    const ids = grid.map((i) => i.id)
    expect(ids).toContain("toolbar")
    expect(ids).toContain("timeline")
    expect(ids).not.toContain("stats")
    expect(ids).not.toContain("dialog")
  })
})
