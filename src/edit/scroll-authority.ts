export type OuterViewportAuthority = "codemirror" | "dom"

export interface SnapshotWithViewport<TInternal, TViewport> {
  internal: TInternal
  viewport: TViewport | null
}

/**
 * CodeMirror normally owns the outer scroll position for source edits. Some
 * self-contained widgets, however, are remounted by MarkdownPostProcessor
 * after the transaction; their visible DOM anchor is the only stable owner.
 */
export function transactionScrollSnapshot<TInternal, TViewport>(
  snapshot: SnapshotWithViewport<TInternal, TViewport>,
  hasCodeMirrorWrite: boolean,
  authority: OuterViewportAuthority = "codemirror"
): SnapshotWithViewport<TInternal, TViewport> {
  if (!hasCodeMirrorWrite || authority === "dom") return snapshot
  return { ...snapshot, viewport: null }
}
