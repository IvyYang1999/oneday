import type { EntryTarget, MarkerTarget } from "./entry-target"

export interface BlockIdentity<Owner extends object> {
  owner: Owner
  path: string
  blockOrdinal: number
}

export interface SpanEditState<Owner extends object> extends BlockIdentity<Owner> {
  target: EntryTarget
}

export interface MarkerEditState<Owner extends object> extends BlockIdentity<Owner> {
  target: MarkerTarget
}

export function sameBlock<Owner extends object>(
  state: BlockIdentity<Owner> | null,
  block: BlockIdentity<Owner>,
): boolean {
  return Boolean(state
    && state.owner === block.owner
    && state.path === block.path
    && state.blockOrdinal === block.blockOrdinal)
}
