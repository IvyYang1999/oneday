/** DOM mount: svg string + stats row + error list, into a code-block container. */
import { TimelineDoc } from "../core/types"
import { statsByType } from "../core/stats"
import { formatHours } from "../core/duration"
import { renderTimelineSvg, RenderOptions, FALLBACK_COLOR, SIDE_LANE_W } from "./svg-builder"

export function renderTimelineInto(el: HTMLElement, doc: TimelineDoc, opts: RenderOptions): HTMLElement {
  const container = el.createDiv({ cls: "oneday-container" })

  const baseWidth = doc.width ?? opts.width ?? 200
  const svgHolder = container.createDiv({ cls: "oneday-svg-holder" })
  svgHolder.innerHTML = renderTimelineSvg(doc, { ...opts, width: baseWidth })
  container.style.width = `${baseWidth + SIDE_LANE_W}px`
  if (doc.floatRight) container.addClass("oneday-float-right")

  const stats = statsByType(doc.entries)
  if (stats.length > 0) {
    container.createDiv({
      cls: "oneday-stats",
      text: stats.map((s) => `${s.type} ${formatHours(s.minutes)}`).join(" · "),
    })
  }

  const unknown = [...new Set(doc.entries.map((e) => e.type).filter((t) => !(t in opts.typeColors)))]
  if (unknown.length > 0) {
    container.createDiv({
      cls: "oneday-warning",
      text: `未登记类型（显示为 ${FALLBACK_COLOR} 灰色）：${unknown.join(", ")}`,
    })
  }

  if (doc.errors.length > 0) {
    const box = container.createDiv({ cls: "oneday-errors" })
    for (const err of doc.errors) {
      box.createDiv({ text: `第 ${err.line + 1} 行：${err.reason}${err.text ? `（${err.text.trim()}）` : ""}` })
    }
  }

  return container
}
