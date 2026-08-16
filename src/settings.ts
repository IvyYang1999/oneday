/**
 * Plugin settings: type -> color mapping (荧光笔色号, D2) + layout knobs.
 * parseTypeColors is pure and unit-tested; the tab itself is Obsidian glue.
 */
import { App, PluginSettingTab, Setting } from "obsidian"
import type OnedayPlugin from "./main"
import { DEFAULT_TYPE_COLORS, parseTypeColors, serializeTypeColors } from "./core/type-colors"

export interface OnedaySettings {
  typeColors: Record<string, string>
  hourHeight: number
  width: number
}

export const DEFAULT_SETTINGS: OnedaySettings = {
  typeColors: DEFAULT_TYPE_COLORS,
  hourHeight: 48,
  width: 200,
}

export class OnedaySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: OnedayPlugin) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl("h2", { text: "Oneday 时间轴" })

    new Setting(containerEl)
      .setName("荧光笔色号（类型: 颜色，每行一条）")
      .setDesc("时间轴语法里写类型名（如 math），颜色在这里配。未登记的类型显示为灰色。")
      .addTextArea((ta) => {
        ta.setPlaceholder("math: #7fd4c1")
          .setValue(serializeTypeColors(this.plugin.settings.typeColors))
          .onChange(async (value) => {
            const parsed = parseTypeColors(value)
            if (Object.keys(parsed).length > 0) {
              this.plugin.settings.typeColors = parsed
              await this.plugin.saveSettings()
            }
          })
        ta.inputEl.rows = 8
        ta.inputEl.cols = 30
      })

    new Setting(containerEl)
      .setName("每小时高度（px）")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.hourHeight)).onChange(async (v) => {
          const n = Number(v)
          if (Number.isFinite(n) && n >= 24 && n <= 200) {
            this.plugin.settings.hourHeight = n
            await this.plugin.saveSettings()
          }
        })
      )
  }
}
