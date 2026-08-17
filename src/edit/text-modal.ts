/** Modal editor for the block's free-text section (块内图文混排的文). */
import { App, Modal, Setting } from "obsidian"

export class TextSectionModal extends Modal {
  constructor(app: App, private initial: string, private onSave: (text: string) => void) {
    super(app)
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.createEl("h3", { text: "文字区（支持 markdown）" })
    const ta = contentEl.createEl("textarea", { cls: "oneday-text-modal-input" })
    ta.value = this.initial
    ta.placeholder = "## 明日 to do\n1. …\n\n## Remember\n- …"
    ta.rows = 14
    ta.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        this.onSave(ta.value)
        this.close()
      }
    })
    window.setTimeout(() => ta.focus(), 0)
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("保存（⌘/Ctrl+Enter）").setCta().onClick(() => {
        this.onSave(ta.value)
        this.close()
      })
    )
  }
}
