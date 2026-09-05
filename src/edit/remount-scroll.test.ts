import { describe, expect, it } from "vitest"
import { RemountScrollRegistry, RemountSnapshotLatch } from "./remount-scroll"
import type { ScrollTransactionKey } from "./scroll-transaction"

function key(
  owner: object,
  blockOrdinal: number,
  docId = "doc-a",
  lineStart = 20
): ScrollTransactionKey<object> {
  return { owner, path: "Diary.md", blockOrdinal, docId, lineStart }
}

describe("remount scroll continuity", () => {
  it("keeps the pre-paste snapshot even if CodeMirror scrolls before unmount", () => {
    const latch = new RemountSnapshotLatch<{ top: number }>()
    latch.update({ top: 420 })
    latch.freeze({ top: 420 })

    // A CodeMirror scroll event can fire before the processor host unloads.
    latch.update({ top: 0 })

    expect(latch.value).toEqual({ top: 420 })
    latch.release()
    latch.update({ top: 180 })
    expect(latch.value).toEqual({ top: 180 })
  })

  it("hands an unchanged timeline snapshot from the unmounted host to its replacement", () => {
    const owner = {}
    const snapshot = { viewportTop: 420, timelineTop: 160 }
    const registry = new RemountScrollRegistry<object, typeof snapshot>()

    registry.remember(key(owner, 1), "same timeline source", snapshot)

    expect(registry.take(key(owner, 1, "doc-b", 27), "same timeline source")).toBe(snapshot)
    expect(registry.size).toBe(0)
  })

  it("never lets another pane or another block consume the snapshot", () => {
    const owner = {}
    const otherOwner = {}
    const snapshot = { viewportTop: 420 }
    const registry = new RemountScrollRegistry<object, typeof snapshot>()

    registry.remember(key(owner, 1), "same timeline source", snapshot)

    expect(registry.take(key(otherOwner, 1), "same timeline source")).toBeNull()
    expect(registry.take(key(owner, 2), "same timeline source")).toBeNull()
    expect(registry.take(key(owner, 1), "same timeline source")).toBe(snapshot)
  })

  it("discards a stale snapshot when that timeline source itself changed", () => {
    const owner = {}
    const snapshot = { viewportTop: 420 }
    const registry = new RemountScrollRegistry<object, typeof snapshot>()

    registry.remember(key(owner, 1), "old timeline source", snapshot)

    expect(registry.take(key(owner, 1), "changed timeline source")).toBeNull()
    expect(registry.size).toBe(0)
    expect(registry.take(key(owner, 1), "old timeline source")).toBeNull()
  })
})
