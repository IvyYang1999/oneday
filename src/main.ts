import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownRenderer, MarkdownView, Menu, Notice, Platform, Plugin, setIcon, TFile } from "obsidian"
import { normalizeSpan, parseTimeline } from "./core/parser"
import { formatClockPlain, formatEntryLine, weekdayZh } from "./core/format"
import { FALLBACK_COLOR } from "./render/svg-builder"
import { hashTypeColor, pickVisibleType } from "./core/type-colors"
import { flushInlineTextEditors, renderTimelineInto } from "./render/timeline-view"
import { DEFAULT_SETTINGS, OnedaySettings, OnedaySettingTab } from "./settings"
import { attachDialog } from "./agent/dialog"
import { addHiddenType, addOffSlot, deleteEntryLine, extractBlockSourceFromContent, insertEntryLine, removeHeaderValue, removeHiddenType, removeOffSlot, removeTextSection, replaceBlockInContent, replaceEntryLine, setHeaderValue, setTextSection } from "./edit/source-rewriter"
import { buildLayerToggles, buildToolbar, LayerView } from "./edit/toolbar"
import { attachDrawInteraction } from "./edit/draw-interaction"
import { showBlockMenu } from "./edit/block-menu"
import { attachHoverInfo, toggleBlockFocus } from "./edit/hover-info"
import { applyGridToBody, attachGridInteract } from "./edit/grid-interact"
import { compactGrid, GRID_COLS, GRID_ROW_H, gridRows, GridItem, MAX_GRID_COLS, serializeLayoutHeader } from "./core/grid-layout"
import { inferDate, insertTimelineBlock } from "./insert"
import { attachWidthHandle } from "./edit/width-handle"
import { openNotePopover } from "./edit/note-popover"
import { openTimePopover } from "./edit/time-popover"
import { SIDE_LANE_W } from "./render/svg-builder"
import { showActionMenuAtPoint } from "./edit/custom-menu"
import { MountedTimelineRegistry } from "./render/mounted-timeline-registry"
import { attachBlockResize } from "./edit/block-resize"
import { serializeBlockSize } from "./core/block-size"
import { shouldLeaveUndoToFocusedEditor } from "./edit/undo-routing"
import { decideTimelineOnboarding, resolveTimelineOnboardingSeen } from "./core/onboarding"

class MountedTimelineChild extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly dispose: () => void,
    private readonly flush: () => void
  ) {
    super(containerEl)
  }

  onunload(): void {
    this.flush()
    this.dispose()
  }
}

/**
 * Oneday — highlighter-style daily timeline block.
 * Markdown source is the single source of truth (mermaid-style dual view).
 * M1 渲染 / M2 对话框 / M3 画板编辑（选荧光笔→拖色块→写回；右键菜单）。
 */
export default class OnedayPlugin extends Plugin {
  settings: OnedaySettings = DEFAULT_SETTINGS
  private readonly mountedTimelines = new MountedTimelineRegistry()

  private parse(source: string) {
    return parseTimeline(source, {
      rangeStart: this.settings.rangeStartHour * 60,
      rangeEnd: this.settings.rangeEndHour * 60,
    })
  }
  /** Currently selected highlighter (session-scoped). */
  private activeType = ""
  /** 荧光笔模式：画记录/画计划（session-scoped） */
  private drawMode: "actual" | "plan" = "actual"
  /** 图层视图：记录/计划各自独立点亮，都亮=全部（session-scoped） */
  private layerView: LayerView = { actual: true, plan: true }
  /** 色块编辑态（跨渲染保持；Esc/点别处退出） */
  private editing: { path: string; line: number } | null = null
  /** 视图类即时切换（LP/阅读模式都生效，不依赖重渲染） */
  private applyViewClass(container: HTMLElement, view: LayerView): void {
    container.classList.remove("oneday-view-all", "oneday-view-actual", "oneday-view-plan", "oneday-view-none")
    const cls = view.actual && view.plan ? "all" : view.actual ? "actual" : view.plan ? "plan" : "none"
    container.classList.add(`oneday-view-${cls}`)
  }

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new OnedaySettingTab(this.app, this))

    // 插入入口：命令面板 + 编辑器右键菜单
    this.addCommand({
      id: "insert-timeline-block",
      name: "插入 Oneday 时间轴块",
      editorCallback: (editor) => {
        insertTimelineBlock(editor, this.app.workspace.getActiveFile()?.basename ?? null, this.insertTemplate())
      },
    })
    // 撤销/重做兜底按窗口注册：弹出窗口拥有独立 Document。
    const undoDocs = new WeakSet<Document>()
    const registerUndo = (dom: Document): void => {
      if (undoDocs.has(dom)) return
      undoDocs.add(dom)
      this.registerDomEvent(dom, "keydown", (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return
        const target = e.target as Element | null
        if (shouldLeaveUndoToFocusedEditor(target)) return
        let owningView: MarkdownView | null = null
        if (target) {
          this.app.workspace.iterateAllLeaves((leaf) => {
            if (owningView) return
            const candidate = leaf.view
            if (candidate instanceof MarkdownView && candidate.containerEl.contains(target)) owningView = candidate
          })
        }
        const view = owningView ?? this.app.workspace.getActiveViewOfType(MarkdownView)
        if (!view) return
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) view.editor.redo()
        else view.editor.undo()
      }, { capture: true })
    }
    registerUndo(document)
    this.app.workspace.iterateAllLeaves((leaf) => registerUndo(leaf.view.containerEl.ownerDocument))
    this.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, popoutWindow) => {
      registerUndo(popoutWindow.document)
    }))

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) =>
          item
            .setTitle("插入 Oneday 时间轴")
            .setIcon("calendar-clock")
            .onClick(() => {
              insertTimelineBlock(editor, this.app.workspace.getActiveFile()?.basename ?? null, this.insertTemplate())
            })
        )
      })
    )

    this.registerMarkdownCodeBlockProcessor("timeline", (source, el, ctx) => {
      const redraw = (): void => {
        flushInlineTextEditors(el)
        const current = el.querySelector<HTMLElement>(".oneday-container")
        if (current) this.captureScroll(ctx, current)
        el.replaceChildren()
        this.renderTimelineBlock(source, el, ctx)
      }
      const unregister = this.mountedTimelines.register(() => {
        if (el.isConnected) redraw()
      })
      ctx.addChild(new MountedTimelineChild(el, unregister, () => flushInlineTextEditors(el)))
      redraw()
    })
  }

  private renderTimelineBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
      const dom = el.ownerDocument
      const domWindow = dom.defaultView
      const doc = this.parse(source)
      // 渲染色号：全局优先，退休板兜底（删除/改名的类型在旧块里保色）
      const paletteForRender = { ...this.settings.retiredTypeColors, ...this.settings.typeColors }
      const hasAvailableHighlighter = Object.keys(this.settings.typeColors)
        .some((type) => !doc.hiddenTypes.includes(type))
      const onboardingDecision = decideTimelineOnboarding(
        this.settings.timelineOnboardingSeen,
        doc.entries.length,
        doc.errors.length,
        hasAvailableHighlighter
      )
      if (onboardingDecision === "consume") {
        // 已经有记录的人不再是首次创建场景；不要在之后遇到空块时补播教程。
        this.settings.timelineOnboardingSeen = true
        void this.saveSettings()
      }
      const showTimelineOnboarding = onboardingDecision === "show"
      const saveText = async (index: number, text: string): Promise<void> => {
        try {
          await this.applyBlockTransform(el, ctx, source, (s) => setTextSection(s, text, index))
        } catch (error) {
          new Notice("Oneday 文字保存失败：草稿仍保留在编辑框，请再次切换焦点重试", 8000)
          throw error
        }
      }
      const container = renderTimelineInto(
        el,
        doc,
        {
          typeColors: paletteForRender,
          hourHeight: this.settings.hourHeight,
          width: this.settings.width,
          showTimelineOnboarding,
        },
        {
          renderMarkdown: (host, text) => {
            // 单换行 -> markdown 硬换行（行尾两空格）：无论 Obsidian 段落策略如何，
            // 单换行都留在同一段落内，p+p 间距只对应源码真正的空行（yyt 2026-08-19）
            const normalized = text.replace(/(?<!\n)\n(?!\n)/g, "  \n")
            void MarkdownRenderer.render(this.app, normalized, host, ctx.sourcePath, this)
          },
          onSave: saveText,
        }
      )
      if (showTimelineOnboarding) {
        // 先同步关掉内存中的门，再异步持久化：同一页面有多个空块时也只展示一次。
        this.settings.timelineOnboardingSeen = true
        void this.saveSettings()
      }
      // 色板 = 全局 ∪ 本块用过的类型（旧块用过的已删类型保留显示，yyt 2026-08-17）
      const usedTypes = [...new Set(doc.entries.map((e) => e.type))]
      const paletteTypes = [...Object.keys(this.settings.typeColors), ...usedTypes.filter((t) => !(t in this.settings.typeColors))]
      const paletteColors = Object.fromEntries(paletteTypes.map((t) => [t, paletteForRender[t] ?? hashTypeColor(t)]))
      const visibleTypes = paletteTypes.filter((t) => !doc.hiddenTypes.includes(t))
      // 可用类型属于“这个 block”的状态；不能让一个全隐藏 block 把同页其它
      // block 的画笔清空，也不能让其它 block 的偏好穿透进全隐藏 block。
      let blockActiveType = pickVisibleType(this.activeType, visibleTypes)
      if (this.activeType === "" && blockActiveType) this.activeType = blockActiveType

      const slotLabels: Record<string, string> = {
        toolbar: "荧光笔",
        stats: "统计",
        dialog: "快速记录",
      }

      const showMoreMenu = (x: number, y: number): void => {
        const menu = new Menu()
        menu.addItem((item) => item.setTitle("组件").setIsLabel(true).setSection("components"))
        // 添加文本框（常驻，可多个；落在点击的格子附近）
        menu.addItem((item) =>
          item.setTitle("添加文本框").setIcon("file-plus-2").setSection("components").onClick(() => {
            void this.applyBlockTransform(el, ctx, source, (s) => {
              const newId = doc.texts.length === 0 ? "text" : `text${doc.texts.length + 1}`
              let out = setTextSection(s, "", doc.texts.length) // 追加空文本区
              if (body) {
                const bodyRect = body.getBoundingClientRect()
                if (bodyRect.width > 100) {
                  const columns = Number(body.dataset.gridCols) || GRID_COLS
                  const cellW = bodyRect.width / columns
                  const gx = Math.min(MAX_GRID_COLS - 6, Math.max(0, Math.floor((x - bodyRect.left) / cellW)))
                  const gy = Math.max(0, Math.floor((y - bodyRect.top) / GRID_ROW_H))
                  const items = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot")).map((sl) => ({
                    id: sl.dataset.slot as GridItem["id"],
                    x: Number(sl.dataset.x), y: Number(sl.dataset.y), w: Number(sl.dataset.w), h: Number(sl.dataset.h),
                  }))
                  items.push({ id: newId, x: gx, y: gy, w: 6, h: 4 })
                  out = setHeaderValue(out, "layout", serializeLayoutHeader(compactGrid(items, newId)))
                }
              }
              return out
            })
          })
        )
        // 隐藏组件恢复（off: 头）
        for (const slotId of doc.hiddenSlots) {
          menu.addItem((item) =>
            item.setTitle(`显示「${slotLabels[slotId] ?? slotId}」`).setIcon("eye").setSection("components").onClick(() => {
              void this.applyBlockTransform(el, ctx, source, (s) => removeOffSlot(s, slotId))
            })
          )
        }
        menu.addSeparator()
        menu.addItem((item) => item.setTitle("布局").setIsLabel(true).setSection("layout"))
        menu.addItem((item) =>
          item.setTitle("将当前布局设为新块默认").setIcon("bookmark").setSection("layout").onClick(() => {
            if (body) {
              const items = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot")).map((sl) => ({
                id: sl.dataset.slot as GridItem["id"],
                x: Number(sl.dataset.x), y: Number(sl.dataset.y), w: Number(sl.dataset.w), h: Number(sl.dataset.h),
              }))
              this.settings.templateLayout = serializeLayoutHeader(items)
            }
            this.settings.templateWidth = doc.width
            this.settings.templateHasText = doc.texts.length > 0
            void this.saveSettings()
          })
        )
        menu.addItem((item) =>
          item.setTitle("重新排列当前块（重置位置和大小）").setIcon("layout-grid").setSection("layout").onClick(() => {
            void this.applyBlockTransform(el, ctx, source, (s) => removeHeaderValue(s, "layout"))
          })
        )
        menu.showAtPosition({ x, y }, dom)
      }

      const editNote = (ln: number): void => {
        // 写回触发的重渲染可能已替换 container（detached DOM 上挂浮窗不可见，yyt 2026-08-19）
        const live = container.isConnected ? container : dom.querySelector<HTMLElement>(".oneday-container")
        if (!live) return
        const rect = live.querySelector(`rect.oneday-block[data-line="${ln}"]`)
        const e0 = doc.entries.find((it) => it.line === ln)
        if (!rect || !e0) return
        openNotePopover(live, rect, rect.getBoundingClientRect(), e0.note ?? "", (note) => {
          void this.applyBlockTransform(el, ctx, source, (s) => {
            const e = this.parse(s).entries.find((it) => it.line === ln)
            if (!e) return s
            return replaceEntryLine(s, ln, formatEntryLine({ ...e, note: note || undefined }))
          })
        })
      }

      const toolbar = buildToolbar({
        typeColors: paletteColors,
        hiddenTypes: doc.hiddenTypes,
        activeType: blockActiveType,
        brushMode: this.drawMode,
        onBrushModeChange: (mode) => {
          this.drawMode = mode
        },
        onSelect: (type) => {
          blockActiveType = type
          this.activeType = type
        },
        onHide: (type) => {
          void this.applyBlockTransform(el, ctx, source, (s) => addHiddenType(s, type))
        },
        onShow: (type) => {
          void this.applyBlockTransform(el, ctx, source, (s) => removeHiddenType(s, type))
        },
        onAddNew: () => this.openSettings(),
        domDocument: dom,
      })
      // 填槽：工具栏/状态行/对话框各就各位（插槽位置由 layout 决定）
      const toolbarSlot = container.querySelector<HTMLElement>(".oneday-slot-toolbar")
      if (toolbarSlot) {
        toolbarSlot.classList.toggle("is-empty-state", toolbar.el.classList.contains("is-empty"))
        toolbarSlot.appendChild(toolbar.el)
      }
      const timelineSlot = container.querySelector<HTMLElement>(".oneday-slot-timeline")
      if (timelineSlot) {
        timelineSlot.appendChild(toolbar.statusEl)
        // 顶栏：日期+星期（跨期统计锚点）在左，记录/计划开关在右
        const topbar = dom.createElement("div")
        topbar.className = "oneday-timeline-topbar" // 宽度跟随元素块（槽位），非时间轴矩形
        const dateStr = doc.date ?? (() => {
          const base = this.app.workspace.getActiveFile()?.basename ?? ""
          return /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.test(base) ? inferDate(base) : null
        })()
        if (dateStr) {
          const dateEl = dom.createElement("span")
          dateEl.className = "oneday-date-row"
          const wd = weekdayZh(dateStr)
          dateEl.textContent = `${dateStr}${wd ? " " + wd : ""}`
          topbar.appendChild(dateEl)
        }
        topbar.appendChild(buildLayerToggles(this.layerView, (view) => {
          this.layerView = view
          this.applyViewClass(container, view)
          // 只剩单图层时联动画笔（都亮则不动，画笔可独立切）
          if (view.actual && !view.plan) this.drawMode = "actual"
          else if (view.plan && !view.actual) this.drawMode = "plan"
          toolbar.setBrushMode(this.drawMode)
        }, dom))
        timelineSlot.prepend(topbar)
      }
      const col = container.querySelector(".oneday-timeline-col")
      const body = container.querySelector<HTMLElement>(".oneday-body")
      if (body) {
        attachBlockResize(container, body, {
          initialSize: doc.blockSize,
          initialCanvasWidth: doc.canvasWidth,
          onCommit: (size, canvasWidth) => {
            void this.applyBlockTransform(el, ctx, source, (s) => {
              let out = setHeaderValue(s, "block-size", serializeBlockSize(size))
              out = setHeaderValue(out, "canvas-width", String(canvasWidth))
              return out
            })
          },
        })
      }
      // 自动量高：内容比格子高的槽位撑开格子（修新建块截断），只改显示不自动写源码
      this.fitSlotHeights(container)
      this.restoreScroll(ctx.sourcePath, container)
      // 初始调整全部完成后开启动画（is-settling 期间槽位不过渡，杀创建闪缩）
      domWindow?.setTimeout(() => body?.classList.remove("is-settling"), 350)

      // 网格组件交互：拖拽移动 + 八向缩放，写回 layout 头——所有块可用
      if (body) {
        attachGridInteract(body, (items) => {
          void this.applyBlockTransform(el, ctx, source, (s) =>
            setHeaderValue(s, "layout", serializeLayoutHeader(items))
          )
        })
      }

      const wireTimeline = (): void => {
        attachHoverInfo(container, doc)
        attachDrawInteraction(container, doc, {
        hourHeight: this.settings.hourHeight,
        getActiveType: () => blockActiveType || null,
        getMode: () => this.drawMode,
        typeColor: (type) => paletteForRender[type] ?? hashTypeColor(type),
        onCreate: (entryLine, startMin) => {
          void this.applyBlockTransform(el, ctx, source, (s) => insertEntryLine(this.persistLayoutOnce(s, doc, container), entryLine, startMin))
        },
        onBlockClick: (line) => {
          toggleBlockFocus(container, line)
        },
        onTrackMenu: (x, y) => {
          showMoreMenu(x, y)
        },
        onExtendRange: (startMin, endMin) => {
          void this.applyBlockTransform(el, ctx, source, (s) =>
            setHeaderValue(s, "range", `${Math.round(startMin / 60)}-${Math.round(endMin / 60)}`)
          )
        },
        onEditNote: (ln) => editNote(ln),
        onDeleteEntry: (ln) => {
          void this.applyBlockTransform(el, ctx, source, (s2) => deleteEntryLine(s2, ln))
        },
        getEditingLine: () => (this.editing?.path === ctx.sourcePath ? this.editing.line : null),
        setEditingLine: (line) => {
          this.editing = line === null ? null : { path: ctx.sourcePath, line }
        },
        onUpdateSpan: (line, startMin, endMin) => {
          void this.applyBlockTransform(el, ctx, source, (s) => {
            const d = this.parse(s)
            const e = d.entries.find((it) => it.line === line)
            if (!e) return s
            return replaceEntryLine(s, line, formatEntryLine({ ...e, startMin, endMin }))
          })
        },
        onBlockMenu: (line, x, y) => {
          const entry = doc.entries.find((e) => e.line === line)
          if (!entry) return
          showBlockMenu(this.app, entry, paletteTypes, x, y, {
            editNote,
            editTimes: (ln) => {
              const live = container.isConnected ? container : dom.querySelector<HTMLElement>(".oneday-container")
              if (!live) return
              const rect = live.querySelector(`rect.oneday-block[data-line="${ln}"]`)
              const e0 = doc.entries.find((it) => it.line === ln)
              if (!rect || !e0) return
              openTimePopover(live, rect, rect.getBoundingClientRect(), {
                start: formatClockPlain(e0.startMin),
                end: formatClockPlain(e0.endMin),
              }, (st, en) => {
                void this.applyBlockTransform(el, ctx, source, (s2) => {
                  const d = this.parse(s2)
                  const e = d.entries.find((it) => it.line === ln)
                  if (!e) return s2
                  const [sh, sm] = st.split(":").map(Number)
                  const [eh, em] = en.split(":").map(Number)
                  const [startMin, endMin] = normalizeSpan(sh * 60 + sm, eh * 60 + em, d.rangeStart)
                  return replaceEntryLine(s2, ln, formatEntryLine({ ...e, startMin, endMin }))
                })
              })
            },
            editSpan: (ln) => {
              this.editing = { path: ctx.sourcePath, line: ln }
              const svgEl = container.querySelector("svg.oneday-svg")
              svgEl?.classList.add("is-editing-block")
              svgEl?.querySelectorAll("rect.oneday-block").forEach((r) => {
                const isTarget = Number((r as HTMLElement).dataset.line) === ln
                r.classList.toggle("is-edit-target", isTarget)
                r.classList.toggle("is-frozen", !isTarget)
              })
              svgEl?.querySelectorAll("rect.oneday-plan-hatch[data-line]").forEach((hatch) => {
                const isTarget = Number((hatch as HTMLElement).dataset.line) === ln
                hatch.classList.toggle("is-frozen", !isTarget)
              })
            },
            setNote: (ln, note) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = this.parse(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, note: note || undefined }))
              }),
            setType: (ln, type) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = this.parse(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, type }))
              }),
            remove: (ln) => void this.applyBlockTransform(el, ctx, source, (s) => deleteEntryLine(s, ln)),
            togglePlan: (ln) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = this.parse(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, plan: !e.plan }))
              }),
          }, dom)
        },
        })
      }

      wireTimeline()
      this.applyViewClass(container, this.layerView)

      // 初始宽度自适应内容：无 layout 头时，时间轴槽位收到内容自然宽（yyt 2026-08-17）
      if (doc.layout === undefined && doc.entries.length > 0 && body) {
        const slotEl = container.querySelector<HTMLElement>(".oneday-slot-timeline")
        if (slotEl) {
          domWindow?.requestAnimationFrame(() => {
            const bodyW = body.getBoundingClientRect().width
            const natural = (doc.width ?? this.settings.width) + SIDE_LANE_W + 8
            if (bodyW > 200 && natural < bodyW * 0.9) {
              const cols = Math.min(GRID_COLS, Math.max(2, Math.round((natural / bodyW) * GRID_COLS)))
              slotEl.dataset.w = String(cols)
              slotEl.style.width = `${(cols / GRID_COLS) * 100}%`
            }
          })
        }
      }

      // 轨道宽度手柄：时间轴本体右缘的窄条，拖了写回 width: 头（yyt：边界要可调）
      attachWidthHandle(container, doc.width ?? this.settings.width, (baseWidth) => {
        void this.applyBlockTransform(el, ctx, source, (s) =>
          setHeaderValue(s, "width", String(baseWidth))
        )
      })

      // 右下角：设置快捷入口。
      const settingsButton = dom.createElement("button")
      settingsButton.type = "button"
      settingsButton.className = "oneday-open-settings"
      setIcon(settingsButton, "settings")
      settingsButton.setAttribute("aria-label", "打开 Oneday 设置")
      settingsButton.addEventListener("click", (e) => {
        e.stopPropagation()
        this.openSettings()
      })
      container.appendChild(settingsButton)

      // 当前 block 的低频附加操作：组件管理 + 布局，不再误用「添加」语义。
      const more = dom.createElement("button")
      more.type = "button"
      more.className = "oneday-more-actions"
      setIcon(more, "ellipsis")
      more.setAttribute("aria-label", "更多操作")
      more.setAttribute("aria-haspopup", "menu")
      more.addEventListener("click", (e) => {
        e.stopPropagation()
        const r = more.getBoundingClientRect()
        showMoreMenu(r.left, r.top)
      })
      container.appendChild(more)

      // 触控端不直接暴露细小手柄：先进入显式布局编辑态，再显示放大的命中区。
      const layoutEdit = dom.createElement("button")
      layoutEdit.type = "button"
      layoutEdit.className = "oneday-layout-edit-toggle"
      layoutEdit.setAttribute("aria-pressed", "false")
      const layoutEditIcon = dom.createElement("span")
      layoutEditIcon.className = "oneday-layout-edit-icon"
      layoutEditIcon.setAttribute("aria-hidden", "true")
      const layoutEditLabel = dom.createElement("span")
      const syncLayoutEdit = (active: boolean): void => {
        container.classList.toggle("is-layout-editing", active)
        layoutEdit.setAttribute("aria-pressed", String(active))
        layoutEdit.setAttribute("aria-label", active ? "完成布局编辑" : "编辑布局")
        layoutEditLabel.textContent = active ? "完成布局" : "编辑布局"
        setIcon(layoutEditIcon, active ? "check" : "pencil-ruler")
      }
      layoutEdit.append(layoutEditIcon, layoutEditLabel)
      layoutEdit.addEventListener("click", (e) => {
        e.stopPropagation()
        syncLayoutEdit(layoutEdit.getAttribute("aria-pressed") !== "true")
      })
      syncLayoutEdit(false)
      container.appendChild(layoutEdit)

      const menuSurface = (el.closest(".cm-embed-block") as HTMLElement | null) ?? container
      menuSurface.addEventListener("contextmenu", (e: MouseEvent) => {
        const t = e.target as Element | null
        if (t?.closest("button, input, textarea, a, rect, .oneday-text-host, .oneday-add-menu")) return
        e.preventDefault()
        // 点在组件空白上 -> 提供统一的自制「隐藏」菜单（off: 头，可从更多菜单重新显示）
        const slotEl = t?.closest(".oneday-slot") as HTMLElement | null
        const slotId = slotEl?.dataset.slot
        if (slotId && (slotId === "text" || /^text\d+$/.test(slotId)) && t?.closest(".oneday-text-pane") === null) {
          // 文本框空白处右键 -> 删除此文本框（可 Ctrl+Z 恢复）
          const idx = slotId === "text" ? 0 : Number(slotId.slice(4)) - 1
          const menu = new Menu()
          menu.addItem((mi) =>
            mi.setTitle("删除此文本框").setIcon("trash").onClick(() => {
              void this.applyBlockTransform(el, ctx, source, (s) => {
                let out = removeTextSection(s, idx)
                // layout 头里同步摘掉该槽位
                if (doc.layout) {
                  const remaining = doc.layout.filter((g) => g.id !== slotId)
                  out = setHeaderValue(out, "layout", serializeLayoutHeader(remaining))
                }
                return out
              })
            })
          )
          menu.showAtPosition({ x: e.clientX, y: e.clientY }, dom)
          return
        }
        if (slotId && ["toolbar", "stats", "dialog"].includes(slotId)) {
          showActionMenuAtPoint(
            dom,
            e.clientX,
            e.clientY,
            `${slotLabels[slotId] ?? slotId}组件操作`,
            "隐藏",
            () => {
              void this.applyBlockTransform(el, ctx, source, (s) => addOffSlot(s, slotId))
            }
          )
          return
        }
        showMoreMenu(e.clientX, e.clientY)
      })

      const dialogSlot = container.querySelector<HTMLElement>(".oneday-slot-dialog")
      if ((Platform.isDesktopApp || this.settings.dialogBackend === "api") && dialogSlot) {
        attachDialog(dialogSlot, doc, {
          settings: this.settings,
          openSettings: () => {
            // @ts-expect-error 内部 API
            this.app.setting?.open?.()
            // @ts-expect-error 内部 API
            this.app.setting?.openTabById?.("oneday")
          },
          writeActions: (actions) =>
            this.applyBlockTransform(el, ctx, source, (s) => {
              let out = this.persistLayoutOnce(s, doc, container)
              for (const a of actions) {
                if (a.kind === "create") {
                  out = insertEntryLine(out, a.entry.sourceLine, a.entry.startMin)
                  continue
                }
                // target 是请求时刻的编号；写入时按当前源码重取（时间排序、plan 除外）
                const d = this.parse(out)
                const target = d.entries.filter((e) => !e.plan).sort((x, y) => x.startMin - y.startMin)[a.targetIndex]
                if (!target) continue
                if (a.kind === "delete") {
                  out = deleteEntryLine(out, target.line)
                } else {
                  const [startMin, endMin] = normalizeSpan(
                    a.patch.startMin ?? target.startMin,
                    a.patch.endMin ?? target.endMin,
                    d.rangeStart
                  )
                  out = replaceEntryLine(out, target.line, formatEntryLine({
                    ...target,
                    startMin,
                    endMin,
                    type: a.patch.type ?? target.type,
                    note: a.patch.note !== undefined ? (a.patch.note || undefined) : target.note,
                  }))
                }
              }
              return out
            }),
        })
      }
  }

  /** 无 layout 头的块在首次写入时持久化当前槽位布局（避免每次重渲染重新拟合 -> 闪缩） */
  private persistLayoutOnce(source: string, doc: { layout?: unknown }, container: HTMLElement): string {
    if (doc.layout !== undefined) return source
    const body = container.querySelector<HTMLElement>(".oneday-body")
    if (!body) return source
    const items = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot")).map((sl) => ({
      id: sl.dataset.slot as GridItem["id"],
      x: Number(sl.dataset.x), y: Number(sl.dataset.y), w: Number(sl.dataset.w), h: Number(sl.dataset.h),
    }))
    if (items.length === 0) return source
    return setHeaderValue(source, "layout", serializeLayoutHeader(items))
  }

  private insertTemplate(): { layout?: string; width?: number; hasText?: boolean } {
    return {
      layout: this.settings.templateLayout,
      width: this.settings.templateWidth,
      hasText: this.settings.templateHasText,
    }
  }

  /** Grow slots whose content exceeds their grid height, then re-compact (display-only). */
  private fitSlotHeights(container: HTMLElement): void {
    const run = (): void => {
      const body = container.querySelector<HTMLElement>(".oneday-body")
      if (!body) return
      const slots = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot"))
      let grew = false
      for (const slot of slots) {
        // 文字槽不自动撑高：保持用户拖的尺寸，内部滚动（yyt 2026-08-19）
        if (slot.dataset.slot && /^text\d*$/.test(slot.dataset.slot)) continue
        const need = Math.ceil(slot.scrollHeight / GRID_ROW_H)
        const cur = Number(slot.dataset.h)
        if (need > cur) {
          slot.dataset.h = String(need)
          grew = true
        }
      }
      if (!grew) return
      const items = compactGrid(slots.map((s) => ({
        id: s.dataset.slot as GridItem["id"],
        x: Number(s.dataset.x), y: Number(s.dataset.y), w: Number(s.dataset.w), h: Number(s.dataset.h),
      })))
      applyGridToBody(body, items)
      body.style.height = `${gridRows(items) * GRID_ROW_H}px`
    }
    run()
    // 二次量高去重：渲染频繁时定时器堆积会造成重排风暴（性能审计 2026-08-19）
    if (!container.dataset.onedayFitPending) {
      container.dataset.onedayFitPending = "1"
      container.ownerDocument.defaultView?.setTimeout(() => {
        delete container.dataset.onedayFitPending
        run()
      }, 300)
    }
  }

  /** 写回前的滚动位置（block 双向 + text 槽内部 + 编辑器页面），渲染后恢复。 */
  private pendingScroll: {
    path: string
    blockLeft: number
    blockTop: number
    textScrolls: number[]
    editor: { top: number; left: number } | null
  } | null = null

  private captureScroll(ctx: MarkdownPostProcessorContext, container: HTMLElement): void {
    const block = container.matches(".oneday-container")
      ? container
      : container.querySelector<HTMLElement>(".oneday-container")
    const blockScroll = block?.querySelector<HTMLElement>(".oneday-block-scroll")
    const textScrolls: number[] = []
    container.querySelectorAll<HTMLElement>(".oneday-slot").forEach((slot) => {
      if (/^text\d*$/.test(slot.dataset.slot ?? "")) {
        textScrolls.push((slot.querySelector<HTMLElement>(".oneday-text-pane") ?? slot).scrollTop)
      }
    })
    const view = this.findMarkdownView(ctx.sourcePath)
    let editor: { top: number; left: number } | null = null
    if (view) {
      const info = view.editor.getScrollInfo()
      editor = { top: info.top, left: info.left }
    }
    this.pendingScroll = {
      path: ctx.sourcePath,
      blockLeft: blockScroll?.scrollLeft ?? 0,
      blockTop: blockScroll?.scrollTop ?? 0,
      textScrolls,
      editor,
    }
  }

  private restoreScroll(path: string, container: HTMLElement): void {
    const p = this.pendingScroll
    if (!p || p.path !== path) return
    this.pendingScroll = null
    const apply = (): void => {
      const blockScroll = container.querySelector<HTMLElement>(".oneday-block-scroll")
      if (blockScroll) {
        blockScroll.scrollLeft = p.blockLeft
        blockScroll.scrollTop = p.blockTop
      }
      const slots = Array.from(container.querySelectorAll<HTMLElement>(".oneday-slot")).filter((s) => /^text\d*$/.test(s.dataset.slot ?? ""))
      slots.forEach((slot, i) => {
        if (p.textScrolls[i] !== undefined) {
          (slot.querySelector<HTMLElement>(".oneday-text-pane") ?? slot).scrollTop = p.textScrolls[i]
        }
      })
      if (p.editor) {
        const view = this.findMarkdownView(path)
        view?.editor.scrollTo(p.editor.left, p.editor.top)
      }
    }
    apply()
    // 等真实的异步渲染落定（MarkdownRenderer.render 的 Promise），不盲猜时长（专家方案）
    const asyncRenders = container.querySelectorAll<HTMLElement>(".oneday-text-host")
    const settle = Array.from(asyncRenders).map((h) => new Promise<void>((resolve) => {
      const MutationObserverCtor = container.ownerDocument.defaultView?.MutationObserver ?? MutationObserver
      const mo = new MutationObserverCtor(() => {
        if (h.childElementCount > 0) { mo.disconnect(); resolve() }
      })
      mo.observe(h, { childList: true })
      container.ownerDocument.defaultView?.setTimeout(() => { mo.disconnect(); resolve() }, 2000) // 兜底上限
    }))
    void Promise.all(settle).then(apply)
  }

  /** Sole write path into markdown (D7/D3 共用): transform block source, splice back. */
  private async applyBlockTransform(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    _source: string,
    transform: (source: string) => string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath)
    if (!(file instanceof TFile)) throw new Error("找不到当前笔记文件")
    const section = ctx.getSectionInfo(el)
    if (!section) throw new Error("无法定位时间轴代码块（试试切换到阅读模式再试）")

    // 优先走编辑器事务（进 CM6 撤销栈，Ctrl+Z 可撤回，yyt 2026-08-17）；
    // 找不到打开的编辑器再退回 vault.process。关键点：每次都从当前编辑器/文件
    // 重新读取块正文，不能用 render 时捕获的 source 覆盖刚刚保存的文字。
    const view = this.findMarkdownView(ctx.sourcePath)
    if (view) {
      const editor = view.editor
      const liveSource = extractBlockSourceFromContent(editor.getValue(), section)
      if (liveSource === null) throw new Error("时间轴源码已变化，无法安全写入；请重试")
      const newSource = transform(liveSource)
      if (newSource === liveSource) return
      this.captureScroll(ctx, el.closest(".oneday-container") as HTMLElement ?? el)
      const openFence = editor.getLine(section.lineStart) ?? ""
      const prefix = /^(\s*(?:>\s*)*)/.exec(openFence)?.[1] ?? ""
      const body = newSource
        .split("\n")
        .map((l) => (l === "" ? prefix.trimEnd() : prefix + l))
        .join("\n")
      editor.replaceRange(body + "\n", { line: section.lineStart + 1, ch: 0 }, { line: section.lineEnd, ch: 0 })
      return
    }
    await this.app.vault.process(file, (content) => {
      const liveSource = extractBlockSourceFromContent(content, section)
      if (liveSource === null) throw new Error("时间轴源码已变化，无法安全写入；请重试")
      const newSource = transform(liveSource)
      if (newSource === liveSource) return content
      this.captureScroll(ctx, el.closest(".oneday-container") as HTMLElement ?? el)
      return replaceBlockInContent(content, section, newSource)
    })
  }

  private findMarkdownView(path: string): MarkdownView | null {
    let found: MarkdownView | null = null
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found) return
      const v = leaf.view
      if (v instanceof MarkdownView && v.file && v.file.path === path) found = v
    })
    return found
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<OnedaySettings> | null
    const hasPersistedSettings = data !== null
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      // 色板不 merge 默认值：有存档就全用存档，否则删除的默认类型会复活（yyt 2026-08-17）
      typeColors: data?.typeColors ?? { ...DEFAULT_SETTINGS.typeColors },
      retiredTypeColors: data?.retiredTypeColors ?? {},
      timelineOnboardingSeen: resolveTimelineOnboardingSeen(
        data?.timelineOnboardingSeen,
        hasPersistedSettings
      ),
    }
  }

  private openSettings(): void {
    // Obsidian 尚未公开设置页导航类型，但桌面端/移动端均提供该运行时 API。
    // @ts-expect-error setting 是 Obsidian 内部 API
    this.app.setting?.open?.()
    // @ts-expect-error openTabById 是 Obsidian 内部 API
    this.app.setting?.openTabById?.("oneday")
  }

  async saveSettings(options: { rerender?: boolean } = {}): Promise<void> {
    await this.saveData(this.settings)
    if (options.rerender) this.rerenderMountedTimelines()
  }

  /** Directly redraw mounted blocks in both Live Preview and reading mode. */
  private rerenderMountedTimelines(): void {
    this.mountedTimelines.refreshAll((error) => console.error("Oneday: failed to refresh a mounted timeline", error))
  }
}
