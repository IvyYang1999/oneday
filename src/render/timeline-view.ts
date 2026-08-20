/** Optional text-pane wiring (块内图文混排): render markdown + edit affordance. */
export interface TextPaneDeps {
  /** Render doc.text markdown into the pane (Obsidian MarkdownRenderer). */
  renderMarkdown: (host: HTMLElement, text: string) => void
  /** Persist edited text（第 index 个文本区） */
  onSave: (index: number, text: string) => void
}

/** DOM mount: svg string + stats row + error list, into a code-block container. */
import { TimelineDoc } from "../core/types"
import { statsByType } from "../core/stats"
import { formatHours } from "../core/duration"
import { renderTimelineSvg, RenderOptions, SIDE_LANE_W } from "./svg-builder"
import { hashTypeColor } from "../core/type-colors"
import { relatedTextColor } from "../core/contrast"
import { GRID_COLS, GRID_ROW_H, gridRows, isTextSlot, resolveGrid } from "../core/grid-layout"

interface InlineEditorDeps {
  renderMarkdown: (host: HTMLElement, text: string) => void
  onSave: (text: string) => void
}

/** 文字区原地编辑：点击渲染区 -> textarea；失焦/⌘Enter 保存，Esc 取消（yyt：不要弹窗）。 */
function attachInlineTextEditor(pane: HTMLElement, text: string, deps: InlineEditorDeps): void {
  const dom = pane.ownerDocument
  const domWindow = dom.defaultView
  const show = (): void => {
    pane.closest(".oneday-slot")?.classList.remove("is-editing")
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
    pane.closest(".oneday-slot")?.classList.add("is-editing")
    const ta = pane.createEl("textarea", { cls: "oneday-text-inline" })
    ta.value = text
    const fit = (): void => {
      ta.style.height = "0px"
      ta.style.height = `${ta.scrollHeight}px`
    }
    ta.addEventListener("input", fit)
    fit() // 同步定高：setTimeout 会先画一帧默认高度，产生闪烁（yyt 2026-08-19）
    const commit = (): void => {
      if (ta.value === text) {
        show() // 没变就不写回，避免无谓重渲染
        return
      }
      deps.onSave(ta.value)
    }
    // 容器级 focusout（专家方案）：焦点离开整个文字区才提交
    pane.addEventListener("focusout", () => {
      domWindow?.setTimeout(() => {
        if (pane.querySelector("textarea") && !pane.contains(dom.activeElement)) commit()
      }, 0)
    })
    let esc = false
    ta.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        commit()
        show()
      } else if (e.key === "Escape") {
        esc = true
        show()
      }
    })
    void esc
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
  const domWindow = container.ownerDocument.defaultView

  const baseWidth = doc.width ?? opts.width ?? 200
  const texts = doc.texts ?? []
  const hasText = textPane !== undefined && texts.length > 0
  const body = container.createDiv({ cls: "oneday-body is-settling" })

  // 网格布局（yyt 2026-08-17：组件手柄拖拽移动+缩放、自动吸附+重力压实）：
  // 12 列 x 20px 行，组件几何存 dataset，交互由 main 接 attachGridInteract
  // 时间轴默认行数取 SVG 实际高度（含标注车道撑高），避免底部截断
  const timelineSvg = renderTimelineSvg(doc, { ...opts, width: baseWidth })
  const svgHeight = Number(/<svg[^>]*height="([\d.]+)"/.exec(timelineSvg)?.[1] ?? 800)
  const timelineRows = Math.ceil(svgHeight / GRID_ROW_H)
  const items = resolveGrid(doc.layout ?? null, texts.length, doc.side, timelineRows, doc.hiddenSlots)
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
    } else if (isTextSlot(it.id) && textPane) {
      const idx = it.id === "text" ? 0 : Number(it.id.slice(4)) - 1
      const pane = slot.createDiv({ cls: "oneday-text-pane" })
      attachInlineTextEditor(pane, texts[idx] ?? "", {
        renderMarkdown: (host, text) => textPane.renderMarkdown(host, text),
        onSave: (text) => textPane.onSave(idx, text),
      })
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

  const statsSlot = container.querySelector(".oneday-slot-stats") // 被 off: 隐藏时不兜底渲染
  const stats = statsByType(doc.entries)
  if (stats.length > 0 && statsSlot) {
    // 每行一个类型 + 荧光笔色点（yyt 2026-08-17）
    const box = (statsSlot as HTMLElement).createDiv({ cls: "oneday-stats" })
    const maxMin = Math.max(...stats.map((st) => st.minutes), 1)
    for (const st of stats) {
      const row = box.createDiv({ cls: "oneday-stat-row" })
      row.createEl("span", { cls: "oneday-stat-type", text: st.type })
      const barWrap = row.createDiv({ cls: "oneday-stat-bar-wrap" })
      const color = opts.typeColors[st.type] ?? hashTypeColor(st.type)
      const pct = Math.max(3, (st.minutes / maxMin) * 100)
      const bar = barWrap.createDiv({ cls: "oneday-stat-bar" })
      bar.style.background = color
      bar.style.width = `${pct}%`
      // 先放柱内，挂载后实测：装不下就挪柱外（百分比阈值对不上像素，yyt 2026-08-19）
      const label = bar.createEl("span", { cls: "oneday-stat-hours", text: formatHours(st.minutes) })
      label.style.color = relatedTextColor(color)
      domWindow?.requestAnimationFrame(() => {
        if (label.offsetWidth + 10 > bar.clientWidth) {
          label.classList.add("oneday-stat-hours-out")
          label.style.color = ""
          barWrap.appendChild(label)
        }
      })
    }
  }

  if (doc.errors.length > 0 && statsSlot) {
    const box = (statsSlot as HTMLElement).createDiv({ cls: "oneday-errors" })
    for (const err of doc.errors) {
      box.createDiv({ text: `第 ${err.line + 1} 行：${err.reason}${err.text ? `（${err.text.trim()}）` : ""}` })
    }
  }

  return container
}
