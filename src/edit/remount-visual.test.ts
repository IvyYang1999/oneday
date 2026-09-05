import { describe, expect, it } from "vitest"
import { resolveRemountVisualMode } from "./remount-visual"

describe("remount visual ownership", () => {
  it("never creates a second whole-block visual when the final timeline is already painted live", () => {
    expect(resolveRemountVisualMode(undefined, true)).toBe("live-preview")
  })

  it("keeps the bridge for source-only writes and honors an explicit mode", () => {
    expect(resolveRemountVisualMode(undefined, false)).toBe("bridge")
    expect(resolveRemountVisualMode("bridge", true)).toBe("bridge")
    expect(resolveRemountVisualMode("live-preview", false)).toBe("live-preview")
  })
})
