import { describe, expect, it } from "vitest"
import { decideTimelineOnboarding, resolveTimelineOnboardingSeen } from "./onboarding"

describe("resolveTimelineOnboardingSeen", () => {
  it("shows onboarding for a genuinely new installation", () => {
    expect(resolveTimelineOnboardingSeen(undefined, false)).toBe(false)
  })

  it("does not re-onboard an existing installation during upgrade", () => {
    expect(resolveTimelineOnboardingSeen(undefined, true)).toBe(true)
  })

  it("preserves an explicitly persisted value", () => {
    expect(resolveTimelineOnboardingSeen(false, true)).toBe(false)
    expect(resolveTimelineOnboardingSeen(true, false)).toBe(true)
  })
})

describe("decideTimelineOnboarding", () => {
  it("shows only on a clean empty axis with an available highlighter", () => {
    expect(decideTimelineOnboarding(false, 0, 0, true)).toBe("show")
    expect(decideTimelineOnboarding(false, 0, 0, false)).toBe("defer")
    expect(decideTimelineOnboarding(false, 0, 1, true)).toBe("defer")
  })

  it("consumes the guide when the user already has records", () => {
    expect(decideTimelineOnboarding(false, 1, 0, true)).toBe("consume")
  })

  it("never replays after being seen", () => {
    expect(decideTimelineOnboarding(true, 0, 0, true)).toBe("defer")
  })
})
