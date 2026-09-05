import { describe, expect, it, vi } from "vitest"
import { createFrameCoalescer } from "./frame-coalescer"

describe("createFrameCoalescer", () => {
  it("applies only the latest pointer sample once per frame", () => {
    let queued: FrameRequestCallback = () => { throw new Error("frame was not queued") }
    const applied: number[] = []
    const cancel = vi.fn()
    const coalescer = createFrameCoalescer<number>(
      (callback) => { queued = callback; return 7 },
      cancel,
      (value) => applied.push(value),
    )

    coalescer.push(1)
    coalescer.push(2)
    coalescer.push(3)
    expect(applied).toEqual([])
    queued(16)
    expect(applied).toEqual([3])
    expect(cancel).not.toHaveBeenCalled()
  })

  it("flushes the final sample before pointerup and cancels the queued frame", () => {
    const applied: number[] = []
    const cancel = vi.fn()
    const coalescer = createFrameCoalescer<number>(
      () => 11,
      cancel,
      (value) => applied.push(value),
    )

    coalescer.push(4)
    coalescer.push(5)
    coalescer.flush()

    expect(applied).toEqual([5])
    expect(cancel).toHaveBeenCalledWith(11)
  })
})
