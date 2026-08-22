export interface ClosestCapableTarget {
  closest(selector: string): Element | null
}

/**
 * Inputs and actual text-editing surfaces own their native undo history.
 * Rendered controls inside a CodeMirror editor (SVG, buttons, component
 * chrome) do not: their key event must be routed back to the Markdown editor.
 */
export function shouldLeaveUndoToFocusedEditor(target: ClosestCapableTarget | null): boolean {
  return Boolean(target?.closest([
    "input",
    "textarea",
    "select",
    ".cm-content",
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
  ].join(", ")))
}
