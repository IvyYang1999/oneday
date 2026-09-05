import { describe, expect, it, vi } from "vitest"
import { MountedTimelineRegistry } from "./mounted-timeline-registry"

describe("MountedTimelineRegistry", () => {
  it("refreshes every mounted block and stops after unregister", () => {
    const registry = new MountedTimelineRegistry()
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registry.register("first.md", first)
    registry.register("second.md", second)

    expect(registry.refreshAll()).toBe(2)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()

    unregisterFirst()
    expect(registry.refreshAll()).toBe(1)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)
  })

  it("continues refreshing other blocks when one block fails", () => {
    const registry = new MountedTimelineRegistry()
    const healthy = vi.fn()
    registry.register("broken.md", () => { throw new Error("detached block") })
    registry.register("healthy.md", healthy)

    expect(registry.refreshAll()).toBe(1)
    expect(healthy).toHaveBeenCalledOnce()
  })

  it("does not rebuild blocks in files Obsidian is already remounting", () => {
    const registry = new MountedTimelineRegistry()
    const changedFile = vi.fn()
    const dependentFile = vi.fn()
    registry.register("changed.md", changedFile)
    registry.register("dependent.md", dependentFile)

    expect(registry.refreshAll(undefined, new Set(["changed.md"]))).toBe(1)
    expect(changedFile).not.toHaveBeenCalled()
    expect(dependentFile).toHaveBeenCalledOnce()
  })
})
