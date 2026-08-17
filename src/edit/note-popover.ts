/**
 * Lightweight note editor: a small floating input docked at the block's
 * right edge (yyt: 大弹窗遮挡时间轴、输入区还小). Enter/blur saves, Esc cancels.
 * Pure DOM.
 */
export function openNotePopover(
  container: HTMLElement,
  anchorRect: { x: number; y: number; width: number; height: number },
  initial: string,
  onSave: (note: string) => void
): void {
  container.querySelector(".oneday-note-popover")?.remove()

  const pop = document.createElement("div")
  pop.className = "oneday-note-popover"
  const input = document.createElement("input")
  input.type = "text"
  input.value = initial
  input.placeholder = "这段时间干了什么？"
  pop.appendChild(input)

  // 贴在色块右侧（相对 container 定位）
  const cr = container.getBoundingClientRect()
  pop.style.left = `${anchorRect.x - cr.x + anchorRect.width + 6}px`
  pop.style.top = `${anchorRect.y - cr.y + anchorRect.height / 2 - 14}px`
  container.appendChild(pop)

  let done = false
  const finish = (save: boolean): void => {
    if (done) return
    done = true
    pop.remove()
    if (save) onSave(input.value.trim())
  }
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
  window.setTimeout(() => input.focus(), 0)
}
