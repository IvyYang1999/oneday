/**
 * Hover info for blocks (yyt 2026-08-17: hover/点击看不到任何信息):
 * - custom tooltip (SVG <title> tooltips are unreliable in Electron)
 * - hover pairing: block <-> its side label in the lane (多列时找对应)
 * Pure DOM so Playwright can smoke it.
 */
import { TimelineDoc } from "../core/types"
import { durationMinutes, formatClock, formatHours } from "../core/duration"

/** Toggle click-focus on a block: highlight it + its lane label + leader (yyt: 连线不用常驻). */
export function toggleBlockFocus(container: HTMLElement, line: number): void {
  const already = container.querySelector(`rect.oneday-block[data-line="${line}"]`)?.classList.contains("is-focus")
  container.querySelectorAll(".is-focus").forEach((el) => el.classList.remove("is-focus"))
  if (already) return
  container.querySelectorAll(`[data-line="${line}"]`).forEach((el) => el.classList.add("is-focus"))
}

export function attachHoverInfo(container: HTMLElement, doc: TimelineDoc): void {
  const svg = container.querySelector<SVGSVGElement>("svg.oneday-svg")
  if (!svg) return

  const tooltip = document.createElement("div")
  tooltip.className = "oneday-tooltip"
  tooltip.style.display = "none"
  container.appendChild(tooltip)

  const clearPairing = (): void => {
    container.querySelectorAll(".is-hover").forEach((el) => el.classList.remove("is-hover"))
  }

  svg.addEventListener("pointerover", (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest("rect.oneday-block")
    if (!(target instanceof SVGRectElement)) return
    const line = Number(target.dataset.line)
    const entry = doc.entries.find((it) => it.line === line)
    if (!entry) return

    clearPairing()
    target.classList.add("is-hover")
    container
      .querySelectorAll(`.oneday-svg [data-line="${line}"]:not(rect)`)
      .forEach((el) => el.classList.add("is-hover"))

    const time = `${formatClock(entry.startMin)} – ${formatClock(entry.endMin)} · ${formatHours(durationMinutes(entry.startMin, entry.endMin))}`
    tooltip.replaceChildren()
    const l1 = document.createElement("div")
    l1.className = "oneday-tooltip-time"
    l1.textContent = time
    const l2 = document.createElement("div")
    l2.className = "oneday-tooltip-type"
    l2.textContent = (entry.plan ? "规划 · " : "") + entry.type
    tooltip.append(l1, l2)
    if (entry.note) {
      const l3 = document.createElement("div")
      l3.className = "oneday-tooltip-note"
      l3.textContent = entry.note
      tooltip.appendChild(l3)
    }
    tooltip.style.display = "block"
  })

  svg.addEventListener("pointermove", (e: PointerEvent) => {
    if (tooltip.style.display === "none") return
    const rect = container.getBoundingClientRect()
    tooltip.style.left = `${e.clientX - rect.left + 12}px`
    tooltip.style.top = `${e.clientY - rect.top + 10}px`
  })

  svg.addEventListener("pointerout", (e: PointerEvent) => {
    if ((e.target as Element | null)?.closest("rect.oneday-block")) {
      tooltip.style.display = "none"
      clearPairing()
    }
  })
}
