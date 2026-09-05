export interface FrameCoalescer<T> {
  push(value: T): void
  flush(): void
  cancel(): void
}

/** Collapse high-frequency pointer samples into one layout mutation per frame. */
export function createFrameCoalescer<T>(
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void,
  apply: (value: T) => void,
): FrameCoalescer<T> {
  let frame = 0
  let pending: T | undefined
  let hasPending = false

  const run = (): void => {
    frame = 0
    if (!hasPending) return
    const value = pending as T
    pending = undefined
    hasPending = false
    apply(value)
  }
  const cancel = (): void => {
    if (frame) cancelFrame(frame)
    frame = 0
    pending = undefined
    hasPending = false
  }

  return {
    push(value) {
      pending = value
      hasPending = true
      if (!frame) frame = requestFrame(run)
    },
    flush() {
      if (frame) cancelFrame(frame)
      frame = 0
      run()
    },
    cancel,
  }
}
