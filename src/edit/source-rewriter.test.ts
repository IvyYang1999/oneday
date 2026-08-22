import { describe, expect, it } from "vitest"
import { addHiddenType, deleteEntryLine, extractBlockSourceFromContent, insertEntryLine, removeHeaderValue, removeHiddenType, removeTextSection, replaceBlockInContent, replaceEntryLine, setHeaderValue, setTextSection } from "./source-rewriter"
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

describe("addHiddenType / removeHiddenType", () => {
  it("adds a hide header when none exists", () => {
    const out = addHiddenType("09:00-10:00 math", "sleep")
    expect(out).toBe("hide: sleep\n09:00-10:00 math")
    expect(parseTimeline(out).hiddenTypes).toEqual(["sleep"])
  })

  it("appends to an existing hide header, idempotently", () => {
    const src = "hide: sleep\n---\n09:00-10:00 math"
    expect(addHiddenType(src, "misc")).toBe("hide: sleep misc\n---\n09:00-10:00 math")
    expect(addHiddenType(src, "sleep")).toBe(src)
  })

  it("removes types and drops the header when empty", () => {
    const src = "hide: sleep misc\n09:00-10:00 math"
    expect(removeHiddenType(src, "misc")).toBe("hide: sleep\n09:00-10:00 math")
    expect(removeHiddenType("hide: sleep\n09:00-10:00 math", "sleep")).toBe("09:00-10:00 math")
  })

  it("remove is a no-op without a hide header", () => {
    expect(removeHiddenType("09:00-10:00 math", "sleep")).toBe("09:00-10:00 math")
  })
})

describe("setHeaderValue / removeHeaderValue", () => {
  it("inserts before --- when header zone exists", () => {
    expect(setHeaderValue("date: 2026-08-18\n---\n09:00-10:00 math", "width", "300"))
      .toBe("date: 2026-08-18\nwidth: 300\n---\n09:00-10:00 math")
  })

  it("inserts at top without separator", () => {
    expect(setHeaderValue("09:00-10:00 math", "float", "right")).toBe("float: right\n09:00-10:00 math")
  })

  it("updates in place", () => {
    expect(setHeaderValue("width: 200\n---\n09:00-10:00 math", "width", "300")).toBe("width: 300\n---\n09:00-10:00 math")
  })

  it("removeHeaderValue drops the line, no-op when absent", () => {
    expect(removeHeaderValue("float: right\n09:00-10:00 math", "float")).toBe("09:00-10:00 math")
    expect(removeHeaderValue("09:00-10:00 math", "float")).toBe("09:00-10:00 math")
  })

  it("set then parse round-trips", () => {
    const doc = parseTimeline(setHeaderValue("09:00-10:00 math", "width", "300"))
    expect(doc.width).toBe(300)
    expect(doc.errors).toEqual([])
  })
})

describe("replaceBlockInContent (callout 前缀保留)", () => {
  it("preserves > prefix when the block lives inside a callout", () => {
    const content = [
      "# 日记",
      "> [!timeline|right]",
      "> ```timeline",
      "> 09:00-10:00 math",
      "> ```",
      "正文后续",
    ].join("\n")
    const out = replaceBlockInContent(content, { lineStart: 2, lineEnd: 4 }, "09:00-10:00 math\n11:00-12:00 micro")
    expect(out).toBe([
      "# 日记",
      "> [!timeline|right]",
      "> ```timeline",
      "> 09:00-10:00 math",
      "> 11:00-12:00 micro",
      "> ```",
      "正文后续",
    ].join("\n"))
  })

  it("works prefix-free outside callouts", () => {
    const content = "```timeline\n09:00-10:00 math\n```"
    const out = replaceBlockInContent(content, { lineStart: 0, lineEnd: 2 }, "10:00-11:00 math")
    expect(out).toBe("```timeline\n10:00-11:00 math\n```")
  })
})

describe("extractBlockSourceFromContent (从最新笔记读取)", () => {
  it("extracts a nested-callout body including quoted blank lines", () => {
    const content = [
      "> > ```timeline",
      "> > date: 2026-08-21",
      "> > ---",
      "> >",
      "> > ===",
      "> > 第五句",
      "> > ```",
    ].join("\n")
    expect(extractBlockSourceFromContent(content, { lineStart: 0, lineEnd: 6 }))
      .toBe("date: 2026-08-21\n---\n\n===\n第五句")
  })

  it("keeps a just-saved fifth sentence across a following transform", () => {
    let content = "```timeline\n09:00-10:00 math\n===\n第一句。\n第二句。\n第三句。\n第四句。\n```"
    const firstSection = { lineStart: 0, lineEnd: 7 }
    const liveBeforeTextSave = extractBlockSourceFromContent(content, firstSection)
    expect(liveBeforeTextSave).not.toBeNull()
    content = replaceBlockInContent(
      content,
      firstSection,
      setTextSection(liveBeforeTextSave!, "第一句。\n第二句。\n第三句。\n第四句。\n第五句。")
    )

    const secondSection = { lineStart: 0, lineEnd: 8 }
    const liveBeforeLayoutSave = extractBlockSourceFromContent(content, secondSection)
    expect(liveBeforeLayoutSave).not.toBeNull()
    content = replaceBlockInContent(content, secondSection, setHeaderValue(liveBeforeLayoutSave!, "width", "300"))

    expect(content).toContain("第五句。")
    expect(content).toContain("width: 300")
  })
})

describe("setTextSection", () => {
  it("appends a text section", () => {
    expect(setTextSection("09:00-10:00 math", "## to do"))
      .toBe("09:00-10:00 math\n===\n## to do")
  })

  it("replaces an existing text section", () => {
    expect(setTextSection("09:00-10:00 math\n===\nold text\nmore", "new"))
      .toBe("09:00-10:00 math\n===\nnew")
  })

  it("empty text keeps the section placeholder (yyt: 空保存不该把文字区弄没)", () => {
    expect(setTextSection("09:00-10:00 math\n===\nold", "  ")).toBe("09:00-10:00 math\n===")
  })

  it("round-trips through the parser", () => {
    const doc = parseTimeline(setTextSection("09:00-10:00 math", "1. 任务"))
    expect(doc.text).toBe("1. 任务")
    expect(doc.errors).toEqual([])
  })
})

describe("insertEntryLine with text section (=== 边界)", () => {
  it("inserts before the === text section, not into it", () => {
    const src = "date: 2026-08-17\n---\n===\n## 明日 to do\n1. 线代"
    const out = insertEntryLine(src, "09:00-11:00 math", 9 * 60)
    expect(out).toBe("date: 2026-08-17\n---\n09:00-11:00 math\n===\n## 明日 to do\n1. 线代")
    const doc = parseTimeline(out)
    expect(doc.entries).toHaveLength(1)
    expect(doc.text).toBe("## 明日 to do\n1. 线代")
  })

  it("respects the boundary even when entries exist", () => {
    const src = "09:00-10:00 math\n===\n文字"
    const out = insertEntryLine(src, "21:00-21:30 fitness", 21 * 60)
    expect(out).toBe("09:00-10:00 math\n21:00-21:30 fitness\n===\n文字")
  })
})

describe("setTextSection / removeTextSection (多文本框)", () => {
  const src = "09:00-10:00 math\n===\n上午\n===\n下午"

  it("replaces the Nth section", () => {
    expect(setTextSection(src, "上午改", 0)).toBe("09:00-10:00 math\n===\n上午改\n===\n下午")
    expect(setTextSection(src, "下午改", 1)).toBe("09:00-10:00 math\n===\n上午\n===\n下午改")
  })

  it("appends a new section when index >= count", () => {
    expect(setTextSection(src, "", 2)).toBe("09:00-10:00 math\n===\n上午\n===\n下午\n===")
  })

  it("removeTextSection removes only that segment", () => {
    expect(removeTextSection(src, 0)).toBe("09:00-10:00 math\n===\n下午")
    expect(parseTimeline(removeTextSection(src, 0)).texts).toEqual(["下午"])
  })
})
