/**
 * Right-click menu on a block (M3): 改备注 / 改类型 / 删除 / 转规划(实际).
 * Obsidian glue (Menu + Modal); pure logic stays in source-rewriter/format.
 */
import { App, Menu, Modal, Setting } from "obsidian"
import { Entry } from "../core/types"
import { formatClockPlain } from "../core/format"

export interface BlockMenuActions {
  setNote: (line: number, note: string) => void
  setType: (line: number, type: string) => void
  remove: (line: number) => void
  togglePlan: (line: number) => void
  /** 编辑色块（类型/起止/备注一并改） */
  edit: (line: number, patch: { type: string; start: string; end: string; note: string }) => void
}

export function showBlockMenu(
  app: App,
  entry: Entry,
  types: string[],
  x: number,
  y: number,
  actions: BlockMenuActions
): void {
  const menu = new Menu()

  menu.addItem((item) =>
    item.setTitle(entry.plan ? "转为实际记录" : "转为规划（plan）")
      .setIcon(entry.plan ? "highlighter" : "pencil")
      .onClick(() => actions.togglePlan(entry.line))
  )

  menu.addItem((item) =>
    item.setTitle("编辑色块…")
      .setIcon("pencil-line")
      .onClick(() =>
        new EditBlockModal(app, entry, types, (patch) => actions.edit(entry.line, patch)).open()
      )
  )

  menu.addItem((item) =>
    item.setTitle(entry.note ? "修改备注" : "添加备注")
      .setIcon("notebook-pen")
      .onClick(() => new NoteModal(app, entry.note ?? "", (note) => actions.setNote(entry.line, note)).open())
  )

  menu.addSeparator()
  for (const type of types) {
    if (type === entry.type) continue
    menu.addItem((item) =>
      item.setTitle(`改为 ${type}`).onClick(() => actions.setType(entry.line, type))
    )
  }

  menu.addSeparator()
  menu.addItem((item) =>
    item.setTitle("删除色块").setIcon("trash").onClick(() => actions.remove(entry.line))
  )

  menu.showAtPosition({ x, y })
}

class NoteModal extends Modal {
  constructor(app: App, private initial: string, private onSave: (note: string) => void) {
    super(app)
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.createEl("h3", { text: "这段时间干了什么？" })
    let value = this.initial
    new Setting(contentEl).addText((t) => {
      t.setValue(this.initial).onChange((v) => (value = v))
      t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault()
          this.onSave(value.trim())
          this.close()
        }
      })
      window.setTimeout(() => t.inputEl.focus(), 0)
    })
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("保存").setCta().onClick(() => {
        this.onSave(value.trim())
        this.close()
      })
    )
  }
}

/** 编辑色块弹窗：类型/起止/备注（替代不稳定的边沿拖拽, yyt 2026-08-17） */
class EditBlockModal extends Modal {
  constructor(
    app: App,
    private entry: Entry,
    private types: string[],
    private onSave: (patch: { type: string; start: string; end: string; note: string }) => void
  ) {
    super(app)
  }

  onOpen(): void {
    const { contentEl } = this
    contentEl.createEl("h3", { text: "编辑色块" })
    let type = this.entry.type
    let start = formatClockPlain(this.entry.startMin)
    let end = formatClockPlain(this.entry.endMin)
    let note = this.entry.note ?? ""
    const err = contentEl.createDiv({ cls: "oneday-modal-error" })

    new Setting(contentEl).setName("类型").addDropdown((d) => {
      for (const t of this.types) d.addOption(t, t)
      if (!this.types.includes(type)) d.addOption(type, `${type}（未登记）`)
      d.setValue(type).onChange((v) => (type = v))
    })
    new Setting(contentEl).setName("开始").addText((t) =>
      t.setValue(start).setPlaceholder("HH:MM").onChange((v) => (start = v.trim()))
    )
    new Setting(contentEl).setName("结束").addText((t) =>
      t.setValue(end).setPlaceholder("HH:MM").onChange((v) => (end = v.trim()))
    )
    new Setting(contentEl).setName("备注").addText((t) =>
      t.setValue(note).onChange((v) => (note = v))
    )
    new Setting(contentEl).addButton((b) =>
      b.setButtonText("保存").setCta().onClick(() => {
        if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) {
          err.setText("时间格式应为 HH:MM")
          return
        }
        this.onSave({ type, start, end, note: note.trim() })
        this.close()
      })
    )
  }
}
