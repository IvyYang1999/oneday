import { MarkdownPostProcessorContext, MarkdownRenderer, MarkdownView, Menu, Platform, Plugin, TFile } from "obsidian"
import { parseTimeline } from "./core/parser"
import { formatEntryLine, weekdayZh } from "./core/format"
import { FALLBACK_COLOR } from "./render/svg-builder"
import { hashTypeColor } from "./core/type-colors"
import { renderTimelineInto } from "./render/timeline-view"
import { DEFAULT_SETTINGS, OnedaySettings, OnedaySettingTab } from "./settings"
import { attachDialog } from "./agent/dialog"
import { ValidatedEntry } from "./agent/response"
import { addHiddenType, addOffSlot, deleteEntryLine, insertEntryLine, removeHeaderValue, removeHiddenType, removeOffSlot, removeTextSection, replaceBlockInContent, replaceEntryLine, setHeaderValue, setTextSection } from "./edit/source-rewriter"
import { buildToolbar, buildViewToggle, ViewMode } from "./edit/toolbar"
import { attachDrawInteraction } from "./edit/draw-interaction"
import { showBlockMenu } from "./edit/block-menu"
import { attachHoverInfo, toggleBlockFocus } from "./edit/hover-info"
import { applyItemToSlot, attachGridInteract } from "./edit/grid-interact"
import { compactGrid, GRID_ROW_H, gridRows, GridItem, serializeLayoutHeader } from "./core/grid-layout"
import { inferDate, insertTimelineBlock } from "./insert"
import { attachWidthHandle } from "./edit/width-handle"
import { openNotePopover } from "./edit/note-popover"
import { SIDE_LANE_W } from "./render/svg-builder"

/**
 * Oneday — highlighter-style daily timeline block.
 * Markdown source is the single source of truth (mermaid-style dual view).
 * M1 渲染 / M2 对话框 / M3 画板编辑（选荧光笔→拖色块→写回；右键菜单）。
 */
export default class OnedayPlugin extends Plugin {
  settings: OnedaySettings = DEFAULT_SETTINGS

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
  /** 视图：全部/记录/计划（session-scoped） */
  private viewMode: ViewMode = "all"
  /** 色块编辑态（跨渲染保持；Esc/点别处退出） */
  private editing: { path: string; line: number } | null = null
  /** 色板在设置里变更过（旧渲染的块提示刷新） */
  private paletteDirty = false

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
      const doc = this.parse(source)
      // 渲染色号：全局优先，退休板兜底（删除/改名的类型在旧块里保色）
      const paletteForRender = { ...this.settings.retiredTypeColors, ...this.settings.typeColors }
      const saveText = (index: number, text: string): void => {
        void this.applyBlockTransform(el, ctx, source, (s) => setTextSection(s, text, index))
      }
      const container = renderTimelineInto(
        el,
        doc,
        {
          typeColors: paletteForRender,
          hourHeight: this.settings.hourHeight,
          width: this.settings.width,
          view: this.viewMode,
        },
        {
          renderMarkdown: (host, text) => {
            void MarkdownRenderer.render(this.app, text, host, ctx.sourcePath, this)
          },
          onSave: saveText,
        }
      )
      // 色板 = 全局 ∪ 本块用过的类型（旧块用过的已删类型保留显示，yyt 2026-08-17）
      const usedTypes = [...new Set(doc.entries.map((e) => e.type))]
      const paletteTypes = [...Object.keys(this.settings.typeColors), ...usedTypes.filter((t) => !(t in this.settings.typeColors))]
      const paletteColors = Object.fromEntries(paletteTypes.map((t) => [t, paletteForRender[t] ?? hashTypeColor(t)]))
      const visibleTypes = paletteTypes.filter((t) => !doc.hiddenTypes.includes(t))
      if (this.activeType === "" || !visibleTypes.includes(this.activeType)) {
        this.activeType = visibleTypes[0] ?? "misc"
      }

      const showAddMenu = (x: number, y: number): void => {
        const menu = new Menu()
        // 添加文本框（常驻，可多个；落在点击的格子附近）
        menu.addItem((item) =>
          item.setTitle("添加文本框").setIcon("file-text").onClick(() => {
            void this.applyBlockTransform(el, ctx, source, (s) => {
              const newId = doc.texts.length === 0 ? "text" : `text${doc.texts.length + 1}`
              let out = setTextSection(s, "", doc.texts.length) // 追加空文本区
              if (body instanceof HTMLElement) {
                const bodyRect = body.getBoundingClientRect()
                if (bodyRect.width > 100) {
                  const cellW = bodyRect.width / 12
                  const gx = Math.min(12 - 6, Math.max(0, Math.floor((x - bodyRect.left) / cellW)))
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
            item.setTitle(`恢复「${slotId}」组件`).setIcon("eye").onClick(() => {
              void this.applyBlockTransform(el, ctx, source, (s) => removeOffSlot(s, slotId))
            })
          )
        }
        menu.addItem((item) =>
          item.setTitle("设为默认布局（新块照此摆放）").setIcon("bookmark").onClick(() => {
            if (body instanceof HTMLElement) {
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
          item.setTitle("重置组件布局").setIcon("layout-grid").onClick(() => {
            void this.applyBlockTransform(el, ctx, source, (s) => removeHeaderValue(s, "layout"))
          })
        )
        menu.showAtPosition({ x, y })
      }

      const toolbar = buildToolbar({
        typeColors: paletteColors,
        hiddenTypes: doc.hiddenTypes,
        activeType: this.activeType,
        brushMode: this.drawMode,
        onBrushModeChange: (mode) => {
          this.drawMode = mode
        },
        onSelect: (type) => {
          this.activeType = type
        },
        onHide: (type) => {
          void this.applyBlockTransform(el, ctx, source, (s) => addHiddenType(s, type))
        },
        onShow: (type) => {
          void this.applyBlockTransform(el, ctx, source, (s) => removeHiddenType(s, type))
        },
      })
      // 色板在设置里变更后：提示刷新（yyt 2026-08-17，可忽略）
      if (this.paletteDirty) {
        const badge = document.createElement("button")
        badge.className = "oneday-palette-refresh"
        badge.textContent = "↻ 荧光笔有更新，点击刷新"
        badge.addEventListener("click", () => {
          this.paletteDirty = false
          badge.remove() // 立即消失（重渲染是后台的事）
          this.rerenderMarkdownViews()
        })
        toolbar.el.appendChild(badge)
      }

      // 填槽：工具栏/状态行/对话框各就各位（插槽位置由 layout 决定）
      const toolbarSlot = container.querySelector(".oneday-slot-toolbar")
      if (toolbarSlot) toolbarSlot.appendChild(toolbar.el)
      const timelineSlot = container.querySelector(".oneday-slot-timeline")
      if (timelineSlot instanceof HTMLElement) {
        timelineSlot.appendChild(toolbar.statusEl)
        // 顶栏：日期+星期（跨期统计锚点）在左，记录/计划开关在右
        const topbar = document.createElement("div")
        topbar.className = "oneday-timeline-topbar"
        const dateStr = doc.date ?? (() => {
          const base = this.app.workspace.getActiveFile()?.basename ?? ""
          return /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.test(base) ? inferDate(base) : null
        })()
        if (dateStr) {
          const dateEl = document.createElement("span")
          dateEl.className = "oneday-date-row"
          const wd = weekdayZh(dateStr)
          dateEl.textContent = `${dateStr}${wd ? " " + wd : ""}`
          topbar.appendChild(dateEl)
        }
        topbar.appendChild(buildViewToggle(this.viewMode, (mode) => {
          this.viewMode = mode
          // 视图联动荧光笔模式（荧光笔也可单独切）
          if (mode === "actual") this.drawMode = "actual"
          else if (mode === "plan") this.drawMode = "plan"
          this.rerenderMarkdownViews()
        }))
        timelineSlot.prepend(topbar)
      }
      const col = container.querySelector(".oneday-timeline-col")
      const body = container.querySelector(".oneday-body")
      // 自动量高：内容比格子高的槽位撑开格子（修新建块截断），只改显示不自动写源码
      this.fitSlotHeights(container)
      // 初始调整全部完成后开启动画（is-settling 期间槽位不过渡，杀创建闪缩）
      window.setTimeout(() => body?.classList.remove("is-settling"), 350)

      // 网格组件交互：拖拽移动 + 八向缩放，写回 layout 头——所有块可用
      if (body instanceof HTMLElement) {
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
        getActiveType: () => this.activeType,
        getMode: () => this.drawMode,
        typeColor: (type) => paletteForRender[type] ?? hashTypeColor(type),
        onCreate: (entryLine, startMin) => {
          void this.applyBlockTransform(el, ctx, source, (s) => insertEntryLine(this.persistLayoutOnce(s, doc, container), entryLine, startMin))
        },
        onBlockClick: (line) => {
          toggleBlockFocus(container, line)
        },
        onTrackMenu: (x, y) => {
          showAddMenu(x, y)
        },
        onExtendRange: (startMin, endMin) => {
          void this.applyBlockTransform(el, ctx, source, (s) =>
            setHeaderValue(s, "range", `${Math.round(startMin / 60)}-${Math.round(endMin / 60)}`)
          )
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
            editNote: (ln) => {
              const rect = container.querySelector(`rect.oneday-block[data-line="${ln}"]`)
              const e0 = doc.entries.find((it) => it.line === ln)
              if (!rect || !e0) return
              openNotePopover(container, rect.getBoundingClientRect(), e0.note ?? "", (note) => {
                void this.applyBlockTransform(el, ctx, source, (s) => {
                  const e = this.parse(s).entries.find((it) => it.line === ln)
                  if (!e) return s
                  return replaceEntryLine(s, ln, formatEntryLine({ ...e, note: note || undefined }))
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
          })
        },
        })
      }

      wireTimeline()

      // 初始宽度自适应内容：无 layout 头时，时间轴槽位收到内容自然宽（yyt 2026-08-17）
      if (doc.layout === undefined && body instanceof HTMLElement) {
        const slotEl = container.querySelector<HTMLElement>(".oneday-slot-timeline")
        if (slotEl) {
          window.requestAnimationFrame(() => {
            const bodyW = body.getBoundingClientRect().width
            const natural = (doc.width ?? this.settings.width) + SIDE_LANE_W + 8
            if (bodyW > 200 && natural < bodyW * 0.9) {
              const cols = Math.min(12, Math.max(2, Math.round((natural / bodyW) * 12)))
              slotEl.dataset.w = String(cols)
              slotEl.style.width = `${(cols / 12) * 100}%`
            }
          })
        }
      }

      // 轨道宽度手柄：时间轴本体右缘的窄条，拖了写回 width: 头（yyt：边界要可调）
      attachWidthHandle(container, (doc.width ?? this.settings.width) + SIDE_LANE_W, (totalWidth) => {
        void this.applyBlockTransform(el, ctx, source, (s) =>
          setHeaderValue(s, "width", String(totalWidth - SIDE_LANE_W))
        )
      })

      // 右下角：设置快捷入口（yyt 2026-08-17）
      const gear = document.createElement("button")
      gear.className = "oneday-open-settings"
      gear.textContent = "⚙"
      gear.title = "打开 Oneday 设置"
      gear.addEventListener("click", (e) => {
        e.stopPropagation()
        // @ts-expect-error setting 是内部 API
        this.app.setting?.open?.()
        // @ts-expect-error 内部 API
        this.app.setting?.openTabById?.("oneday")
      })
      container.appendChild(gear)

      // 显式「＋组件」入口：block 右下角（与荧光笔的＋无关，yyt 2026-08-17）
      const addComp = document.createElement("button")
      addComp.className = "oneday-add-component"
      addComp.textContent = "＋"
      addComp.title = "添加组件（文字区…）"
      addComp.addEventListener("click", (e) => {
        e.stopPropagation()
        const r = addComp.getBoundingClientRect()
        showAddMenu(r.left, r.top)
      })
      container.appendChild(addComp)

      const menuSurface = (el.closest(".cm-embed-block") as HTMLElement | null) ?? container
      menuSurface.addEventListener("contextmenu", (e: MouseEvent) => {
        const t = e.target as Element | null
        if (t?.closest("button, input, textarea, a, rect, .oneday-text-host, .oneday-add-menu")) return
        e.preventDefault()
        // 点在组件空白上 -> 提供「隐藏此组件」（off: 头，＋菜单可加回）
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
          menu.showAtPosition({ x: e.clientX, y: e.clientY })
          return
        }
        if (slotId && ["toolbar", "stats", "dialog"].includes(slotId)) {
          const menu = new Menu()
          menu.addItem((item) =>
            item.setTitle(`隐藏「${slotId}」组件（＋可加回）`).setIcon("eye-off").onClick(() => {
              void this.applyBlockTransform(el, ctx, source, (s) => addOffSlot(s, slotId))
            })
          )
          menu.showAtPosition({ x: e.clientX, y: e.clientY })
          return
        }
        showAddMenu(e.clientX, e.clientY)
      })

      if (Platform.isDesktopApp || this.settings.dialogBackend === "api") {
        const dialogSlot = container.querySelector(".oneday-slot-dialog")
        attachDialog((dialogSlot instanceof HTMLElement ? dialogSlot : col instanceof HTMLElement ? col : container), doc, {
          settings: this.settings,
          openSettings: () => {
            // @ts-expect-error 内部 API
            this.app.setting?.open?.()
            // @ts-expect-error 内部 API
            this.app.setting?.openTabById?.("oneday")
          },
          writeEntry: (entry: ValidatedEntry) =>
            this.applyBlockTransform(el, ctx, source, (s) => insertEntryLine(this.persistLayoutOnce(s, doc, container), entry.sourceLine, entry.startMin)),
        })
      }
    })
  }

  /** 无 layout 头的块在首次写入时持久化当前槽位布局（避免每次重渲染重新拟合 -> 闪缩） */
  private persistLayoutOnce(source: string, doc: { layout?: unknown }, container: HTMLElement): string {
    if (doc.layout !== undefined) return source
    const body = container.querySelector(".oneday-body")
    if (!(body instanceof HTMLElement)) return source
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
      const body = container.querySelector(".oneday-body")
      if (!(body instanceof HTMLElement)) return
      const slots = Array.from(body.querySelectorAll<HTMLElement>(".oneday-slot"))
      let grew = false
      for (const slot of slots) {
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
      for (const slot of slots) {
        const it = items.find((i) => i.id === slot.dataset.slot)!
        slot.dataset.x = String(it.x)
        slot.dataset.y = String(it.y)
        slot.dataset.w = String(it.w)
        slot.dataset.h = String(it.h)
        applyItemToSlot(slot, it)
      }
      body.style.height = `${gridRows(items) * GRID_ROW_H}px`
    }
    run()
    window.setTimeout(run, 300) // markdown 异步渲染完再量一次
  }

  /** Sole write path into markdown (D7/D3 共用): transform block source, splice back. */
  private async applyBlockTransform(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    source: string,
    transform: (source: string) => string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath)
    if (!(file instanceof TFile)) throw new Error("找不到当前笔记文件")
    const section = ctx.getSectionInfo(el)
    if (!section) throw new Error("无法定位时间轴代码块（试试切换到阅读模式再试）")

    const newSource = transform(source)
    // 优先走编辑器事务（进 CM6 撤销栈，Ctrl+Z 可撤回，yyt 2026-08-17）；
    // 找不到打开的编辑器再退回 vault.process
    const view = this.findMarkdownView(ctx.sourcePath)
    if (view) {
      const editor = view.editor
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
      const lines = content.split("\n")
      // section spans the fenced block including the ``` lines.
      lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, ...newSource.split("\n"))
      return lines.join("\n")
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
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      // 色板不 merge 默认值：有存档就全用存档，否则删除的默认类型会复活（yyt 2026-08-17）
      typeColors: data?.typeColors ?? { ...DEFAULT_SETTINGS.typeColors },
      retiredTypeColors: data?.retiredTypeColors ?? {},
    }
  }

  async saveSettings(): Promise<void> {
    this.paletteDirty = true
    await this.saveData(this.settings)
  }

  /** 尽量触发所有 markdown 视图重渲染（阅读模式可靠；Live Preview 下次自然重渲染生效） */
  private rerenderMarkdownViews(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView) {
        try {
          leaf.view.previewMode.rerender(true)
        } catch {
          /* LP 下无 previewMode 重渲入口 */
        }
      }
    })
  }
}
