import { describe, expect, it, vi } from "vitest"
import { Transaction } from "@codemirror/state"
import { prepareCodeMirrorReplacement } from "./codemirror-write"

function makeView(source = "alpha\nbeta\ngamma") {
  const effect = { kind: "scroll-snapshot" }
  const dispatch = vi.fn()
  const scrollSnapshot = vi.fn(() => effect)
  const editor = {
    getValue: () => source,
    posToOffset: ({ line, ch }: { line: number; ch: number }) => {
      const lines = source.split("\n")
      return lines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0) + ch
    },
    cm: {
      state: { doc: { toString: () => source } },
      scrollSnapshot,
      dispatch,
    },
  }
  return { view: { editor }, effect, dispatch, scrollSnapshot }
}

describe("CodeMirror-owned scroll preservation", () => {
  it("captures and dispatches the scroll snapshot in the same document transaction", () => {
    const { view, effect, dispatch, scrollSnapshot } = makeView()
    const replacement = prepareCodeMirrorReplacement(
      view as never,
      "BETA\n",
      { line: 1, ch: 0 },
      { line: 2, ch: 0 }
    )

    expect(replacement).not.toBeNull()
    expect(scrollSnapshot).toHaveBeenCalledTimes(1)
    replacement?.apply()
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 6, to: 11, insert: "BETA\n" },
      effects: effect,
      annotations: expect.objectContaining({ type: Transaction.addToHistory, value: true }),
    })
  })

  it("deletes a complete range with one undoable empty-insert transaction", () => {
    const { view, effect, dispatch } = makeView("before\n```timeline\nentry\n```\nafter")
    const replacement = prepareCodeMirrorReplacement(
      view as never,
      "",
      { line: 1, ch: 0 },
      { line: 4, ch: 0 }
    )

    replacement?.apply()
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 7, to: 29, insert: "" },
      effects: effect,
      annotations: expect.objectContaining({ type: Transaction.addToHistory, value: true }),
    })
  })

  it("fails closed when the Obsidian editor and CodeMirror document disagree", () => {
    const { view, dispatch, scrollSnapshot } = makeView()
    view.editor.cm.state.doc.toString = () => "stale"

    expect(prepareCodeMirrorReplacement(
      view as never,
      "BETA\n",
      { line: 1, ch: 0 },
      { line: 2, ch: 0 }
    )).toBeNull()
    expect(scrollSnapshot).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
