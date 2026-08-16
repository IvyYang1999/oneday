import { Plugin } from "obsidian"
import { parseTimeline } from "./core/parser"
import { formatHours } from "./core/duration"
import { statsByType } from "./core/stats"

/**
 * Oneday — highlighter-style daily timeline block.
 * M1 first slice: parser is done; this registers a minimal read-only
 * code-block processor so the build is green. SVG renderer lands next.
 */
export default class OnedayPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerMarkdownCodeBlockProcessor("timeline", (source, el) => {
      const doc = parseTimeline(source)
      const container = el.createDiv({ cls: "oneday-timeline" })
      container.createEl("p", {
        text: `[oneday] ${doc.entries.length} entries, ${doc.annotations.length} annotations, ${doc.errors.length} errors`,
      })
      const stats = statsByType(doc.entries)
      if (stats.length > 0) {
        container.createEl("p", {
          text: stats.map((s) => `${s.type} ${formatHours(s.minutes)}`).join(" · "),
        })
      }
    })
  }
}
