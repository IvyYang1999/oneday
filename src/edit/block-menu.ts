/**
 * Right-click menu on a block (M3): 改备注 / 改类型 / 删除 / 转规划(实际).
 * Obsidian glue (Menu + Modal); pure logic stays in source-rewriter/format.
 */
import { App, Menu } from "obsidian"
import { Entry } from "../core/types"

export interface BlockMenuActions {
  /** 打开备注小浮窗（色块右侧临时编辑框） */
  editNote: (line: number) => void
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
      .onClick(() => actions.editNote(entry.line))
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
