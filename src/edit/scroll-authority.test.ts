import { describe, expect, it } from "vitest"
import { transactionScrollSnapshot } from "./scroll-authority"

describe("transactionScrollSnapshot", () => {
  const snapshot = {
    internal: { blockTop: 17 },
    viewport: { top: 240 },
  }

  it("lets CodeMirror own the outer viewport by default", () => {
    const result = transactionScrollSnapshot(snapshot, true)
    expect(result.internal).toBe(snapshot.internal)
    expect(result.viewport).toBeNull()
  })

  it("keeps the DOM anchor for a Markdown widget remount", () => {
    expect(transactionScrollSnapshot(snapshot, true, "dom")).toBe(snapshot)
  })

  it("keeps the DOM anchor when CodeMirror is unavailable", () => {
    expect(transactionScrollSnapshot(snapshot, false)).toBe(snapshot)
  })
})
