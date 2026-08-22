import { describe, expect, it, vi } from "vitest"
import { MountedTimelineRegistry } from "./mounted-timeline-registry"

describe("MountedTimelineRegistry", () => {
  it("refreshes every mounted block and stops after unregister", () => {
    const registry = new MountedTimelineRegistry()
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registry.register(first)
    registry.register(second)

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
    registry.register(() => { throw new Error("detached block") })
    registry.register(healthy)

    expect(registry.refreshAll()).toBe(1)
    expect(healthy).toHaveBeenCalledOnce()
  })
})
