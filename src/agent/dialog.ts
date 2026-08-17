/**
 * Lightweight inline dialog under each timeline block (M2).
 * User types natural language -> claude CLI returns a JSON entry ->
 * plugin validates and writes it back to the markdown source (D7).
 */
import { TimelineDoc } from "../core/types"
import { OnedaySettings } from "../settings"
import { buildSystemPrompt } from "./prompt"
import { interpretResponse, ValidatedEntry } from "./response"
import { runEntryAgent } from "./runner"
import { runEntryAgentApi } from "./direct-runner"
import { obsidianTransport } from "./obsidian-transport"

export interface DialogDeps {
  settings: OnedaySettings
  /** Persist the entry into the note's timeline block. */
  writeEntry: (entry: ValidatedEntry) => Promise<void>
}

export function attachDialog(container: HTMLElement, doc: TimelineDoc, deps: DialogDeps): void {
  const box = container.createDiv({ cls: "oneday-dialog" })
  const input = box.createEl("input", {
    cls: "oneday-dialog-input",
    attr: { type: "text", placeholder: "刚健身半小时…" },
  })
  // loading 内联在输入行右侧（yyt：不占单独一行）
  const loading = box.createEl("span", { cls: "oneday-dialog-loading", text: "生成中…" })
  loading.style.display = "none"
  const status = box.createDiv({ cls: "oneday-dialog-status" })

  let busy = false
  const submit = async (): Promise<void> => {
    const text = input.value.trim()
    if (text === "" || busy) return
    busy = true
    input.disabled = true
    loading.style.display = ""
    status.setText("")
    status.removeClass("oneday-dialog-error")

    const systemPrompt = buildSystemPrompt({
      typeColors: deps.settings.typeColors,
      now: new Date(),
      doc,
    })
    const run = deps.settings.dialogBackend === "claude-cli"
      ? await runEntryAgent(text, systemPrompt)
      : await runEntryAgentApi(
          text,
          systemPrompt,
          {
            provider: deps.settings.provider,
            apiKey: deps.settings.apiKey,
            baseUrl: deps.settings.baseUrl,
            model: deps.settings.model,
          },
          obsidianTransport
        )

    if (!run.ok) {
      loading.style.display = "none"
      status.setText(run.reason)
      status.addClass("oneday-dialog-error")
      busy = false
      input.disabled = false
      return
    }

    const result = interpretResponse(run.text, doc)
    if (!result.ok) {
      loading.style.display = "none"
      status.setText(result.reason)
      status.addClass("oneday-dialog-error")
      busy = false
      input.disabled = false
      return
    }

    loading.style.display = "none"
    try {
      await deps.writeEntry(result.entry)
      input.value = ""
      const rawCost = "costUsd" in run ? run.costUsd : undefined
      const cost = typeof rawCost === "number" ? `（$${rawCost.toFixed(4)}）` : ""
      status.setText(`已记录 ${result.entry.sourceLine} ${cost}`)
    } catch (error) {
      status.setText(`写回失败：${error instanceof Error ? error.message : String(error)}`)
      status.addClass("oneday-dialog-error")
    }
    busy = false
    input.disabled = false
  }

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void submit()
    }
  })
}
