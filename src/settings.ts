/**
 * Plugin settings: type -> color mapping (荧光笔色号, D2) + 对话模型配置
 * （2026-08-16 拍板：设置页填 API key 直调模型）+ layout knobs.
 */
import { App, PluginSettingTab, Setting } from "obsidian"
import type OnedayPlugin from "./main"
import { ApiProvider } from "./agent/api-client"
import { DEFAULT_TYPE_COLORS } from "./core/type-colors"

export type DialogBackend = "api" | "claude-cli"

export interface OnedaySettings {
  typeColors: Record<string, string>
  hourHeight: number
  width: number
  /** 默认时间轴起止小时（块内 range: 头可覆盖） */
  rangeStartHour: number
  rangeEndHour: number
  dialogBackend: DialogBackend
  provider: ApiProvider
  apiKey: string
  baseUrl: string
  model: string
  /** 删除/改名的类型色号存档：新建块不显示，旧块里的色块/色板仍用原色（yyt 2026-08-17） */
  retiredTypeColors: Record<string, string>
  /** 布局记忆（「设为默认布局」）：新建块按此摆放 */
  templateLayout?: string
  templateWidth?: number
  templateHasText?: boolean
}

export const DEFAULT_SETTINGS: OnedaySettings = {
  typeColors: DEFAULT_TYPE_COLORS,
  hourHeight: 48,
  width: 200,
  rangeStartHour: 7,
  rangeEndHour: 23,
  retiredTypeColors: {},
  dialogBackend: "api",
  provider: "openai-compatible",
  apiKey: "",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-4.5-air",
}

export class OnedaySettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: OnedayPlugin) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl("h2", { text: "Oneday 时间轴" })

    containerEl.createEl("h3", { text: "荧光笔色号（全局）" })
    const paletteDesc = containerEl.createEl("p", {
      text: "这里是全局默认荧光笔，对新建块生效。删除/改名的类型会从新建块消失，但旧块里已使用的同名色块和色板仍按原色保留。每个 block 默认显示全部荧光笔，可在块内右键色板临时隐藏。",
      cls: "setting-item-description",
    })
    paletteDesc.style.marginTop = "0"

    const paletteEl = containerEl.createDiv()
    const renderPalette = (): void => {
      paletteEl.empty()
      for (const [type, color] of Object.entries(this.plugin.settings.typeColors)) {
        const row = new Setting(paletteEl)
        row.settingEl.addClass("oneday-palette-setting")
        row
          .addColorPicker((cp) =>
            cp.setValue(color).onChange(async (v) => {
              this.plugin.settings.typeColors[type] = v
              await this.plugin.saveSettings()
            })
          )
          .addText((t) => {
            t.setValue(type).setPlaceholder("类型名")
            // 改名失焦/回车才提交——逐键改名会产生中间态把 key 搞乱（yyt 2026-08-17 踩坑）
            const commit = async (): Promise<void> => {
              const name = t.inputEl.value.trim()
              if (name === type) return
              if (!/^\S+$/.test(name) || name in this.plugin.settings.typeColors) {
                t.inputEl.value = type // 非法/重名：回退显示
                return
              }
              const entries = Object.entries(this.plugin.settings.typeColors).map(([k, c]): [string, string] =>
                k === type ? [name, c] : [k, c]
              )
              this.plugin.settings.typeColors = Object.fromEntries(entries)
              this.plugin.settings.retiredTypeColors[type] ??= color // 旧名进退休板，旧块保色
              await this.plugin.saveSettings()
              renderPalette()
            }
            t.inputEl.addEventListener("blur", () => void commit())
            t.inputEl.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                t.inputEl.blur()
              }
            })
          })
          .addExtraButton((b) =>
            b.setIcon("trash").setTooltip("删除").onClick(async () => {
              this.plugin.settings.retiredTypeColors[type] ??= this.plugin.settings.typeColors[type] // 退休板保色
              delete this.plugin.settings.typeColors[type]
              await this.plugin.saveSettings()
              renderPalette()
            })
          )
      }
      new Setting(paletteEl).addButton((b) =>
        b.setButtonText("添加荧光笔").onClick(async () => {
          let n = 1
          while (`type${n}` in this.plugin.settings.typeColors) n++
          this.plugin.settings.typeColors[`type${n}`] = "#bdbdbd"
          await this.plugin.saveSettings()
          renderPalette()
        })
      )
    }
    renderPalette()

    new Setting(containerEl)
      .setName("默认时间范围（起–止，小时）")
      .setDesc("如 7–23；想全天就 0–24。单个块可用 range: 头覆盖。")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.rangeStartHour)).onChange(async (v) => {
          const n = Number(v)
          if (Number.isInteger(n) && n >= 0 && n <= 23 && n < this.plugin.settings.rangeEndHour) {
            this.plugin.settings.rangeStartHour = n
            await this.plugin.saveSettings()
          }
        })
      )
      .addText((t) =>
        t.setValue(String(this.plugin.settings.rangeEndHour)).onChange(async (v) => {
          const n = Number(v)
          if (Number.isInteger(n) && n >= 1 && n <= 24 && n > this.plugin.settings.rangeStartHour) {
            this.plugin.settings.rangeEndHour = n
            await this.plugin.saveSettings()
          }
        })
      )

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

    containerEl.createEl("h3", { text: "自然语言记录（对话框）" })

    new Setting(containerEl)
      .setName("后端")
      .setDesc("api = 直调模型 API（推荐）；claude-cli = 调本机 Claude Code CLI")
      .addDropdown((d) =>
        d
          .addOption("api", "模型 API 直调")
          .addOption("claude-cli", "本机 claude CLI")
          .setValue(this.plugin.settings.dialogBackend)
          .onChange(async (v) => {
            this.plugin.settings.dialogBackend = v as DialogBackend
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName("API 协议")
      .setDesc("openai-compatible 覆盖 GLM / DeepSeek / OpenAI 等大多数服务")
      .addDropdown((d) =>
        d
          .addOption("openai-compatible", "OpenAI 兼容")
          .addOption("anthropic", "Anthropic")
          .setValue(this.plugin.settings.provider)
          .onChange(async (v) => {
            this.plugin.settings.provider = v as ApiProvider
            await this.plugin.saveSettings()
          })
      )

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("明文存在 Obsidian data.json，仅本机使用")
      .addText((t) => {
        t.inputEl.type = "password"
        t.setPlaceholder("sk-…")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.apiKey = v.trim()
            await this.plugin.saveSettings()
          })
      })

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("如 GLM：https://open.bigmodel.cn/api/paas/v4；DeepSeek：https://api.deepseek.com/v1")
      .addText((t) =>
        t.setValue(this.plugin.settings.baseUrl).onChange(async (v) => {
          this.plugin.settings.baseUrl = v.trim()
          await this.plugin.saveSettings()
        })
      )

    new Setting(containerEl)
      .setName("模型")
      .setDesc("如 glm-4.5-air / deepseek-chat / gpt-4o-mini / claude-haiku-4-5")
      .addText((t) =>
        t.setValue(this.plugin.settings.model).onChange(async (v) => {
          this.plugin.settings.model = v.trim()
          await this.plugin.saveSettings()
        })
      )
  }
}
