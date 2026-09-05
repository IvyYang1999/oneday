import { describe, expect, it } from "vitest"
import { applyDailyQuoteAppearanceToCurrentAndFuture, applyDailyQuoteTheme, dailyQuoteForDate, nextDailyQuote, normalizeDailyQuoteAppearance, resolveDailyQuote } from "./daily-quotes"

const quotes = [
  { id: "a", text: "A", author: "", order: 0 },
  { id: "b", text: "B", author: "", order: 1 },
]

describe("daily quotes", () => {
  it("selects the same quote for the same date", () => {
    expect(dailyQuoteForDate(quotes, "2026-08-29")?.id).toBe(dailyQuoteForDate(quotes, "2026-08-29")?.id)
  })
  it("cycles and wraps", () => {
    expect(nextDailyQuote(quotes, "a")?.id).toBe("b")
    expect(nextDailyQuote(quotes, "b")?.id).toBe("a")
  })
  it("keeps a block snapshot when its global quote was removed", () => {
    expect(resolveDailyQuote([], "2026-08-29", { quoteId: "old", text: "still visible", author: "me", appearance: {} })?.text).toBe("still visible")
  })
  it("clamps unsafe appearance values", () => {
    const value = normalizeDailyQuoteAppearance({
      fontSize: 200,
      overlay: 2,
      backgroundColor: "url(javascript:bad)",
      imageFocalX: -1,
      imageFocalY: 2,
      imageZoom: 9,
    })
    expect(value.fontSize).toBe(48)
    expect(value.overlay).toBe(.8)
    expect(value.backgroundColor).toBe("")
    expect(value.imageFocalX).toBe(0)
    expect(value.imageFocalY).toBe(1)
    expect(value.imageZoom).toBe(3)
  })
  it("applies a preset without dropping the selected background image or crop", () => {
    expect(applyDailyQuoteTheme("photo", {
      backgroundImage: "assets/a.jpg",
      imageFocalX: .2,
      imageFocalY: .8,
      imageZoom: 1.75,
    })).toMatchObject({ backgroundImage: "assets/a.jpg", imageFocalX: .2, imageFocalY: .8, imageZoom: 1.75 })
  })

  it("uses an edited card appearance for both the current Block and future cards", async () => {
    const settings = { dailyQuoteDefaults: applyDailyQuoteTheme("timeline") }
    const calls: string[] = []
    let current = settings.dailyQuoteDefaults
    await applyDailyQuoteAppearanceToCurrentAndFuture(
      settings,
      { ...applyDailyQuoteTheme("paper"), fontSize: 31 },
      (appearance) => { calls.push("current"); current = appearance },
      () => { calls.push("defaults") }
    )
    expect(calls).toEqual(["current", "defaults"])
    expect(current).toMatchObject({ theme: "paper", fontSize: 31 })
    expect(settings.dailyQuoteDefaults).toMatchObject({ theme: "paper", fontSize: 31 })
  })

  it("does not leave an unsaved future-card default in memory", async () => {
    const previous = applyDailyQuoteTheme("timeline")
    const settings = { dailyQuoteDefaults: previous }
    await expect(applyDailyQuoteAppearanceToCurrentAndFuture(
      settings,
      applyDailyQuoteTheme("paper"),
      () => undefined,
      () => { throw new Error("save failed") }
    )).rejects.toThrow("save failed")
    expect(settings.dailyQuoteDefaults).toBe(previous)
  })
})
