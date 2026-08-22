import { describe, expect, it } from "vitest"
import { shouldLeaveUndoToFocusedEditor } from "./undo-routing"

function targetMatching(match: boolean) {
  return { closest: () => (match ? ({} as Element) : null) }
}

describe("undo routing", () => {
  it("leaves undo to a focused text editor", () => {
    expect(shouldLeaveUndoToFocusedEditor(targetMatching(true))).toBe(true)
  })

  it("routes rendered controls such as timeline SVG blocks to Markdown undo", () => {
    expect(shouldLeaveUndoToFocusedEditor(targetMatching(false))).toBe(false)
    expect(shouldLeaveUndoToFocusedEditor(null)).toBe(false)
  })
})
