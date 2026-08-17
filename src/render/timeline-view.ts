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
import { renderTimelineSvg, RenderOptions, FALLBACK_COLOR, SIDE_LANE_W } from "./svg-builder"

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
  const body = container.createDiv({ cls: "oneday-body" + (doc.side === "left" ? " side-left" : "") })
  if (hasText && textPane) {
    const pane = body.createDiv({ cls: "oneday-text-pane" })
    attachInlineTextEditor(pane, doc.text ?? "", textPane)
    // 分隔条占位（拖拽行为由 main 接 attachDivider）
    body.createDiv({ cls: "oneday-divider" })
  }
  // 时间轴栏：工具栏/状态/统计/对话框都进这一列（yyt：和文字区分开）。
  // 宽度创建即钉死：否则列宽退化为内容驱动，工具栏一排色板把列撑宽、
  // 文字区在编辑时被挤压（yyt 2026-08-17「双击编辑左侧变窄」）
  const col = body.createDiv({ cls: "oneday-timeline-col" })
  col.style.width = `${baseWidth + SIDE_LANE_W}px`
  col.style.flexShrink = "0"
  const svgHolder = col.createDiv({ cls: "oneday-svg-holder" })
  svgHolder.innerHTML = renderTimelineSvg(doc, { ...opts, width: baseWidth })
  // 宽度/浮动必须设在宿主 el 上：Obsidian 的代码块宿主默认通栏，
  // 子元素浮动不会让出左侧空间（yyt 2026-08-17 反馈）。
  // 在 callout（> [!x|right]）内时浮动由 callout 主导（Live Preview 唯一可行路径），
  // 我们只提供内容宽度，callout shrink-to-fit。
  const inCallout = el.closest(".callout") !== null
  el.style.width = hasText ? "100%" : `${baseWidth + SIDE_LANE_W}px`
  el.classList.add("oneday-host")
  el.classList.toggle("oneday-host-float", Boolean(doc.floatRight) && !inCallout)

  const stats = statsByType(doc.entries)
  if (stats.length > 0) {
    col.createDiv({
      cls: "oneday-stats",
      text: stats.map((s) => `${s.type} ${formatHours(s.minutes)}`).join(" · "),
    })
  }

  const unknown = [...new Set(doc.entries.map((e) => e.type).filter((t) => !(t in opts.typeColors)))]
  if (unknown.length > 0) {
    col.createDiv({
      cls: "oneday-warning",
      text: `未登记类型（显示为 ${FALLBACK_COLOR} 灰色）：${unknown.join(", ")}`,
    })
  }

  if (doc.errors.length > 0) {
    const box = col.createDiv({ cls: "oneday-errors" })
    for (const err of doc.errors) {
      box.createDiv({ text: `第 ${err.line + 1} 行：${err.reason}${err.text ? `（${err.text.trim()}）` : ""}` })
    }
  }

  return container
}
