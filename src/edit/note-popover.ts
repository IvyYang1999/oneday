import { trackAnchor } from "./popover-anchor"
/**
 * Lightweight note editor: a small floating input docked at the block's
 * right edge (yyt: 大弹窗遮挡时间轴、输入区还小). Enter/blur saves, Esc cancels.
 * Pure DOM.
 */
export function openNotePopover(
  container: HTMLElement,
  anchorEl: Element,
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

  // fixed + body 挂载：脱离槽位裁剪；跟随锚点滚动（yyt 2026-08-19）
  const place = (r: { x: number; width: number; y: number; height: number }): void => {
    pop.style.left = `${r.x + r.width + 6}px`
    pop.style.top = `${r.y + r.height / 2 - 14}px`
    const vw = window.innerWidth
    const pw = pop.offsetWidth
    if (pop.offsetLeft + pw > vw - 8) pop.style.left = `${Math.max(8, r.x - pw - 6)}px`
  }
  place(anchorRect)
  document.body.appendChild(pop)
  trackAnchor(pop, anchorEl, place)

  pop.addEventListener("mousedown", (e) => {
    if (e.target !== input) e.preventDefault() // 输入框本身要能点
  })
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
  pop.addEventListener("focusout", () => {
    if (done) return
    window.setTimeout(() => {
      if (!pop.contains(document.activeElement)) finish(true)
    }, 0)
  })
  window.setTimeout(() => input.focus(), 0)
}
