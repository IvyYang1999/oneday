/**
 * Right-click menu on a block (M3): 改备注 / 改类型 / 删除 / 转规划(实际).
 * Obsidian glue (Menu + Modal); pure logic stays in source-rewriter/format.
 */
import { App, Menu } from "obsidian"
import { Entry } from "../core/types"
import { buildTypeMenuOptions } from "./block-menu-model"
import { attachCascadeMenu, CascadeMenuController } from "./cascade-menu"

export interface BlockMenuActions {
  /** 打开备注小浮窗（色块右侧临时编辑框） */
  editNote: (line: number) => void
  setNote: (line: number, note: string) => void
  setType: (line: number, type: string) => void
  remove: (line: number) => void
  togglePlan: (line: number) => void
  /** 进入交互式编辑态（边缘拖拽改起止、中部拖动移动） */
  editSpan: (line: number) => void
  /** 精确起止时间（HH:MM 输入） */
  editTimes: (line: number) => void
}

export function showBlockMenu(
  app: App,
  entry: Entry,
  types: string[],
  x: number,
  y: number,
  actions: BlockMenuActions,
  domDocument: Document = document
): void {
  const menu = new Menu().setUseNativeMenu(false)
  let cascade: CascadeMenuController | null = null

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
    item.setTitle("精确起止…（HH:MM）")
      .setIcon("clock")
      .onClick(() => actions.editTimes(entry.line))
  )

  menu.addItem((item) =>
    item.setTitle(entry.note ? "修改备注" : "添加备注")
      .setIcon("notebook-pen")
      .onClick(() => actions.editNote(entry.line))
  )

  menu.addSeparator()
  menu.addItem((item) => {
    const title = domDocument.createDocumentFragment()
    const content = domDocument.createElement("span")
    content.className = "oneday-type-trigger-content"
    const label = domDocument.createElement("span")
    label.textContent = "更改类型…"
    const caret = domDocument.createElement("span")
    caret.className = "oneday-submenu-caret"
    caret.setAttribute("aria-hidden", "true")
    caret.textContent = "›"
    content.append(label, caret)
    title.appendChild(content)
    item.setTitle(title).setIcon("tags")
  })

  menu.addSeparator()
  menu.addItem((item) =>
    item.setTitle("删除色块").setIcon("trash").onClick(() => actions.remove(entry.line))
  )

  const existingMenus = new Set(Array.from(domDocument.querySelectorAll(".menu")))
  menu.onHide(() => {
    cascade?.destroy()
    cascade = null
  })
  menu.showAtPosition({ x, y }, domDocument)

  const primaryMenu = Array.from(domDocument.querySelectorAll<HTMLElement>(".menu"))
    .find((candidate) => !existingMenus.has(candidate) && candidate.querySelector(".oneday-type-trigger-content"))
  const trigger = primaryMenu?.querySelector<HTMLElement>(".oneday-type-trigger-content")?.closest<HTMLElement>(".menu-item")
  if (!primaryMenu || !trigger) return
  const options = buildTypeMenuOptions(types, entry.type)
  cascade = attachCascadeMenu(primaryMenu, trigger, options, "选择色块类型", (index) => {
    const option = options[index]
    if (!option || option.checked) return
    menu.hide()
    actions.setType(entry.line, option.type)
  })
}
