export type MountedTimelineRender = () => void

/** Tracks only timeline blocks that are currently mounted by Obsidian. */
export class MountedTimelineRegistry {
  private readonly renders = new Set<MountedTimelineRender>()

  register(render: MountedTimelineRender): () => void {
    this.renders.add(render)
    return () => this.renders.delete(render)
  }

  /** Returns the number of blocks refreshed successfully. */
  refreshAll(onError: (error: unknown) => void = () => undefined): number {
    let refreshed = 0
    for (const render of [...this.renders]) {
      try {
        render()
        refreshed += 1
      } catch (error) {
        onError(error)
      }
    }
    return refreshed
  }
}
