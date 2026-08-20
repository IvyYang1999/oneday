/**
 * Lightweight inline dialog under each timeline block (M2).
 * User types natural language -> claude CLI returns a JSON entry ->
 * plugin validates and writes it back to the markdown source (D7).
 */
import { TimelineDoc } from "../core/types"
import { OnedaySettings } from "../settings"
import { buildSystemPrompt } from "./prompt"
import { AgentAction, interpretActions } from "./response"
import { runEntryAgent } from "./runner"
import { runEntryAgentApi } from "./direct-runner"
import { obsidianTransport } from "./obsidian-transport"

export interface DialogDeps {
  settings: OnedaySettings
  /** Persist agent actions (create/update/delete) into the note's block. */
  writeActions: (actions: AgentAction[]) => Promise<void>
  /** 未配置 API 时跳转设置页 */
  openSettings: () => void
}

export function attachDialog(container: HTMLElement, doc: TimelineDoc, deps: DialogDeps): void {
  const box = container.createDiv({ cls: "oneday-dialog" })
  box.setAttrs({ role: "region", "aria-label": "快速记录", "aria-busy": "false" })
  const domWindow = box.ownerDocument.defaultView

  // 未配置 API：禁用输入框 + 配置引导（yyt 2026-08-17）
  const needsKey = deps.settings.dialogBackend === "api" && deps.settings.apiKey.trim() === ""
  if (needsKey) {
    const hint = box.createDiv({ cls: "oneday-dialog-needskey" })
    hint.createEl("span", { text: "✦ 快速记录需要先配置模型 API：" })
    const btn = hint.createEl("button", { text: "去设置填 API Key", attr: { type: "button" } })
    btn.addEventListener("click", () => deps.openSettings())
    return
  }

  // 自动增高的多行输入（yyt：多事件时内容长）
  const input = box.createEl("textarea", {
    cls: "oneday-dialog-input",
    attr: { placeholder: "✦ 快速记录：刚健身半小时…", rows: "1", "aria-label": "快速记录" },
  }) as unknown as HTMLInputElement
  const ta = input as unknown as HTMLTextAreaElement
  const fitInput = (): void => {
    ta.style.height = "0px"
    ta.style.height = `${Math.max(32, ta.scrollHeight)}px` // 最小高度兜底（yyt：输入框扁了）
  }
  ta.addEventListener("input", fitInput)
  domWindow?.setTimeout(fitInput, 0)
  // loading 内联在输入行右侧（yyt：不占单独一行）
  const loading = box.createEl("span", { cls: "oneday-dialog-loading", text: "生成中…" })
  loading.setAttr("aria-hidden", "true")
  loading.style.display = "none"
  const status = box.createDiv({ cls: "oneday-dialog-status" })
  status.setAttrs({ role: "status", "aria-live": "polite" })

  // 多轮会话历史：追问的回答带着上文（yyt 2026-08-19）
  const history: Array<{ role: "user" | "assistant"; content: string }> = []
  let busy = false
  const submit = async (): Promise<void> => {
    const text = ta.value.trim()
    if (text === "" || busy) return
    busy = true
    box.setAttr("aria-busy", "true")
    ta.disabled = true
    loading.style.display = ""
    loading.setAttr("aria-hidden", "false")
    status.setText("")
    status.removeClass("oneday-dialog-error")

    const systemPrompt = buildSystemPrompt({
      typeColors: deps.settings.typeColors,
      now: new Date(),
      doc,
    })
    history.push({ role: "user", content: text })
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
          obsidianTransport,
          history.slice(0, -1)
        )

    if (!run.ok) {
      loading.style.display = "none"
      loading.setAttr("aria-hidden", "true")
      status.setText(run.reason)
      status.addClass("oneday-dialog-error")
      busy = false
      box.setAttr("aria-busy", "false")
      ta.disabled = false
      return
    }

    const result = interpretActions(run.text, doc)
    if (!result.ok) {
      loading.style.display = "none"
      loading.setAttr("aria-hidden", "true")
      history.push({ role: "assistant", content: run.text }) // 追问留在历史里
      status.setText(result.reason)
      status.addClass("oneday-dialog-error")
      busy = false
      box.setAttr("aria-busy", "false")
      ta.disabled = false
      ta.value = ""
      fitInput()
      ta.placeholder = "补充回答它的问题…"
      return
    }
    // 成功：本轮任务完成，重置会话
    history.length = 0
    ta.placeholder = "✦ 快速记录：刚健身半小时…"

    loading.style.display = "none"
    loading.setAttr("aria-hidden", "true")
    try {
      await deps.writeActions(result.actions)
      ta.value = ""
      fitInput()
      const rawCost = "costUsd" in run ? run.costUsd : undefined
      const cost = typeof rawCost === "number" ? `（$${rawCost.toFixed(4)}）` : ""
      const kinds = { create: 0, update: 0, delete: 0 }
      for (const a of result.actions) kinds[a.kind]++
      const parts = [kinds.create && `记录 ${kinds.create}`, kinds.update && `修改 ${kinds.update}`, kinds.delete && `删除 ${kinds.delete}`].filter(Boolean)
      status.setText(`已${parts.join("、")} 条 ${cost}`.replace(" 条", ` 条`).replace("  ", " "))
    } catch (error) {
      status.setText(`写回失败：${error instanceof Error ? error.message : String(error)}`)
      status.addClass("oneday-dialog-error")
    }
    busy = false
    box.setAttr("aria-busy", "false")
    ta.disabled = false
  }

  ta.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  })
}
