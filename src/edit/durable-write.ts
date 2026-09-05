export interface DurableWriteOptions {
  /** Apply the in-memory editor transaction exactly once. */
  apply: () => void
  /** Prove that the transaction reached the editor before reporting success. */
  memoryMatches: () => boolean
  /** Flush the editor's current contents to its backing file. */
  save: () => Promise<void>
  /** Read the backing file and prove that this mutation (or a newer one) is durable. */
  persistedMatches: () => Promise<boolean>
  /** A second bounded save closes ordinary debounce/race windows without retry storms. */
  attempts?: number
  /**
   * Obsidian may resolve `MarkdownView.save()` before a following Vault read
   * observes the write. Poll the backing file across this bounded schedule
   * before issuing another save or reporting failure.
   */
  settleDelaysMs?: readonly number[]
  /** Test seam for the bounded persistence wait. */
  wait?: (delayMs: number) => Promise<void>
}

/**
 * Commit one editor mutation only after the backing file acknowledges it.
 *
 * CodeMirror dispatch is synchronous, while Obsidian file saving is debounced.
 * Treating dispatch as persistence lets optimistic UI survive until restart even
 * though the Markdown file never changed. This helper makes that impossible:
 * callers may preview immediately, but their Promise resolves only after disk
 * verification, and rejects after a small bounded number of save attempts.
 */
export async function applyDurableWrite(options: DurableWriteOptions): Promise<void> {
  const attempts = Math.max(1, Math.trunc(options.attempts ?? 2))
  const settleDelaysMs = options.settleDelaysMs ?? [0, 16, 32, 64, 128, 256]
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)))
  options.apply()
  if (!options.memoryMatches()) throw new Error("editor-transaction-not-applied")

  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await options.save()
    } catch (error) {
      lastError = error
    }
    for (const rawDelay of settleDelaysMs) {
      const delay = Math.max(0, Math.trunc(rawDelay))
      if (delay > 0) await wait(delay)
      try {
        if (await options.persistedMatches()) return
      } catch (error) {
        lastError = error
      }
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error("editor-transaction-not-persisted")
}
