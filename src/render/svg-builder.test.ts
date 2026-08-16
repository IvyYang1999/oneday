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
