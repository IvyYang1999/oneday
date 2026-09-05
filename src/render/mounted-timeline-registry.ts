export type MountedTimelineRender = () => void

interface MountedTimelineEntry {
  sourcePath: string
  render: MountedTimelineRender
}

/** Tracks only timeline blocks that are currently mounted by Obsidian. */
export class MountedTimelineRegistry {
  private readonly entries = new Set<MountedTimelineEntry>()

  register(sourcePath: string, render: MountedTimelineRender): () => void {
    const entry = { sourcePath, render }
    this.entries.add(entry)
    return () => this.entries.delete(entry)
  }

  /**
   * Returns the number of blocks refreshed successfully.
   *
   * Obsidian already remounts processors in files it just modified. Skipping
   * those paths prevents a second destroy/rebuild pass while still refreshing
   * other open dates that depend on the weekly ledger.
   */
  refreshAll(
    onError: (error: unknown) => void = () => undefined,
    excludedSourcePaths: ReadonlySet<string> = new Set()
  ): number {
    let refreshed = 0
    for (const { sourcePath, render } of [...this.entries]) {
      if (excludedSourcePaths.has(sourcePath)) continue
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
