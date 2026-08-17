/** Optional text-pane wiring (块内图文混排): render markdown + edit affordance. */
export interface TextPaneDeps {
  /** Render doc.text markdown into the pane (Obsidian MarkdownRenderer). */
  renderMarkdown: (host: HTMLElement, text: string) => void
  /** Persist edited text (setTextSection write-back). */
  onSave: (text: string) => void
}

/** DOM mount: svg string + stats row + error list, into a code-block container. */
import { TimelineDoc } from "../core/types"
import { statsByType } from "../core/stats"
import { formatHours } from "../core/duration"
import { renderTimelineSvg, RenderOptions, SIDE_LANE_W } from "./svg-builder"
import { hashTypeColor } from "../core/type-colors"
import { GRID_COLS, GRID_ROW_H, gridRows, resolveGrid } from "../core/grid-layout"

/** 文字区原地编辑：点击渲染区 -> textarea；失焦/⌘Enter 保存，Esc 取消（yyt：不要弹窗）。 */
function attachInlineTextEditor(pane: HTMLElement, text: string, deps: TextPaneDeps): void {
  const show = (): void => {
    pane.empty()
    if (text.trim() === "") {
      const ph = pane.createDiv({ cls: "oneday-text-placeholder", text: "点击书写…" })
      ph.addEventListener("click", edit)
    } else {
      const host = pane.createDiv({ cls: "oneday-text-host" })
      deps.renderMarkdown(host, text)
      host.addEventListener("click", edit)
    }
  }
  const edit = (): void => {
    pane.empty()
    const ta = pane.createEl("textarea", { cls: "oneday-text-inline" })
    ta.value = text
    const fit = (): void => {
      ta.style.height = "0px"
      ta.style.height = `${ta.scrollHeight}px`
    }
    ta.addEventListener("input", fit)
    window.setTimeout(fit, 0)
    const commit = (): void => deps.onSave(ta.value)
    ta.addEventListener("blur", commit)
    ta.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        ta.blur()
      } else if (e.key === "Escape") {
        ta.removeEventListener("blur", commit)
        show()
      }
    })
    ta.focus()
  }
  show()
}

export function renderTimelineInto(
  el: HTMLElement,
  doc: TimelineDoc,
  opts: RenderOptions,
  textPane?: TextPaneDeps
): HTMLElement {
  const container = el.createDiv({ cls: "oneday-container" })

  const baseWidth = doc.width ?? opts.width ?? 200
  const hasText = textPane !== undefined && doc.text !== undefined
  const body = container.createDiv({ cls: "oneday-body" })

  // 网格布局（yyt 2026-08-17：组件手柄拖拽移动+缩放、自动吸附+重力压实）：
  // 12 列 x 20px 行，组件几何存 dataset，交互由 main 接 attachGridInteract
  // 时间轴默认行数取 SVG 实际高度（含标注车道撑高），避免底部截断
  const timelineSvg = renderTimelineSvg(doc, { ...opts, width: baseWidth })
  const svgHeight = Number(/<svg[^>]*height="([\d.]+)"/.exec(timelineSvg)?.[1] ?? 800)
  const timelineRows = Math.ceil(svgHeight / GRID_ROW_H)
  const items = resolveGrid(doc.layout ?? null, hasText, doc.side, timelineRows)
  body.style.height = `${gridRows(items) * GRID_ROW_H}px`
  for (const it of items) {
    const slot = body.createDiv({ cls: `oneday-slot oneday-slot-${it.id}` })
    slot.dataset.slot = it.id
    slot.dataset.x = String(it.x)
    slot.dataset.y = String(it.y)
    slot.dataset.w = String(it.w)
    slot.dataset.h = String(it.h)
    slot.style.left = `${(it.x / GRID_COLS) * 100}%`
    slot.style.width = `${(it.w / GRID_COLS) * 100}%`
    slot.style.top = `${it.y * GRID_ROW_H}px`
    slot.style.height = `${it.h * GRID_ROW_H}px`
    if (it.id === "timeline") {
      const svgHolder = slot.createDiv({ cls: "oneday-svg-holder" })
      svgHolder.innerHTML = timelineSvg
    } else if (it.id === "text" && textPane) {
      const pane = slot.createDiv({ cls: "oneday-text-pane" })
      attachInlineTextEditor(pane, doc.text ?? "", textPane)
    }
  }
  // 宽度/浮动必须设在宿主 el 上：Obsidian 的代码块宿主默认通栏，
  // 子元素浮动不会让出左侧空间（yyt 2026-08-17 反馈）。
  // 在 callout（> [!x|right]）内时浮动由 callout 主导（Live Preview 唯一可行路径），
  // 我们只提供内容宽度，callout shrink-to-fit。
  const inCallout = el.closest(".callout") !== null
  // Live Preview（CM6）里 float 无法环绕文字，只会把块推右留空洞——禁用
  const inLivePreview = el.closest(".cm-editor") !== null
  // 宿主恒 100%：时间轴 SVG 随槽位响应式重渲染，宽度由网格手柄调（yyt 2026-08-17）
  const useFloat = Boolean(doc.floatRight) && !inCallout && !inLivePreview
  el.style.width = useFloat ? `${baseWidth + SIDE_LANE_W}px` : "100%"
  el.classList.add("oneday-host")
  el.classList.toggle("oneday-host-float", useFloat)

  const statsSlot = container.querySelector(".oneday-slot-stats") ?? container
  const stats = statsByType(doc.entries)
  if (stats.length > 0) {
    // 每行一个类型 + 荧光笔色点（yyt 2026-08-17）
    const box = statsSlot.createDiv({ cls: "oneday-stats" })
    for (const st of stats) {
      const row = box.createDiv({ cls: "oneday-stat-row" })
      const dot = row.createEl("span", { cls: "oneday-stat-dot" })
      dot.style.background = opts.typeColors[st.type] ?? hashTypeColor(st.type)
      row.createEl("span", { cls: "oneday-stat-type", text: st.type })
      row.createEl("span", { cls: "oneday-stat-hours", text: formatHours(st.minutes) })
    }
  }

  if (doc.errors.length > 0) {
    const box = statsSlot.createDiv({ cls: "oneday-errors" })
    for (const err of doc.errors) {
      box.createDiv({ text: `第 ${err.line + 1} 行：${err.reason}${err.text ? `（${err.text.trim()}）` : ""}` })
    }
  }

  return container
}
