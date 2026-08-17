import { describe, expect, it } from "vitest"
import { parseTimeline } from "../core/parser"
import { renderTimelineSvg, FALLBACK_COLOR } from "./svg-builder"

const COLORS = { math: "#7fd4c1", sleep: "#e0e0e0" }

function svgOf(source: string, colors = COLORS): string {
  return renderTimelineSvg(parseTimeline(source), { typeColors: colors })
}

describe("renderTimelineSvg", () => {
  it("renders a block at the right y/height with color and centered duration", () => {
    // range default 7-23, hourHeight 48: 09:00 -> y = 8 + 2*48 = 104; 3h -> 144px
    const svg = svgOf("09:00-12:00 math")
    expect(svg).toContain(`fill="#7fd4c1"`)
    expect(svg).toContain(`y="104"`)
    expect(svg).toContain(`height="144"`)
    expect(svg).toContain(`>3h</text>`)
  })

  it("renders plan blocks translucent, underneath actual blocks", () => {
    const svg = svgOf("plan 08:00-10:00 math\n09:00-10:00 math")
    const planIdx = svg.indexOf("oneday-plan")
    const actualIdx = svg.indexOf('fill-opacity="0.85"')
    expect(svg).toContain('fill-opacity="0.22"')
    expect(planIdx).toBeGreaterThan(-1)
    expect(planIdx).toBeLessThan(actualIdx) // plan drawn first = behind
  })

  it("moves the duration label to the right for thin blocks (D6)", () => {
    const svg = svgOf("17:00-17:30 math") // 30min -> 24px < 30
    expect(svg).toContain("oneday-duration oneday-thin")
    expect(svg).toContain(">0.5h</text>")
  })

  it("shows the note inside tall blocks", () => {
    const svg = svgOf("09:00-12:00 math 李林线代")
    expect(svg).toContain("oneday-note")
    expect(svg).toContain("李林线代")
  })

  it("renders annotations with leader line (D5)", () => {
    const svg = svgOf("@21:40 头晕")
    expect(svg).toContain("oneday-anno-line")
    expect(svg).toContain(">头晕</text>")
  })

  it("extends the axis past 23 for after-midnight entries (D10)", () => {
    const svg = svgOf("00:30-01:30 sleep")
    expect(svg).toContain(">24</text>")
    expect(svg).toContain(">25</text>")
  })

  it("falls back to gray for unknown types", () => {
    const svg = svgOf("09:00-10:00 whatever")
    expect(svg).toContain(`fill="${FALLBACK_COLOR}"`)
  })

  it("escapes XML in notes and annotations", () => {
    const svg = svgOf("09:00-10:00 math a<b>&\"c\"")
    expect(svg).not.toContain("a<b>")
    expect(svg).toContain("a&lt;b&gt;")
  })
})

describe("parallel events (并列日程, yyt 2026-08-17)", () => {
  it("splits overlapping blocks into side-by-side columns", () => {
    const svg = svgOf("09:00-11:00 math\n09:30-10:30 micro 听课")
    const rects = [...svg.matchAll(/<rect class="oneday-block"[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/g)]
    expect(rects).toHaveLength(2)
    const [x1, w1] = [Number(rects[0][1]), Number(rects[0][2])]
    const [x2, w2] = [Number(rects[1][1]), Number(rects[1][2])]
    expect(x1).not.toBe(x2) // two columns
    expect(w1).toBeCloseTo(w2, 5)
    expect(w1).toBeLessThan(100) // each narrower than the full track
  })

  it("non-overlapping blocks keep full width", () => {
    const svg = svgOf("09:00-10:00 math\n10:00-11:00 micro")
    const rects = [...svg.matchAll(/<rect class="oneday-block"[^>]*width="([\d.]+)"/g)]
    expect(Number(rects[0][1])).toBeCloseTo(Number(rects[1][1]), 5)
  })

  it("reuses a column after a gap inside the same cluster", () => {
    // A 09-12, B 09:30-10, C 10-12 -> B and C share col 1, total 2 cols
    const svg = svgOf("09:00-12:00 math\n09:30-10:00 micro\n10:00-12:00 english")
    const widths = [...svg.matchAll(/<rect class="oneday-block"[^>]*width="([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(widths.every((w) => Math.abs(w - widths[0]) < 1e-6)).toBe(true)
  })
})

describe("note visibility (yyt 2026-08-17: 备注必须看得见)", () => {
  it("shows the note on the right side when it does not fit inside", () => {
    const svg = svgOf("17:00-17:30 meal 晚饭吃太多")
    expect(svg).toContain("0.5h · 晚饭吃太多")
  })

  it("narrow columns push duration+note to the right side", () => {
    // 3 overlapping -> columns ~49px wide < 56 -> side label
    const svg = svgOf("09:00-12:00 math\n09:30-11:00 micro\n09:45-10:45 english 背单词打卡")
    expect(svg).toContain("1h · 背单词打卡")
  })

  it("truncates long side notes", () => {
    const svg = svgOf("17:00-17:30 meal 这是一段特别特别特别长的备注文字内容")
    expect(svg).toContain("…")
  })
})
