import { describe, expect, it } from "vitest"
import { buildSystemPrompt } from "./prompt"
import { parseTimeline } from "../core/parser"

describe("buildSystemPrompt", () => {
  it("includes grammar, types, current time and existing entries", () => {
    const doc = parseTimeline("09:00-10:00 math 行列式")
    const p = buildSystemPrompt({
      typeColors: { math: "#7fd4c1", fitness: "#f6c667" },
      now: new Date(2026, 7, 18, 21, 35),
      doc,
    })
    expect(p).toContain("21:35")
    expect(p).toContain("math, fitness")
    expect(p).toContain("09:00-10:00 math 行列式")
    expect(p).toContain("可与之并列重叠")
    expect(p).toContain("HH:MM-HH:MM")
  })

  it("notes when the day is still empty", () => {
    const p = buildSystemPrompt({ typeColors: { misc: "#ccc" }, now: new Date(), doc: parseTimeline("") })
    expect(p).toContain("还没有实际色块")
  })
})

describe("起床语义 + 时间轴起点", () => {
  it("system prompt carries the range start and the 起床 rule", () => {
    const doc = parseTimeline("range: 7-23\n---\n")
    const p = buildSystemPrompt({ typeColors: { sleep: "#ccc" }, now: new Date(), doc })
    expect(p).toContain("07:00")
    expect(p).toContain("起床")
    expect(p).toContain("多轮")
  })
})

describe("醒来句式（yyt 2026-08-19）", () => {
  it("prompt covers 醒来 phrasing + fullwidth colon rule", () => {
    const p = buildSystemPrompt({ typeColors: { sleep: "#ccc" }, now: new Date(), doc: parseTimeline("") })
    expect(p).toContain("醒来")
    expect(p).toContain("全角")
  })
})

describe("few-shot（yyt 2026-08-19）", () => {
  it("prompt carries the 醒来 compound example + array guidance", () => {
    const p = buildSystemPrompt({ typeColors: { sleep: "#ccc" }, now: new Date(2026, 7, 19, 10, 0), doc: parseTimeline("") })
    expect(p).toContain("9：15醒来，然后浪费了35分钟刷手机")
    expect(p).toContain("JSON 数组")
    expect(p).toContain("21:05")
  })
})
