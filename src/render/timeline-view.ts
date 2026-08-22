/** Optional text-pane wiring (块内图文混排): render markdown + edit affordance. */
export interface TextPaneDeps {
  /** Render doc.text markdown into the pane (Obsidian MarkdownRenderer). */
  renderMarkdown: (host: HTMLElement, text: string) => void
  /** Persist edited text（第 index 个文本区） */
  onSave: (index: number, text: string) => void | Promise<void>
}

/** DOM mount: svg string + stats row + error list, into a code-block container. */
import { TimelineDoc } from "../core/types"
import { statsByType } from "../core/stats"
import { formatHours } from "../core/duration"
import { renderTimelineSvg, RenderOptions, SIDE_LANE_W } from "./svg-builder"
import { hashTypeColor } from "../core/type-colors"
import { relatedTextColor } from "../core/contrast"
import { GRID_ROW_H, gridRows, isTextSlot, resolveGrid } from "../core/grid-layout"
import { applyGridToBody } from "../edit/grid-interact"

interface InlineEditorDeps {
  renderMarkdown: (host: HTMLElement, text: string) => void
  onSave: (text: string) => void | Promise<void>
}

export interface TimelineViewOptions extends RenderOptions {
  /** 仅给真正的新用户展示一次的时间轴拖拽引导。 */
  showTimelineOnboarding?: boolean
}

const TEXT_EDITOR_FLUSH_EVENT = "oneday:text-editor-flush"

/** Commit every dirty inline text editor below root before its DOM is replaced. */
export function flushInlineTextEditors(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".oneday-text-pane").forEach((pane) => {
    const event = pane.ownerDocument.createEvent("Event")
    event.initEvent(TEXT_EDITOR_FLUSH_EVENT, false, false)
    pane.dispatchEvent(event)
  })
}

/** 文字区原地编辑：点击渲染区 -> textarea；失焦/⌘Enter 保存，Esc 取消（yyt：不要弹窗）。 */
export function attachInlineTextEditor(pane: HTMLElement, text: string, deps: InlineEditorDeps): void {
  const dom = pane.ownerDocument
  const domWindow = dom.defaultView
  let detachFocusout: (() => void) | null = null
  let detachResizeGuard: (() => void) | null = null
  let detachLifecycle: (() => void) | null = null
  const show = (): void => {
    detachFocusout?.()
    detachFocusout = null
    detachResizeGuard?.()
    detachResizeGuard = null
    detachLifecycle?.()
    detachLifecycle = null
    pane.closest(".oneday-slot")?.classList.remove("is-editing")
    pane.empty()
    if (text.trim() === "") {
      pane.createDiv({ cls: "oneday-text-placeholder", text: "点击书写…" })
    } else {
      const host = pane.createDiv({ cls: "oneday-text-host" })
      deps.renderMarkdown(host, text)
    }
  }
  const edit = (): void => {
    pane.empty()
    pane.closest(".oneday-slot")?.classList.add("is-editing")
    const ta = pane.createEl("textarea", { cls: "oneday-text-inline" })
    ta.value = text
    const slot = pane.closest<HTMLElement>(".oneday-slot")
    let resizing = false
    const onResizeStart = (e: PointerEvent): void => {
      const target = e.target as Element | null
      if (target?.closest(".oneday-handle")) resizing = true
    }
    const onResizeEnd = (): void => {
      if (!resizing) return
      resizing = false
      if (ta.isConnected) ta.focus({ preventScroll: true })
    }
    slot?.addEventListener("pointerdown", onResizeStart, true)
    dom.addEventListener("pointerup", onResizeEnd, true)
    dom.addEventListener("pointercancel", onResizeEnd, true)
    detachResizeGuard = () => {
      slot?.removeEventListener("pointerdown", onResizeStart, true)
      dom.removeEventListener("pointerup", onResizeEnd, true)
      dom.removeEventListener("pointercancel", onResizeEnd, true)
    }
    const fit = (): void => {
      const scroller = pane
      const scrollTop = scroller.scrollTop
      const oldMax = scroller.scrollHeight - scroller.clientHeight
      const wasAtBottom = scrollTop >= oldMax - 2
      ta.style.height = "0px"
      ta.style.height = `${ta.scrollHeight}px`
      // Measuring via 0px briefly collapses the overflow content and the browser
      // clamps its parent scrollTop to 0. Restore the user's viewport immediately;
      // when editing at the end, follow the newly grown bottom instead.
      scroller.scrollTop = wasAtBottom
        ? scroller.scrollHeight - scroller.clientHeight
        : scrollTop
    }
    ta.addEventListener("input", fit)
    fit() // 同步定高：setTimeout 会先画一帧默认高度，产生闪烁（yyt 2026-08-19）
    let finished = false
    let committing = false
    const commit = (): void => {
      if (finished || committing) return
      if (ta.value === text) {
        finished = true
        show() // 没变就不写回，避免无谓重渲染
        return
      }
      committing = true
      const submitted = ta.value
      void Promise.resolve().then(() => deps.onSave(submitted)).then(() => {
        // 输入极快时，保存进行中可能又出现新字符；继续提交最新值，不能
        // 因为前一笔已经成功就把后来的字符视为已保存。
        if (ta.value !== submitted) {
          committing = false
          commit()
          return
        }
        finished = true
        detachFocusout?.()
        detachFocusout = null
        detachResizeGuard?.()
        detachResizeGuard = null
        detachLifecycle?.()
        detachLifecycle = null
      }).catch((error: unknown) => {
        committing = false
        // 保留 textarea、内容和全部提交监听，用户可以在源码稳定后再次失焦重试。
        console.error("Oneday: failed to save inline text; draft kept in editor", error)
        if (ta.isConnected) ta.focus({ preventScroll: true })
      })
    }
    // 容器级 focusout（专家方案）：焦点离开整个文字区才提交
    const onFocusout = (): void => {
      domWindow?.setTimeout(() => {
        if (!resizing && pane.querySelector("textarea") && !pane.contains(dom.activeElement)) commit()
      }, 0)
    }
    pane.addEventListener("focusout", onFocusout)
    detachFocusout = () => pane.removeEventListener("focusout", onFocusout)
    // macOS 切到另一应用时，textarea 可能仍是 document.activeElement，因而
    // 不产生 focusout。窗口隐藏、页面卸载和组件重绘也都必须先提交草稿。
    const onWindowBlur = (): void => commit()
    const onVisibilityChange = (): void => {
      if (dom.visibilityState === "hidden") commit()
    }
    const onPageHide = (): void => commit()
    const onForcedFlush = (): void => commit()
    domWindow?.addEventListener("blur", onWindowBlur)
    domWindow?.addEventListener("pagehide", onPageHide)
    dom.addEventListener("visibilitychange", onVisibilityChange)
    pane.addEventListener(TEXT_EDITOR_FLUSH_EVENT, onForcedFlush)
    detachLifecycle = () => {
      domWindow?.removeEventListener("blur", onWindowBlur)
      domWindow?.removeEventListener("pagehide", onPageHide)
      dom.removeEventListener("visibilitychange", onVisibilityChange)
      pane.removeEventListener(TEXT_EDITOR_FLUSH_EVENT, onForcedFlush)
    }
    ta.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        commit()
      } else if (e.key === "Escape") {
        show()
      }
    })
    ta.focus()
  }
  // 文字内容通常比槽位矮；编辑入口必须覆盖整个文字面板，而不只是字形本身。
  // 编辑态和链接/控件点击保持原行为，避免 textarea 被点击时重新创建。
  pane.addEventListener("click", (e: MouseEvent) => {
    if (pane.querySelector("textarea")) return
    const target = e.target as Element | null
    if (target?.closest("a, button, input, textarea")) return
    edit()
  })
  show()
}

export function renderTimelineInto(
  el: HTMLElement,
  doc: TimelineDoc,
  opts: TimelineViewOptions,
  textPane?: TextPaneDeps
): HTMLElement {
  const container = el.createDiv({ cls: "oneday-container" })
  const domWindow = container.ownerDocument.defaultView

  const baseWidth = doc.width ?? opts.width ?? 200
  const texts = doc.texts ?? []
  const hasText = textPane !== undefined && texts.length > 0
  const blockScroll = container.createDiv({ cls: "oneday-block-scroll" })
  const body = blockScroll.createDiv({ cls: "oneday-body is-settling" })
  if (doc.canvasWidth !== undefined) body.dataset.gridBaseWidth = String(doc.canvasWidth)

  // 网格布局（yyt 2026-08-17：组件手柄拖拽移动+缩放、自动吸附+重力压实）：
  // 12 列 x 20px 行，组件几何存 dataset，交互由 main 接 attachGridInteract
  // 时间轴默认行数取 SVG 实际高度（含标注车道撑高），避免底部截断
  const timelineSvg = renderTimelineSvg(doc, { ...opts, width: baseWidth })
  const svgHeight = Number(/<svg[^>]*height="([\d.]+)"/.exec(timelineSvg)?.[1] ?? 800)
  const timelineRows = Math.ceil(svgHeight / GRID_ROW_H)
  const stats = statsByType(doc.entries)
  const emptyStatsRows = stats.length === 0 && doc.errors.length === 0 ? 2 : 1
  const pristine = texts.length === 0 && doc.entries.length === 0 && doc.errors.length === 0
  const items = resolveGrid(
    doc.layout ?? null,
    texts.length,
    doc.side,
    timelineRows,
    doc.hiddenSlots,
    emptyStatsRows,
    pristine
  )
  body.style.height = `${gridRows(items) * GRID_ROW_H}px`
  for (const it of items) {
    const slot = body.createDiv({ cls: `oneday-slot oneday-slot-${it.id}` })
    slot.dataset.slot = it.id
    slot.dataset.x = String(it.x)
    slot.dataset.y = String(it.y)
    slot.dataset.w = String(it.w)
    slot.dataset.h = String(it.h)
    if (it.id === "timeline") {
      const svgHolder = slot.createDiv({ cls: "oneday-svg-holder" })
      svgHolder.innerHTML = timelineSvg
      if (
        opts.showTimelineOnboarding
        && Object.keys(opts.typeColors).length > 0
        && doc.entries.length === 0
        && doc.errors.length === 0
      ) {
        const guide = svgHolder.createDiv({ cls: "oneday-timeline-onboarding" })
        guide.setAttribute("role", "note")
        // 引导严格收在真实轨道内；它演示“从一点拖到另一点”的手势，
        // 不伪装成已经创建好的色块，也不成为常驻空状态。
        const track = svgHolder.querySelector<SVGRectElement>("rect.oneday-track")
        const trackX = Number(track?.getAttribute("x"))
        const trackY = Number(track?.getAttribute("y"))
        const trackW = Number(track?.getAttribute("width"))
        const trackH = Number(track?.getAttribute("height"))
        const hourHeight = opts.hourHeight ?? 48
        if ([trackX, trackY, trackW, trackH].every(Number.isFinite)) {
          const inset = 8
          const guideH = Math.min(Math.max(72, hourHeight * 2), Math.max(56, trackH - inset * 2))
          const preferredTop = trackY + hourHeight
          const guideTop = Math.min(preferredTop, trackY + trackH - guideH - inset)
          guide.style.left = `${trackX + inset}px`
          guide.style.top = `${Math.max(trackY + inset, guideTop)}px`
          guide.style.width = `${Math.max(1, trackW - inset * 2)}px`
          guide.style.height = `${guideH}px`
        }
        const gesture = guide.createDiv({ cls: "oneday-timeline-onboarding-gesture" })
        gesture.setAttribute("aria-hidden", "true")
        gesture.createEl("span", { cls: "oneday-timeline-onboarding-dot is-start" })
        gesture.createEl("span", { cls: "oneday-timeline-onboarding-line" })
        gesture.createEl("span", { cls: "oneday-timeline-onboarding-dot is-end" })
        gesture.createEl("span", { cls: "oneday-timeline-onboarding-label is-start", text: "起点" })
        gesture.createEl("span", { cls: "oneday-timeline-onboarding-label is-end", text: "终点" })
        guide.createEl("span", { cls: "oneday-timeline-onboarding-copy", text: "从起点拖到终点" })
      }
    } else if (isTextSlot(it.id) && textPane) {
      const idx = it.id === "text" ? 0 : Number(it.id.slice(4)) - 1
      const pane = slot.createDiv({ cls: "oneday-text-pane" })
      attachInlineTextEditor(pane, texts[idx] ?? "", {
        renderMarkdown: (host, text) => textPane.renderMarkdown(host, text),
        onSave: (text) => textPane.onSave(idx, text),
      })
    }
  }
  applyGridToBody(body, items)
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

  const statsSlot = container.querySelector<HTMLElement>(".oneday-slot-stats") // 被 off: 隐藏时不兜底渲染
  statsSlot?.classList.toggle("is-empty-state", stats.length === 0 && doc.errors.length === 0)
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
  } else if (statsSlot && doc.errors.length === 0) {
    const empty = statsSlot.createDiv({ cls: "oneday-stats-empty" })
    empty.setAttribute("role", "note")
    empty.createEl("span", {
      cls: "oneday-stats-empty-label",
      text: "创建记录后，这里会显示用时分布",
    })
  }

  if (doc.errors.length > 0 && statsSlot) {
    const box = (statsSlot as HTMLElement).createDiv({ cls: "oneday-errors" })
    for (const err of doc.errors) {
      box.createDiv({ text: `第 ${err.line + 1} 行：${err.reason}${err.text ? `（${err.text.trim()}）` : ""}` })
    }
  }

  return container
}
