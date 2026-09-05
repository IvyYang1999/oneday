import { describe, expect, it } from "vitest"
import { TextDraftRegistry, type TextDraftKey } from "./text-draft"

function key(owner: object, index = 0): TextDraftKey<object> {
  return { owner, path: "day.md", blockOrdinal: 1, index }
}

describe("TextDraftRegistry", () => {
  it("keeps the active draft across renderer instances", () => {
    const owner = {}
    const drafts = new TextDraftRegistry<object>()
    drafts.set(key(owner), { value: "尚未写回", editing: true, shouldFocus: true })

    expect(drafts.get(key(owner))).toEqual({
      value: "尚未写回",
      editing: true,
      shouldFocus: true,
    })
  })

  it("does not mix text slots, blocks, files, or panes", () => {
    const firstOwner = {}
    const secondOwner = {}
    const drafts = new TextDraftRegistry<object>()
    drafts.set(key(firstOwner), { value: "first", editing: true, shouldFocus: false })

    expect(drafts.get(key(firstOwner, 1))).toBeNull()
    expect(drafts.get({ ...key(firstOwner), blockOrdinal: 2 })).toBeNull()
    expect(drafts.get({ ...key(firstOwner), path: "other.md" })).toBeNull()
    expect(drafts.get(key(secondOwner))).toBeNull()
  })

  it("serializes writes to the same text slot without blocking another slot", async () => {
    const owner = {}
    const drafts = new TextDraftRegistry<object>()
    const events: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = drafts.enqueue(key(owner), async () => {
      events.push("first:start")
      await firstGate
      events.push("first:end")
    })
    const second = drafts.enqueue(key(owner), async () => { events.push("second") })
    const other = drafts.enqueue(key(owner, 1), async () => { events.push("other") })

    await other
    expect(events).toEqual(["first:start", "other"])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(["first:start", "other", "first:end", "second"])
  })
})
