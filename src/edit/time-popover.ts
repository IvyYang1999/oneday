/**
 * Precise time editor: small popover with start/end inputs (HH:MM free
 * typing) docked at the block's right edge — the typing-precision
 * counterpart to ⌥-drag (yyt 2026-08-19).
 */
export function openTimePopover(
  container: HTMLElement,
  anchorRect: { x: number; y: number; width: number; height: number },
  initial: { start: string; end: string },
  onSave: (start: string, end: string) => void
): void {
  container.querySelector(".oneday-time-popover")?.remove()

  const pop = document.createElement("div")
  pop.className = "oneday-time-popover"
  const start = document.createElement("input")
  start.type = "text"
  start.value = initial.start
  start.placeholder = "HH:MM"
  const dash = document.createElement("span")
  dash.textContent = "–"
  const end = document.createElement("input")
  end.type = "text"
  end.value = initial.end
  end.placeholder = "HH:MM"
  pop.append(start, dash, end)

  const cr = container.getBoundingClientRect()
  pop.style.left = `${anchorRect.x - cr.x + anchorRect.width + 6}px`
  pop.style.top = `${anchorRect.y - cr.y + anchorRect.height / 2 - 14}px`
  container.appendChild(pop)

  const valid = (v: string): boolean => /^\d{1,2}:\d{2}$/.test(v.trim())
  let done = false
  const finish = (save: boolean): void => {
    if (done) return
    if (save && valid(start.value) && valid(end.value)) {
      done = true
      pop.remove()
      onSave(start.value.trim(), end.value.trim())
    } else if (!save) {
      done = true
      pop.remove()
    }
  }
  for (const input of [start, end]) {
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault()
        finish(true)
      } else if (e.key === "Escape") {
        e.preventDefault()
        finish(false)
      }
      e.stopPropagation()
    })
    input.addEventListener("blur", () => finish(true))
  }
  window.setTimeout(() => start.focus(), 0)
}
