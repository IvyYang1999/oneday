/**
 * Right-click menu on a block (M3): 改备注 / 改类型 / 删除 / 转规划(实际).
 * Obsidian glue (Menu + Modal); pure logic stays in source-rewriter/format.
 */
import { App, Menu, Modal, Setting } from "obsidian"
import { Entry } from "../core/types"

export interface BlockMenuActions {
  setNote: (line: number, note: string) => void
  setType: (line: number, type: string) => void
  remove: (line: number) => void
  togglePlan: (line: number) => void
  /** 进入交互式编辑态（边缘拖拽改起止、中部拖动移动） */
  editSpan: (line: number) => void
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
    item.setTitle("编辑起止 / 移动（交互式）")
      .setIcon("move")
      .onClick(() => actions.editSpan(entry.line))
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
