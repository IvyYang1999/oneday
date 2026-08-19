import { trackAnchor } from "./popover-anchor"
/**
 * Precise time editor: small popover with start/end inputs (HH:MM free
 * typing) docked at the block's right edge — the typing-precision
 * counterpart to ⌥-drag (yyt 2026-08-19).
 */
export function openTimePopover(
  container: HTMLElement,
  anchorEl: Element,
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
  // 气泡内点击不夺焦（yyt：点到浮窗就消失——blur 用预填值"成功保存"把自己关了）
  // 气泡内点击不夺焦——但输入框本身要能点（preventDefault 会连焦点一起吞，yyt 2026-08-19）
  pop.addEventListener("mousedown", (e) => {
    const t = e.target as HTMLElement
    if (t !== start && t !== end) e.preventDefault()
  })
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
