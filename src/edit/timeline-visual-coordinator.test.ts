import { describe, expect, it, vi } from "vitest"
import { TimelineVisualCoordinator } from "./timeline-visual-coordinator"

describe("TimelineVisualCoordinator", () => {
  it("resolves the current host by pane and block instead of path alone", () => {
    const coordinator = new TimelineVisualCoordinator<object, object>()
    const owner = {}
    const otherOwner = {}
    const first = {}
    const second = {}
    const otherPane = {}
    const preview = () => () => undefined
    coordinator.register(first, { path: "day.md", owner, blockOrdinal: 0, source: "a", preview })
    coordinator.register(second, { path: "day.md", owner, blockOrdinal: 1, source: "b", preview })
    coordinator.register(otherPane, { path: "day.md", owner: otherOwner, blockOrdinal: 0, source: "c", preview })

    expect(coordinator.findHost("day.md", owner, 0)).toBe(first)
    expect(coordinator.findHost("day.md", owner, 1)).toBe(second)
    expect(coordinator.findHost("day.md", otherOwner, 0)).toBe(otherPane)
    expect(coordinator.findHost("other.md", owner, 0)).toBeNull()
  })

  it("fails closed when duplicate current hosts make ownership ambiguous", () => {
    const coordinator = new TimelineVisualCoordinator<object, object>()
    const owner = {}
    const preview = () => () => undefined
    coordinator.register({}, { path: "day.md", owner, blockOrdinal: 0, source: "a", preview })
    coordinator.register({}, { path: "day.md", owner, blockOrdinal: 0, source: "a", preview })

    expect(coordinator.findHost("day.md", owner, 0)).toBeNull()
  })

  it("makes the optimistic final state the only visual owner until the matching renderer mounts", () => {
    const coordinator = new TimelineVisualCoordinator<object, object>()
    const host = {}
    const owner = {}
    let visible = "marker@10:00"
    coordinator.register(host, {
      path: "day.md",
      owner,
      blockOrdinal: 0,
      source: "@10:00 ddl",
      preview: (next, previous) => {
        visible = next
        return () => { visible = previous }
      },
    })

    const rollback = coordinator.preview(host, "@11:00 ddl")
    expect(visible).toBe("@11:00 ddl")
    expect(coordinator.shouldRender(host, "@10:00 ddl")).toBe(false)
    expect(coordinator.shouldRender(host, "@11:00 ddl")).toBe(true)

    coordinator.accept(host, "@11:00 ddl")
    expect(coordinator.shouldRender(host, "@10:00 ddl")).toBe(false)
    expect(coordinator.shouldRender(host, "@11:00 ddl")).toBe(true)
    rollback?.()
    // A completed transaction owns its accepted state; a late persistence
    // rollback must not resurrect the old marker.
    expect(visible).toBe("@11:00 ddl")
  })

  it("synchronously previews undo source for the matching pane and block only", () => {
    const coordinator = new TimelineVisualCoordinator<object, object>()
    const owner = {}
    const otherOwner = {}
    const first = {}
    const second = {}
    const otherPane = {}
    const previews = [vi.fn(() => () => undefined), vi.fn(() => () => undefined), vi.fn(() => () => undefined)]
    coordinator.register(first, { path: "day.md", owner, blockOrdinal: 0, source: "new-a", preview: previews[0] })
    coordinator.register(second, { path: "day.md", owner, blockOrdinal: 1, source: "new-b", preview: previews[1] })
    coordinator.register(otherPane, { path: "day.md", owner: otherOwner, blockOrdinal: 0, source: "new-a", preview: previews[2] })

    const synced = coordinator.syncFromContent("day.md", owner, "whole note", (_content, ordinal) =>
      ordinal === 0 ? "old-a" : "old-b")

    expect(synced).toBe(2)
    expect(previews[0]).toHaveBeenCalledWith("old-a", "new-a")
    expect(previews[1]).toHaveBeenCalledWith("old-b", "new-b")
    expect(previews[2]).not.toHaveBeenCalled()
  })

  it("rolls the live visual back when persistence fails", () => {
    const coordinator = new TimelineVisualCoordinator<object, object>()
    const host = {}
    const owner = {}
    let visible = "before"
    coordinator.register(host, {
      path: "day.md", owner, blockOrdinal: 0, source: "before",
      preview: (next, previous) => {
        visible = next
        return () => { visible = previous }
      },
    })

    const rollback = coordinator.preview(host, "after")
    expect(visible).toBe("after")
    rollback?.()
    expect(visible).toBe("before")
    expect(coordinator.shouldRender(host, "before")).toBe(true)
  })

  it("can advance source ownership while a component performs a slot-local preview", () => {
    const coordinator = new TimelineVisualCoordinator<object, object>()
    const host = {}
    const owner = {}
    const wholeBlockPreview = vi.fn(() => () => undefined)
    coordinator.register(host, {
      path: "day.md", owner, blockOrdinal: 0, source: "quote: before", preview: wholeBlockPreview,
    })

    const rollback = coordinator.advance(host, "quote: after")

    expect(wholeBlockPreview).not.toHaveBeenCalled()
    expect(coordinator.shouldRender(host, "quote: before")).toBe(false)
    expect(coordinator.shouldRender(host, "quote: after")).toBe(true)

    rollback?.()
    expect(coordinator.shouldRender(host, "quote: before")).toBe(true)
  })
})
