export interface MarkdownViewLike<Target> {
  file: { path: string } | null
  containerEl: { contains(target: Target): boolean }
}

/** Resolve the visible pane from the rendered block, never from path order. */
export function findOwningView<Target, T extends MarkdownViewLike<Target>>(
  path: string,
  target: Target,
  candidates: readonly T[]
): T | null {
  const exact = candidates.filter((candidate) =>
    candidate.file?.path === path && candidate.containerEl.contains(target)
  )
  return exact.length === 1 ? exact[0] : null
}

/**
 * Choose the editor that will receive the source transaction. DOM ownership
 * is authoritative. Detached DOM may fall back to a sole matching pane, but
 * never to the active/first pane when several same-path panes exist.
 */
export function chooseMutationView<Target, T extends MarkdownViewLike<Target>>(
  path: string,
  target: Target,
  candidates: readonly T[],
  active: T | null
): T | null {
  const owner = findOwningView(path, target, candidates)
  if (owner) return owner
  const matching = candidates.filter((candidate) => candidate.file?.path === path)
  if (matching.length === 1) return matching[0]
  // The parameter is deliberately retained to make the fail-closed decision
  // explicit at call sites; "active" is not sufficient ownership evidence.
  void active
  return null
}

/** Freeze the best proven owner at transaction begin; never re-derive later. */
export function resolveTransactionOwner<T extends object>(
  domOwner: T | null,
  mutationOwner: T | null,
  fallbackOwner: T
): T {
  return domOwner ?? mutationOwner ?? fallbackOwner
}

/**
 * Resolve the pane captured by a deferred editor after Obsidian may have
 * rebuilt its MarkdownView object. Exact identity wins; a sole same-path pane
 * is an unambiguous replacement. Multiple panes remain fail-closed.
 */
export function resolvePersistedOwnerView<T extends object>(
  capturedOwner: object,
  candidates: readonly T[],
  ownerOf: (candidate: T) => object = (candidate) => candidate,
): T | null {
  const exact = candidates.find((candidate) => ownerOf(candidate) === capturedOwner)
  return exact ?? (candidates.length === 1 ? candidates[0] : null)
}
