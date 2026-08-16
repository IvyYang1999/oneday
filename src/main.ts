import { Plugin } from "obsidian"
import { parseTimeline } from "./core/parser"
import { renderTimelineInto } from "./render/timeline-view"
import { DEFAULT_SETTINGS, OnedaySettings, OnedaySettingTab } from "./settings"

/**
 * Oneday — highlighter-style daily timeline block.
 * Markdown source is the single source of truth (mermaid-style dual view).
 * M1: parse -> SVG render -> per-type stats, plus 荧光笔色号 settings.
 */
export default class OnedayPlugin extends Plugin {
  settings: OnedaySettings = DEFAULT_SETTINGS

  async onload(): Promise<void> {
    await this.loadSettings()
    this.addSettingTab(new OnedaySettingTab(this.app, this))

    this.registerMarkdownCodeBlockProcessor("timeline", (source, el) => {
      const doc = parseTimeline(source)
      renderTimelineInto(el, doc, {
        typeColors: this.settings.typeColors,
        hourHeight: this.settings.hourHeight,
        width: this.settings.width,
      })
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
