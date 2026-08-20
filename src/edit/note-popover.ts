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
  const dom = container.ownerDocument
  const domWindow = dom.defaultView
  if (!domWindow) return
  dom.querySelectorAll(".oneday-note-popover").forEach((el) => el.remove())

  const pop = dom.createElement("div")
  pop.className = "oneday-note-popover"
  pop.setAttribute("role", "dialog")
  pop.setAttribute("aria-label", "编辑时间块备注")
  const input = dom.createElement("input")
  input.type = "text"
  input.setAttribute("aria-label", "备注")
  input.value = initial
  input.placeholder = "这段时间干了什么？"
  pop.appendChild(input)

  // fixed + body 挂载：脱离槽位裁剪；跟随锚点滚动（yyt 2026-08-19）
  const place = (r: { x: number; width: number; y: number; height: number }): void => {
    pop.style.left = `${r.x + r.width + 6}px`
    pop.style.top = `${r.y + r.height / 2 - 14}px`
    const vw = domWindow.innerWidth
    const pw = pop.offsetWidth
    if (pop.offsetLeft + pw > vw - 8) pop.style.left = `${Math.max(8, r.x - pw - 6)}px`
  }
  place(anchorRect)
  dom.body.appendChild(pop)
  const stopTracking = trackAnchor(pop, anchorEl, place)

  pop.addEventListener("mousedown", (e) => {
    if (e.target !== input) e.preventDefault() // 输入框本身要能点
  })
  let done = false
  const finish = (save: boolean): void => {
    if (done) return
    done = true
    stopTracking()
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
    domWindow.setTimeout(() => {
      if (!pop.contains(dom.activeElement)) finish(true)
    }, 0)
  })
  domWindow.setTimeout(() => input.focus(), 0)
}
