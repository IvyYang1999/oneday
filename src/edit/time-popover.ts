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
  const dom = container.ownerDocument
  const domWindow = dom.defaultView
  if (!domWindow) return
  dom.querySelectorAll(".oneday-time-popover").forEach((el) => el.remove())

  const pop = dom.createElement("div")
  pop.className = "oneday-time-popover"
  pop.setAttribute("role", "dialog")
  pop.setAttribute("aria-label", "编辑时间块起止时间")
  const start = dom.createElement("input")
  start.type = "text"
  start.setAttribute("aria-label", "开始时间")
  start.value = initial.start
  start.placeholder = "HH:MM"
  const dash = dom.createElement("span")
  dash.setAttribute("aria-hidden", "true")
  dash.textContent = "–"
  const end = dom.createElement("input")
  end.type = "text"
  end.setAttribute("aria-label", "结束时间")
  end.value = initial.end
  end.placeholder = "HH:MM"
  pop.append(start, dash, end)

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

  const valid = (v: string): boolean => /^\d{1,2}:\d{2}$/.test(v.trim())
  let done = false
  const finish = (save: boolean): void => {
    if (done) return
    if (save && valid(start.value) && valid(end.value)) {
      done = true
      stopTracking()
      pop.remove()
      onSave(start.value.trim(), end.value.trim())
    } else if (!save) {
      done = true
      stopTracking()
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
  }
  // 两个输入框属于同一个编辑会话：左框 blur 到右框时不能提交。
  // 只有焦点真正离开整个浮窗时才保存；延后一帧读取 activeElement，
  // 兼容 relatedTarget 为空的 Electron/鼠标点击路径。
  pop.addEventListener("focusout", (e: FocusEvent) => {
    const next = e.relatedTarget as Node | null
    if (next && pop.contains(next)) return
    domWindow.setTimeout(() => {
      if (!pop.contains(dom.activeElement)) finish(true)
    }, 0)
  })
  domWindow.setTimeout(() => start.focus(), 0)
}
