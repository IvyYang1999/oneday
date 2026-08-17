import { MarkdownPostProcessorContext, MarkdownRenderer, Menu, Platform, Plugin, TFile } from "obsidian"
import { normalizeSpan, parseTimeline } from "./core/parser"
import { formatEntryLine } from "./core/format"
import { FALLBACK_COLOR } from "./render/svg-builder"
import { renderTimelineInto } from "./render/timeline-view"
import { DEFAULT_SETTINGS, OnedaySettings, OnedaySettingTab } from "./settings"
import { attachDialog } from "./agent/dialog"
import { ValidatedEntry } from "./agent/response"
import { addHiddenType, deleteEntryLine, insertEntryLine, removeHeaderValue, removeHiddenType, replaceBlockInContent, replaceEntryLine, setHeaderValue, setTextSection } from "./edit/source-rewriter"
import { buildToolbar } from "./edit/toolbar"
import { attachDrawInteraction } from "./edit/draw-interaction"
import { showBlockMenu } from "./edit/block-menu"
import { attachHoverInfo, toggleBlockFocus } from "./edit/hover-info"
import { applyItemToSlot, attachGridInteract } from "./edit/grid-interact"
import { compactGrid, GRID_ROW_H, gridRows, GridItem, serializeLayoutHeader } from "./core/grid-layout"
import { insertTimelineBlock } from "./insert"
import { attachWidthHandle } from "./edit/width-handle"
import { SIDE_LANE_W } from "./render/svg-builder"

/**
 * Oneday — highlighter-style daily timeline block.
 * Markdown source is the single source of truth (mermaid-style dual view).
 * M1 渲染 / M2 对话框 / M3 画板编辑（选荧光笔→拖色块→写回；右键菜单）。
 */
export default class OnedayPlugin extends Plugin {
  settings: OnedaySettings = DEFAULT_SETTINGS
  /** Currently selected highlighter (session-scoped). */
  private activeType = ""
  /** 记录/计划 draw mode (session-scoped). */
  private drawMode: "actual" | "plan" = "actual"

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new OnedaySettingTab(this.app, this))

    // 插入入口：命令面板 + 编辑器右键菜单
    this.addCommand({
      id: "insert-timeline-block",
      name: "插入 Oneday 时间轴块",
      editorCallback: (editor) => {
        insertTimelineBlock(editor, this.app.workspace.getActiveFile()?.basename ?? null)
      },
    })
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) =>
          item
            .setTitle("插入 Oneday 时间轴")
            .setIcon("calendar-clock")
            .onClick(() => {
              insertTimelineBlock(editor, this.app.workspace.getActiveFile()?.basename ?? null)
            })
        )
      })
    )

    this.registerMarkdownCodeBlockProcessor("timeline", (source, el, ctx) => {
      const doc = parseTimeline(source)
      const saveText = (text: string): void => {
        void this.applyBlockTransform(el, ctx, source, (s) => setTextSection(s, text))
      }
      const container = renderTimelineInto(
        el,
        doc,
        {
          typeColors: this.settings.typeColors,
          hourHeight: this.settings.hourHeight,
          width: this.settings.width,
        },
        {
          renderMarkdown: (host, text) => {
            void MarkdownRenderer.render(this.app, text, host, ctx.sourcePath, this)
          },
          onSave: saveText,
        }
      )
      const visibleTypes = Object.keys(this.settings.typeColors).filter((t) => !doc.hiddenTypes.includes(t))
      if (this.activeType === "" || !visibleTypes.includes(this.activeType)) {
        this.activeType = visibleTypes[0] ?? "misc"
      }

      const showAddMenu = (x: number, y: number): void => {
        const menu = new Menu()
        if (doc.text === undefined) {
          menu.addItem((item) =>
            item.setTitle("添加文字区").setIcon("file-text").onClick(() => {
              void this.applyBlockTransform(el, ctx, source, (s) => `${s.replace(/\n+$/, "")}\n===\n`)
            })
          )
        }
        menu.addItem((item) =>
          item.setTitle("重置组件布局").setIcon("layout-grid").onClick(() => {
            void this.applyBlockTransform(el, ctx, source, (s) => removeHeaderValue(s, "layout"))
          })
        )
        menu.showAtPosition({ x, y })
      }

      const toolbar = buildToolbar({
        typeColors: this.settings.typeColors,
        hiddenTypes: doc.hiddenTypes,
        activeType: this.activeType,
        mode: this.drawMode,
        onSelect: (type) => {
          this.activeType = type
        },
        onModeChange: (mode) => {
          this.drawMode = mode
        },
        onHide: (type) => {
          void this.applyBlockTransform(el, ctx, source, (s) => addHiddenType(s, type))
        },
        onShow: (type) => {
          void this.applyBlockTransform(el, ctx, source, (s) => removeHiddenType(s, type))
        },
      })
      // 填槽：工具栏/状态行/对话框各就各位（插槽位置由 layout 决定）
      const toolbarSlot = container.querySelector(".oneday-slot-toolbar")
      if (toolbarSlot) toolbarSlot.appendChild(toolbar.el)
      const timelineSlot = container.querySelector(".oneday-slot-timeline")
      if (timelineSlot) timelineSlot.appendChild(toolbar.statusEl)
      const col = container.querySelector(".oneday-timeline-col")
      const body = container.querySelector(".oneday-body")
      // 自动量高：内容比格子高的槽位撑开格子（修新建块截断），只改显示不自动写源码
      this.fitSlotHeights(container)

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
        typeColor: (type) => this.settings.typeColors[type] ?? FALLBACK_COLOR,
        onCreate: (entryLine, startMin) => {
          void this.applyBlockTransform(el, ctx, source, (s) => insertEntryLine(s, entryLine, startMin))
        },
        onBlockClick: (line) => {
          toggleBlockFocus(container, line)
        },
        onTrackMenu: (x, y) => {
          showAddMenu(x, y)
        },
        onBlockMenu: (line, x, y) => {
          const entry = doc.entries.find((e) => e.line === line)
          if (!entry) return
          showBlockMenu(this.app, entry, Object.keys(this.settings.typeColors), x, y, {
            setNote: (ln, note) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = parseTimeline(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, note: note || undefined }))
              }),
            setType: (ln, type) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = parseTimeline(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, type }))
              }),
            remove: (ln) => void this.applyBlockTransform(el, ctx, source, (s) => deleteEntryLine(s, ln)),
            edit: (ln, patch) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const d = parseTimeline(s)
                const e = d.entries.find((it) => it.line === ln)
                if (!e) return s
                const [sh, sm] = patch.start.split(":").map(Number)
                const [eh, em] = patch.end.split(":").map(Number)
                const [startMin, endMin] = normalizeSpan(sh * 60 + sm, eh * 60 + em, d.rangeStart)
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, startMin, endMin, type: patch.type, note: patch.note || undefined }))
              }),
            togglePlan: (ln) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = parseTimeline(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, plan: !e.plan }))
              }),
          })
        },
        })
      }

      wireTimeline()

      // 轨道宽度手柄：时间轴本体右缘的窄条，拖了写回 width: 头（yyt：边界要可调）
      attachWidthHandle(container, (doc.width ?? this.settings.width) + SIDE_LANE_W, (totalWidth) => {
        void this.applyBlockTransform(el, ctx, source, (s) =>
          setHeaderValue(s, "width", String(totalWidth - SIDE_LANE_W))
        )
      })

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
        showAddMenu(e.clientX, e.clientY)
      })

      if (Platform.isDesktopApp || this.settings.dialogBackend === "api") {
        const dialogSlot = container.querySelector(".oneday-slot-dialog")
        attachDialog((dialogSlot instanceof HTMLElement ? dialogSlot : col instanceof HTMLElement ? col : container), doc, {
          settings: this.settings,
          writeEntry: (entry: ValidatedEntry) =>
            this.applyBlockTransform(el, ctx, source, (s) => insertEntryLine(s, entry.sourceLine, entry.startMin)),
        })
      }
    })
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
    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n")
      // section spans the fenced block including the ``` lines.
      lines.splice(section.lineStart + 1, section.lineEnd - section.lineStart - 1, ...newSource.split("\n"))
      return lines.join("\n")
    })
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<OnedaySettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...data, typeColors: { ...DEFAULT_SETTINGS.typeColors, ...(data?.typeColors ?? {}) } }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }
}
