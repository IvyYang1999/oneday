import { describe, expect, it } from "vitest"
import { deleteEntryLine, insertEntryLine, replaceEntryLine } from "./source-rewriter"
import { parseTimeline } from "../core/parser"

describe("insertEntryLine", () => {
  it("inserts in time order between existing entries", () => {
    const src = "date: 2026-08-18\n---\n09:00-10:00 math\n13:00-14:00 micro"
    const out = insertEntryLine(src, "11:00-12:00 english 听力", 11 * 60)
    expect(out).toBe("date: 2026-08-18\n---\n09:00-10:00 math\n11:00-12:00 english 听力\n13:00-14:00 micro")
  })

  it("inserts before the first entry when earliest", () => {
    const src = "13:00-14:00 micro"
    const out = insertEntryLine(src, "09:00-10:00 math", 9 * 60)
    expect(out).toBe("09:00-10:00 math\n13:00-14:00 micro")
  })

  it("appends after the last entry, before trailing blank lines", () => {
    const src = "09:00-10:00 math\n\n"
    const out = insertEntryLine(src, "21:00-21:30 fitness", 21 * 60)
    expect(out).toBe("09:00-10:00 math\n21:00-21:30 fitness\n\n")
  })

  it("lands before trailing @annotations when later than all entries", () => {
    const src = "09:00-10:00 math\n@09:30 状态好"
    const out = insertEntryLine(src, "21:00-21:30 fitness", 21 * 60)
    // entries stay grouped; annotation line untouched
    const doc = parseTimeline(out)
    expect(doc.errors).toEqual([])
    expect(doc.entries.map((e) => e.type)).toEqual(["math", "fitness"])
  })

  it("result always re-parses cleanly", () => {
    const src = "range: 7-23\n---\nplan 08:00-12:00 math\n09:00-10:00 math\n"
    const out = insertEntryLine(src, "10:30-11:00 meal", 10 * 60 + 30)
    const doc = parseTimeline(out)
    expect(doc.errors).toEqual([])
    expect(doc.entries).toHaveLength(3)
  })
})

describe("replaceEntryLine / deleteEntryLine", () => {
  const src = "date: 2026-08-18\n---\n09:00-10:00 math\n13:00-14:00 micro"

  it("replaces a line in place", () => {
    const out = replaceEntryLine(src, 2, "09:00-10:30 math 行列式")
    expect(out.split("\n")[2]).toBe("09:00-10:30 math 行列式")
    expect(parseTimeline(out).errors).toEqual([])
  })

  it("deletes a line", () => {
    const out = deleteEntryLine(src, 3)
    expect(out).toBe("date: 2026-08-18\n---\n09:00-10:00 math")
  })

  it("throws on out-of-range line", () => {
    expect(() => deleteEntryLine(src, 99)).toThrow()
  })
})
