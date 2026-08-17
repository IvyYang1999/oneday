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
  // 宽度/浮动必须设在宿主 el 上：Obsidian 的代码块宿主默认通栏，
  // 子元素浮动不会让出左侧空间（yyt 2026-08-17 反馈）。
  // 在 callout（> [!x|right]）内时浮动由 callout 主导（Live Preview 唯一可行路径），
  // 我们只提供内容宽度，callout shrink-to-fit。
  const inCallout = el.closest(".callout") !== null
  el.style.width = `${baseWidth + SIDE_LANE_W}px`
  el.classList.add("oneday-host")
  el.classList.toggle("oneday-host-float", Boolean(doc.floatRight) && !inCallout)

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
