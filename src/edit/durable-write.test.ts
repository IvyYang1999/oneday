import { describe, expect, it, vi } from "vitest"
import { applyDurableWrite } from "./durable-write"

describe("durable editor writes", () => {
  it("does not acknowledge an editor mutation until the backing file contains it", async () => {
    let memory = "before"
    let disk = "before"
    const save = vi.fn(async () => { disk = memory })

    await applyDurableWrite({
      apply: () => { memory = "after" },
      memoryMatches: () => memory === "after",
      save,
      persistedMatches: async () => disk === "after",
      settleDelaysMs: [0],
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(disk).toBe("after")
  })

  it("retries one ordinary save race, then verifies the persisted result", async () => {
    let memory = "before"
    let disk = "before"
    const save = vi.fn(async () => {
      if (save.mock.calls.length > 1) disk = memory
    })

    await applyDurableWrite({
      apply: () => { memory = "after" },
      memoryMatches: () => memory === "after",
      save,
      persistedMatches: async () => disk === "after",
      settleDelaysMs: [0],
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(disk).toBe("after")
  })

  it("waits for an asynchronous Obsidian save to become readable before failing", async () => {
    let memory = "before"
    let disk = "before"
    let scheduled = false
    const save = vi.fn(async () => {
      if (scheduled) return
      scheduled = true
      setTimeout(() => { disk = memory }, 12)
    })

    await applyDurableWrite({
      apply: () => { memory = "after" },
      memoryMatches: () => memory === "after",
      save,
      persistedMatches: async () => disk === "after",
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(disk).toBe("after")
  })

  it("rejects instead of leaving an optimistic success when disk never changes", async () => {
    let memory = "before"
    const save = vi.fn(async () => undefined)

    await expect(applyDurableWrite({
      apply: () => { memory = "after" },
      memoryMatches: () => memory === "after",
      save,
      persistedMatches: async () => false,
      settleDelaysMs: [0],
    })).rejects.toThrow("editor-transaction-not-persisted")

    expect(save).toHaveBeenCalledTimes(2)
  })

  it("fails before saving when the editor transaction did not apply", async () => {
    const save = vi.fn(async () => undefined)
    await expect(applyDurableWrite({
      apply: () => undefined,
      memoryMatches: () => false,
      save,
      persistedMatches: async () => false,
    })).rejects.toThrow("editor-transaction-not-applied")
    expect(save).not.toHaveBeenCalled()
  })
})
