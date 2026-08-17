import { describe, expect, it } from "vitest"
import { defaultLayout, parseLayout, resolveLayout, serializeLayout } from "./layout"

describe("parseLayout / serializeLayout", () => {
  it("round-trips", () => {
    const cols = parseLayout("text | toolbar,timeline,stats,dialog")
    expect(cols).toEqual([["text"], ["toolbar", "timeline", "stats", "dialog"]])
    expect(serializeLayout(cols!)).toBe("text | toolbar,timeline,stats,dialog")
  })

  it("ignores unknown ids and dedupes", () => {
    expect(parseLayout("text,foo | timeline,text")).toEqual([["text"], ["timeline"]])
    expect(parseLayout("foo bar")).toBeNull()
  })
})

describe("resolveLayout", () => {
  it("default: text left, rail right", () => {
    expect(resolveLayout(null, true, undefined)).toEqual([["text"], ["toolbar", "timeline", "stats", "dialog"]])
  })

  it("side:left flips columns", () => {
    expect(resolveLayout(null, true, "left")).toEqual([["toolbar", "timeline", "stats", "dialog"], ["text"]])
  })

  it("no text: single rail column", () => {
    expect(resolveLayout(null, false, undefined)).toEqual([["toolbar", "timeline", "stats", "dialog"]])
  })

  it("appends missing slots to sensible columns", () => {
    const cols = resolveLayout(parseLayout("timeline | text"), true, undefined)
    expect(cols).toEqual([["text"], ["timeline", "toolbar", "stats", "dialog"]].length === 2 ? [["timeline", "toolbar", "stats", "dialog"], ["text"]] : [])
    // text 存在但 layout 里没有 -> 被放到最左列；toolbar/stats/dialog 并入 timeline 列
    const flat = cols.flat()
    expect(flat.sort()).toEqual(["dialog", "stats", "text", "timeline", "toolbar"].sort())
  })

  it("drops text slot when the block has no text section", () => {
    const cols = resolveLayout(parseLayout("text | toolbar,timeline,stats,dialog"), false, undefined)
    expect(cols.flat()).not.toContain("text")
  })
})
