import { MarkdownPostProcessorContext, Platform, Plugin, TFile } from "obsidian"
import { parseTimeline } from "./core/parser"
import { formatEntryLine } from "./core/format"
import { FALLBACK_COLOR } from "./render/svg-builder"
import { renderTimelineInto } from "./render/timeline-view"
import { DEFAULT_SETTINGS, OnedaySettings, OnedaySettingTab } from "./settings"
import { attachDialog } from "./agent/dialog"
import { ValidatedEntry } from "./agent/response"
import { addHiddenType, deleteEntryLine, insertEntryLine, removeHiddenType, replaceEntryLine } from "./edit/source-rewriter"
import { buildToolbar } from "./edit/toolbar"
import { attachDrawInteraction } from "./edit/draw-interaction"
import { showBlockMenu } from "./edit/block-menu"
import { attachHoverInfo, toggleBlockFocus } from "./edit/hover-info"

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

    this.registerMarkdownCodeBlockProcessor("timeline", (source, el, ctx) => {
      const doc = parseTimeline(source)
      const container = renderTimelineInto(el, doc, {
        typeColors: this.settings.typeColors,
        hourHeight: this.settings.hourHeight,
        width: this.settings.width,
      })
      const visibleTypes = Object.keys(this.settings.typeColors).filter((t) => !doc.hiddenTypes.includes(t))
      if (this.activeType === "" || !visibleTypes.includes(this.activeType)) {
        this.activeType = visibleTypes[0] ?? "misc"
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
      container.prepend(toolbar.el)
      const svgHolder = container.querySelector(".oneday-svg-holder")
      if (svgHolder) svgHolder.after(toolbar.statusEl)
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
            togglePlan: (ln) =>
              void this.applyBlockTransform(el, ctx, source, (s) => {
                const e = parseTimeline(s).entries.find((it) => it.line === ln)
                if (!e) return s
                return replaceEntryLine(s, ln, formatEntryLine({ ...e, plan: !e.plan }))
              }),
          })
        },
      })

      if (Platform.isDesktopApp || this.settings.dialogBackend === "api") {
        attachDialog(container, doc, {
          settings: this.settings,
          writeEntry: (entry: ValidatedEntry) =>
            this.applyBlockTransform(el, ctx, source, (s) => insertEntryLine(s, entry.sourceLine, entry.startMin)),
        })
      }
    })
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
