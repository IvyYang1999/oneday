import { describe, expect, it } from "vitest"
import { ScrollTransactionRegistry, type ScrollTransactionKey } from "./scroll-transaction"

type Owner = { id: string }

function key(
  owner: Owner,
  lineStart: number,
  docId = "doc-a",
  blockOrdinal = lineStart
): ScrollTransactionKey<Owner> {
  return { owner, path: "daily.md", docId, lineStart, blockOrdinal }
}

describe("ScrollTransactionRegistry", () => {
  it("keeps the first viewport snapshot when the same block is written twice before redraw", () => {
    const owner = { id: "right-pane" }
    const registry = new ScrollTransactionRegistry<Owner, { top: number }>()

    registry.begin(key(owner, 10), "source-v1", { top: 480 })
    registry.begin(key(owner, 10), "source-v2", { top: 9999 })

    expect(registry.claim(key(owner, 10), "source-v1")).toBeNull()
    expect(registry.claim(key(owner, 10), "source-v2")).toEqual({ top: 480 })
    expect(registry.size).toBe(0)
  })

  it("does not let another block in the same file consume the snapshot", () => {
    const owner = { id: "pane" }
    const registry = new ScrollTransactionRegistry<Owner, { top: number }>()

    registry.begin(key(owner, 40), "updated block", { top: 620 })

    expect(registry.claim(key(owner, 5), "updated block")).toBeNull()
    expect(registry.size).toBe(1)
    expect(registry.claim(key(owner, 40), "updated block")).toEqual({ top: 620 })
  })

  it("does not let another pane showing the same file consume the snapshot", () => {
    const left = { id: "left" }
    const right = { id: "right" }
    const registry = new ScrollTransactionRegistry<Owner, { top: number }>()

    registry.begin(key(right, 10), "updated block", { top: 700 })

    expect(registry.claim(key(left, 10), "updated block")).toBeNull()
    expect(registry.claim(key(right, 10), "updated block")).toEqual({ top: 700 })
  })

  it("survives a shifted line number only when the source match is unique", () => {
    const owner = { id: "pane" }
    const registry = new ScrollTransactionRegistry<Owner, { top: number }>()
    registry.begin(key(owner, 40, "stable-doc", 2), "unique updated source", { top: 510 })

    expect(registry.claim(key(owner, 43, "stable-doc", 2), "unique updated source")).toEqual({ top: 510 })
  })

  it("never lets another ordinal consume the only same-source record", () => {
    const owner = { id: "pane" }
    const registry = new ScrollTransactionRegistry<Owner, { top: number }>()
    registry.begin(key(owner, 10, "doc-a", 0), "duplicate", { top: 100 })

    expect(registry.claim(key(owner, 50, "doc-b", 1), "duplicate")).toBeNull()
    expect(registry.size).toBe(1)
    expect(registry.claim(key(owner, 12, "doc-b", 0), "duplicate")).toEqual({ top: 100 })
  })

  it("cancels a failed write without leaving a stale restore", () => {
    const owner = { id: "pane" }
    const registry = new ScrollTransactionRegistry<Owner, { top: number }>()
    const transactionKey = key(owner, 10)
    registry.begin(transactionKey, "updated", { top: 100 })

    registry.cancel(transactionKey)

    expect(registry.claim(transactionKey, "updated")).toBeNull()
    expect(registry.size).toBe(0)
  })
})
