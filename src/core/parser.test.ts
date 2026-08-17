import { describe, expect, it } from "vitest"
import { parseTimeline } from "./parser"

describe("parseTimeline", () => {
  it("parses a full sample with header, entries, plan and annotation", () => {
    const doc = parseTimeline([
      "date: 2026-08-18",
      "range: 7-23",
      "---",
      "plan 08:00-09:30 math 线代第一章",
      "09:15-12:15 math 李林线代第一章·行列式",
      "12:15-13:30 sleep 午休",
      "@21:40 头晕，脑力低",
    ].join("\n"))

    expect(doc.errors).toEqual([])
    expect(doc.date).toBe("2026-08-18")
    expect(doc.rangeStart).toBe(7 * 60)
    expect(doc.entries).toHaveLength(3)
    expect(doc.entries[0]).toMatchObject({ plan: true, startMin: 480, endMin: 570, type: "math", note: "线代第一章" })
    expect(doc.entries[1]).toMatchObject({ plan: false, startMin: 555, endMin: 735, note: "李林线代第一章·行列式" })
    expect(doc.entries[2]).toMatchObject({ type: "sleep" })
    expect(doc.annotations).toEqual([{ timeMin: 21 * 60 + 40, text: "头晕，脑力低", line: 6 }])
  })

  it("works without header and separator", () => {
    const doc = parseTimeline("09:00-10:00 math")
    expect(doc.entries).toHaveLength(1)
    expect(doc.rangeStart).toBe(7 * 60)
    expect(doc.rangeEnd).toBe(23 * 60)
  })

  it("ignores blank lines and # comments", () => {
    const doc = parseTimeline("\n# comment\n09:00-10:00 math\n\n")
    expect(doc.errors).toEqual([])
    expect(doc.entries).toHaveLength(1)
  })

  it("rejects bad date and unknown header keys", () => {
    const doc = parseTimeline("date: 8.18\nfoo: bar\n---\n09:00-10:00 math")
    expect(doc.errors).toHaveLength(2)
    expect(doc.errors[0].reason).toContain("YYYY-MM-DD")
    expect(doc.errors[1].reason).toContain("unknown header key")
  })

  it("rejects invalid times and unrecognized lines", () => {
    const doc = parseTimeline("---\n09:75-10:00 math\nhello world")
    expect(doc.errors.map((e) => e.reason)).toEqual(["invalid time", "unrecognized line"])
  })

  it("accepts dashed variants as separator between times", () => {
    const doc = parseTimeline("09:00–10:00 math\n10:00—11:00 micro")
    expect(doc.entries).toHaveLength(2)
  })

  describe("cross-midnight (D10: 过零点算当日，轴自然延伸)", () => {
    it("shifts entries starting before rangeStart to +24h and extends the axis", () => {
      const doc = parseTimeline("range: 7-23\n---\n00:30-01:30 sleep")
      expect(doc.entries[0]).toMatchObject({ startMin: 24 * 60 + 30, endMin: 25 * 60 + 30 })
      expect(doc.rangeEnd).toBe(25 * 60 + 30)
    })

    it("wraps end past midnight when end <= start", () => {
      const doc = parseTimeline("22:00-01:00 reading")
      expect(doc.entries[0]).toMatchObject({ startMin: 22 * 60, endMin: 25 * 60 })
    })

    it("shifts early-morning annotations to +24h", () => {
      const doc = parseTimeline("@01:10 睡不着")
      expect(doc.annotations[0].timeMin).toBe(25 * 60 + 10)
    })

    it("accepts explicit hours > 24 in source", () => {
      const doc = parseTimeline("24:30-25:30 sleep")
      expect(doc.entries[0]).toMatchObject({ startMin: 24 * 60 + 30, endMin: 25 * 60 + 30 })
    })
  })

  it("allows overlapping actual entries (并列日程并排渲染, yyt 2026-08-17)", () => {
    const doc = parseTimeline([
      "plan 08:00-12:00 math",
      "09:00-10:00 math",
      "09:30-11:00 micro",
    ].join("\n"))
    expect(doc.errors).toEqual([])
    expect(doc.entries).toHaveLength(3)
  })
})

describe("hide header (per-block highlighter hiding)", () => {
  it("parses hide: types", () => {
    const doc = parseTimeline("hide: sleep misc\n---\n09:00-10:00 math")
    expect(doc.hiddenTypes).toEqual(["sleep", "misc"])
    expect(doc.errors).toEqual([])
  })

  it("accepts commas and works without separator", () => {
    const doc = parseTimeline("hide: sleep, misc\n09:00-10:00 math")
    expect(doc.hiddenTypes).toEqual(["sleep", "misc"])
  })

  it("rejects hide without valid types", () => {
    const doc = parseTimeline("hide: !!!\n---\n09:00-10:00 math")
    expect(doc.errors).toHaveLength(1)
  })
})

describe("width/float headers (分栏)", () => {
  it("parses width and float", () => {
    const doc = parseTimeline("width: 300\nfloat: right\n---\n09:00-10:00 math")
    expect(doc.width).toBe(300)
    expect(doc.floatRight).toBe(true)
    expect(doc.errors).toEqual([])
  })

  it("rejects bad width", () => {
    const doc = parseTimeline("width: 50\n---\n09:00-10:00 math")
    expect(doc.errors).toHaveLength(1)
  })
})

describe("text section (=== 块内图文混排)", () => {
  it("collects everything after === as free text", () => {
    const doc = parseTimeline("09:00-10:00 math\n===\n## 明日 to do\n1. 线代第一章")
    expect(doc.text).toBe("## 明日 to do\n1. 线代第一章")
    expect(doc.entries).toHaveLength(1)
    expect(doc.errors).toEqual([])
  })

  it("text section may contain entry-looking lines without being parsed", () => {
    const doc = parseTimeline("09:00-10:00 math\n===\n12:00-13:00 这行是普通文字")
    expect(doc.entries).toHaveLength(1)
    expect(doc.text).toBe("12:00-13:00 这行是普通文字")
  })

  it("no text section by default", () => {
    expect(parseTimeline("09:00-10:00 math").text).toBeUndefined()
  })
})
