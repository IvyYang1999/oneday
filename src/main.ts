import { Platform, Plugin, TFile } from "obsidian"
import { parseTimeline } from "./core/parser"
import { renderTimelineInto } from "./render/timeline-view"
import { DEFAULT_SETTINGS, OnedaySettings, OnedaySettingTab } from "./settings"
import { attachDialog } from "./agent/dialog"
import { ValidatedEntry } from "./agent/response"
import { insertEntryLine } from "./edit/source-rewriter"

/**
 * Oneday — highlighter-style daily timeline block.
 * Markdown source is the single source of truth (mermaid-style dual view).
 * M1: parse -> SVG render -> per-type stats + 荧光笔色号 settings.
 * M2: inline dialog -> claude CLI returns JSON -> plugin writes back (D7).
 */
export default class OnedayPlugin extends Plugin {
  settings: OnedaySettings = DEFAULT_SETTINGS

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new OnedaySettingTab(this.app, this))

    this.registerMarkdownCodeBlockProcessor("timeline", (source, el, ctx) => {
      const doc = parseTimeline(source)
      renderTimelineInto(el, doc, {
        typeColors: this.settings.typeColors,
        hourHeight: this.settings.hourHeight,
        width: this.settings.width,
      })

      if (Platform.isDesktopApp || this.settings.dialogBackend === "api") {
        const container = el.querySelector(".oneday-container")
        if (container instanceof HTMLElement) {
          attachDialog(container, doc, {
            settings: this.settings,
            writeEntry: (entry) => this.writeEntryToNote(ctx.sourcePath, el, ctx.getSectionInfo(el), source, entry),
          })
        }
      }
    })
  }

  /** Sole write path into markdown (D7): insert the entry line, keep time order. */
  private async writeEntryToNote(
    sourcePath: string,
    el: HTMLElement,
    section: { lineStart: number; lineEnd: number } | null,
    source: string,
    entry: ValidatedEntry
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(sourcePath)
    if (!(file instanceof TFile)) throw new Error("找不到当前笔记文件")
    if (!section) throw new Error("无法定位时间轴代码块（试试切换到阅读模式再试）")

    const newSource = insertEntryLine(source, entry.sourceLine, entry.startMin)
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
