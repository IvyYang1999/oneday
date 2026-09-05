import { describe, expect, it } from "vitest"
import { restoreViewportAnchor, stabilizeViewportAnchor } from "./viewport-anchor"

describe("viewport anchor", () => {
  it("compensates the actual owning scroller from the measured block delta", () => {
    const scroller = { isConnected: true, scrollTop: 100, scrollLeft: 20 }
    const container = {
      isConnected: true,
      getBoundingClientRect: () => ({ top: 70, left: 16 }),
    }

    restoreViewportAnchor({ scroller, top: 40, left: 10 } as never, container as never)

    expect(scroller.scrollTop).toBe(130)
    expect(scroller.scrollLeft).toBe(26)
  })

  it("re-applies the same anchor after CodeMirror's next two animation frames", () => {
    const callbacks: FrameRequestCallback[] = []
    const listeners = new Map<string, EventListener>()
    const scroller = {
      isConnected: true,
      scrollTop: 100,
      scrollLeft: 0,
      addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    }
    let top = 40
    const dom = {
      defaultView: {
        requestAnimationFrame: (callback: FrameRequestCallback) => {
          callbacks.push(callback)
          return callbacks.length
        },
        cancelAnimationFrame: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const container = {
      isConnected: true,
      ownerDocument: dom,
      getBoundingClientRect: () => ({ top, left: 0 }),
    }

    stabilizeViewportAnchor({ scroller, top: 40, left: 0 } as never, container as never, 2)
    top = 600
    callbacks.shift()?.(0)
    expect(scroller.scrollTop).toBe(660)
    top = 40
    callbacks.shift()?.(16)

    expect(callbacks).toHaveLength(0)
    expect(listeners.size).toBe(0)
  })
})
