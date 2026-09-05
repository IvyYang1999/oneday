import { trackAnchor } from "./popover-anchor"
import { t } from "../i18n"
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
  onSave: (note: string) => void | Promise<void>,
  options: { kind?: "span" | "marker" } = {},
): void {
  const dom = container.ownerDocument
  const domWindow = dom.defaultView
  if (!domWindow) return
  dom.querySelectorAll(".oneday-note-popover").forEach((el) => el.remove())

  const pop = dom.createElement("div")
  pop.className = "oneday-note-popover"
  pop.setAttribute("role", "dialog")
  pop.setAttribute("aria-label", t(options.kind === "marker" ? "editMarkerNote" : "editBlockNote"))
  const input = dom.createElement("input")
  input.type = "text"
  input.setAttribute("aria-label", t("note"))
  input.value = initial
  input.placeholder = t(options.kind === "marker" ? "markerNotePlaceholder" : "notePlaceholder")
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
  pop.addEventListener("mousedown", (e) => {
    if (e.target !== input) e.preventDefault() // 输入框本身要能点
  })
  let done = false
  let saving = false
  let composing = false
  let pendingBlur = false
  let pendingDetach = false
  let stopTracking = (): void => {}
  const finish = async (save: boolean): Promise<void> => {
    if (done || saving) return
    if (!save) {
      done = true
      stopTracking()
      pop.remove()
      return
    }
    saving = true
    input.readOnly = true
    pop.setAttribute("aria-busy", "true")
    try {
      await onSave(input.value.trim())
      done = true
      stopTracking()
      pop.remove()
    } catch {
      // Persistence failed: the draft is still the user's only copy. Keep the
      // editor mounted and retryable instead of presenting a value which looks
      // saved but disappears after restart.
      saving = false
      input.readOnly = false
      pop.removeAttribute("aria-busy")
      domWindow.setTimeout(() => input.focus({ preventScroll: true }), 0)
    }
  }
  stopTracking = trackAnchor(pop, anchorEl, place, () => {
    // MarkdownPostProcessor can replace the SVG anchor while the body-mounted
    // editor is still active. Never bypass finish(): that silently discarded
    // the draft. If an IME composition is active, wait for its committed value.
    if (composing) pendingDetach = true
    else void finish(true)
  })
  input.addEventListener("compositionstart", () => {
    composing = true
  })
  input.addEventListener("compositionend", () => {
    composing = false
    if (pendingDetach) {
      pendingDetach = false
      void finish(true)
      return
    }
    if (!pendingBlur) return
    pendingBlur = false
    domWindow.setTimeout(() => {
      if (!pop.contains(dom.activeElement)) void finish(true)
    }, 0)
  })
  input.addEventListener("focus", () => {
    pendingBlur = false
  })
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    // Enter confirms an IME candidate before it means “save note”. Keep an
    // explicit composition flag because WebKit/Chromium do not always expose
    // isComposing identically; keyCode 229 is the legacy IME sentinel.
    if (composing || e.isComposing || e.keyCode === 229) {
      e.stopPropagation()
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      void finish(true)
    } else if (e.key === "Escape") {
      e.preventDefault()
      void finish(false)
    }
    e.stopPropagation()
  })
  pop.addEventListener("focusout", () => {
    if (done) return
    domWindow.setTimeout(() => {
      if (pop.contains(dom.activeElement)) return
      if (composing) {
        pendingBlur = true
        return
      }
      void finish(true)
    }, 0)
  })
  domWindow.setTimeout(() => input.focus(), 0)
}
