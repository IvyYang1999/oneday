import { afterEach, describe, expect, it } from "vitest"
import { configureI18n } from "../i18n"
import { formatTimelineDisplayRange, formatTimelineDisplayTime } from "./hover-info"

afterEach(() => configureI18n(() => "zh"))

describe("timeline clock presentation", () => {
  it("keeps monotonic after-midnight coordinates out of user-facing labels", () => {
    expect(formatTimelineDisplayTime(26 * 60 + 30)).toBe("次日 02:30")
    expect(formatTimelineDisplayRange(26 * 60 + 30, 27 * 60 + 15)).toBe("次日 02:30 – 03:15")
    expect(formatTimelineDisplayRange(23 * 60 + 30, 24 * 60 + 15)).toBe("23:30 – 次日 00:15")
  })

  it("uses the current Obsidian locale", () => {
    configureI18n(() => "en")
    expect(formatTimelineDisplayRange(26 * 60 + 30, 27 * 60 + 15)).toBe("Next day 02:30 – 03:15")
  })
})
