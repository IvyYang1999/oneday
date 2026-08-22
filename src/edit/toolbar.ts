/**
 * Highlighter toolbar (荧光笔) + plan/record mode toggle + per-block
 * hide/show management (yyt 2026-08-17: 全局色号，块内可隐藏/显示).
 * Pure DOM so it runs in Obsidian and Playwright smoke.
 */

import { labelCustomMenu, showCustomMenu } from "./custom-menu"

export type DrawMode = "actual" | "plan"

export interface ToolbarDeps {
  /** Global palette (all configured types -> color). */
  typeColors: Record<string, string>
  /** Types hidden in this block (hide: header). */
  hiddenTypes: string[]
  activeType: string
  /** 荧光笔模式（画记录/画计划） */
  brushMode: DrawMode
  onBrushModeChange: (mode: DrawMode) => void
  onSelect: (type: string) => void
  /** Menu item: hide this swatch for this block. */
  onHide: (type: string) => void
  /** Tail management menu picks a hidden type to show again. */
  onShow: (type: string) => void
  /** Open the global palette settings to create another highlighter. */
  onAddNew: () => void
  /** DOM realm that owns this toolbar (Obsidian pop-out safe). */
  domDocument?: Document
}

export interface ToolbarHandle {
  el: HTMLElement
  statusEl: HTMLElement
  /** 外部同步荧光笔模式视觉（视图联动时调用，专家：状态所有权必须一致） */
  setBrushMode: (mode: DrawMode) => void
}

const PLUS_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'

/** Right-click menu on a swatch, anchored to the swatch itself. */
function showSwatchMenu(anchor: HTMLElement, type: string, deps: ToolbarDeps): void {
  const dom = anchor.ownerDocument
  const menu = dom.createElement("div")
  menu.className = "oneday-ctx-menu"
  menu.setAttribute("role", "menu")
  // Obsidian turns aria-label on hovered surfaces into a visual tooltip.
  // aria-labelledby keeps the accessible name without duplicating the menu as a black bubble.
  labelCustomMenu(menu, `${type} 荧光笔操作`, dom)
  const hide = dom.createElement("button")
  hide.type = "button"
  hide.className = "oneday-add-item"
  hide.setAttribute("role", "menuitem")
  hide.textContent = "隐藏"
  let close = (): void => {}
  hide.addEventListener("click", () => {
    close()
    deps.onHide(type)
  })
  menu.appendChild(hide)
  close = showCustomMenu(menu, { anchor })
}

export function buildToolbar(deps: ToolbarDeps): ToolbarHandle {
  const dom = deps.domDocument ?? document
  const el = dom.createElement("div")
  el.className = "oneday-toolbar"
  el.setAttribute("role", "toolbar")
  el.setAttribute("aria-label", "Oneday 荧光笔")

  const statusEl = dom.createElement("div")
  statusEl.className = "oneday-draw-status"
  statusEl.setAttribute("role", "status")
  statusEl.setAttribute("aria-live", "polite")

  // 真正的零配置态不是一排失效控件：整块成为唯一、明确的创建入口。
  // 若只是“全部在本块隐藏”，typeColors 仍非空，继续走下方的恢复菜单。
  if (Object.keys(deps.typeColors).length === 0) {
    el.classList.add("is-empty")
    const emptyButton = dom.createElement("button")
    emptyButton.type = "button"
    emptyButton.className = "oneday-toolbar-empty"
    emptyButton.setAttribute("aria-label", "添加第一个荧光笔")
    const icon = dom.createElement("span")
    icon.className = "oneday-toolbar-empty-icon"
    icon.setAttribute("aria-hidden", "true")
    icon.innerHTML = PLUS_SVG
    const copy = dom.createElement("span")
    copy.className = "oneday-toolbar-empty-label"
    copy.textContent = "添加第一个荧光笔"
    emptyButton.append(icon, copy)
    emptyButton.addEventListener("click", (e) => {
      e.stopPropagation()
      deps.onAddNew()
    })
    el.appendChild(emptyButton)
    return {
      el,
      statusEl,
      setBrushMode: (mode) => el.classList.toggle("is-plan", mode === "plan"),
    }
  }

  // 荧光笔模式小开关（新增为 记录/计划，回到荧光笔区）
  const brushLabel = dom.createElement("span")
  brushLabel.className = "oneday-toggle-label"
  brushLabel.textContent = "新增为"
  el.appendChild(brushLabel)
  const brushWrap = dom.createElement("span")
  brushWrap.className = "oneday-mode oneday-brush-toggle" + (deps.brushMode === "plan" ? " is-plan" : "")
  brushWrap.setAttribute("role", "group")
  brushWrap.setAttribute("aria-label", "新增色块类型")
  for (const [m, label] of [["actual", "记录"], ["plan", "计划"]] as Array<[DrawMode, string]>) {
    const btn = dom.createElement("button")
    btn.type = "button"
    btn.className = "oneday-mode-btn oneday-brush-btn" + (m === deps.brushMode ? " is-active" : "")
    btn.dataset.mode = m
    btn.setAttribute("aria-label", `新增为${label}`)
    btn.setAttribute("aria-pressed", String(m === deps.brushMode))
    btn.textContent = label
    btn.addEventListener("click", () => {
      brushWrap.querySelectorAll<HTMLButtonElement>(".oneday-mode-btn").forEach((b) => {
        const active = b === btn
        b.classList.toggle("is-active", active)
        b.setAttribute("aria-pressed", String(active))
      })
      brushWrap.classList.toggle("is-plan", m === "plan")
      el.classList.toggle("is-plan", m === "plan")
      deps.onBrushModeChange(m)
    })
    brushWrap.appendChild(btn)
  }
  el.appendChild(brushWrap)
  el.classList.toggle("is-plan", deps.brushMode === "plan")

  // Visible swatches = global palette minus hidden
  const visible = Object.keys(deps.typeColors).filter((t) => !deps.hiddenTypes.includes(t))
  for (const type of visible) {
    const btn = dom.createElement("button")
    btn.type = "button"
    btn.className = "oneday-swatch" + (type === deps.activeType ? " is-active" : "")
    btn.dataset.type = type
    btn.setAttribute("aria-label", `选择${type}荧光笔；右键隐藏`)
    btn.setAttribute("aria-pressed", String(type === deps.activeType))
    const dot = dom.createElement("span")
    dot.setAttribute("aria-hidden", "true")
    dot.className = "oneday-swatch-dot"
    dot.style.setProperty("--c", deps.typeColors[type])
    btn.appendChild(dot)
    btn.appendChild(dom.createTextNode(type))
    btn.addEventListener("click", () => {
      el.querySelectorAll<HTMLButtonElement>(".oneday-swatch[data-type]").forEach((b) => {
        const active = b === btn
        b.classList.toggle("is-active", active)
        b.setAttribute("aria-pressed", String(active))
      })
      deps.onSelect(type)
    })
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault()
      e.stopPropagation()
      showSwatchMenu(btn, type, deps)
    })
    el.appendChild(btn)
  }

  // Tail "+" is always present: restore hidden swatches or open global palette settings.
  const hidden = deps.hiddenTypes.filter((t) => t in deps.typeColors)
  const addBtn = dom.createElement("button")
  addBtn.type = "button"
  addBtn.className = "oneday-swatch oneday-add"
  addBtn.innerHTML = PLUS_SVG
  addBtn.setAttribute("aria-label", hidden.length > 0 ? "管理荧光笔" : "添加新荧光笔")
  if (hidden.length > 0) {
    addBtn.setAttribute("aria-haspopup", "menu")
    addBtn.setAttribute("aria-expanded", "false")
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      const menu = dom.createElement("div")
      menu.className = "oneday-add-menu"
      menu.setAttribute("role", "menu")
      labelCustomMenu(menu, "管理荧光笔", dom)
      let close = (): void => {}
      for (const type of hidden) {
        const item = dom.createElement("button")
        item.type = "button"
        item.className = "oneday-add-item"
        item.setAttribute("role", "menuitem")
        const dot = dom.createElement("span")
        dot.setAttribute("aria-hidden", "true")
        dot.className = "oneday-swatch-dot"
        dot.style.setProperty("--c", deps.typeColors[type])
        item.appendChild(dot)
        item.appendChild(dom.createTextNode(type))
        item.addEventListener("click", () => {
          close()
          deps.onShow(type)
        })
        menu.appendChild(item)
      }
      const addNew = dom.createElement("button")
      addNew.type = "button"
      addNew.className = "oneday-add-item oneday-add-new"
      addNew.setAttribute("role", "menuitem")
      const icon = dom.createElement("span")
      icon.className = "oneday-menu-icon"
      icon.setAttribute("aria-hidden", "true")
      icon.innerHTML = PLUS_SVG
      addNew.append(icon, dom.createTextNode("添加新荧光笔…"))
      addNew.addEventListener("click", () => {
        close()
        deps.onAddNew()
      })
      menu.appendChild(addNew)
      addBtn.setAttribute("aria-expanded", "true")
      close = showCustomMenu(menu, { anchor: addBtn }, () => addBtn.setAttribute("aria-expanded", "false"))
    })
  } else {
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      deps.onAddNew()
    })
  }
  el.appendChild(addBtn)

  const setBrushMode = (mode: DrawMode): void => {
    brushWrap.querySelectorAll<HTMLButtonElement>(".oneday-mode-btn").forEach((b) => {
      const active = b.dataset.mode === mode
      b.classList.toggle("is-active", active)
      b.setAttribute("aria-pressed", String(active))
    })
    brushWrap.classList.toggle("is-plan", mode === "plan")
    el.classList.toggle("is-plan", mode === "plan")
  }

  return { el, statusEl, setBrushMode }
}

const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.6A9.5 9.5 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.44 9.44 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>'

export interface LayerView {
  actual: boolean
  plan: boolean
}

/** 图层开关：记录/计划各自独立点亮，都亮=全部；允许全灭。 */
export function buildLayerToggles(view: LayerView, onChange: (view: LayerView) => void, dom: Document = document): HTMLElement {
  const wrap = dom.createElement("div")
  wrap.className = "oneday-mode oneday-view-toggle"
  wrap.setAttribute("role", "group")
  wrap.setAttribute("aria-label", "显示图层")
  const state = { ...view }
  for (const [key, label] of [["actual", "记录"], ["plan", "计划"]] as Array<["actual" | "plan", string]>) {
    const btn = dom.createElement("button")
    btn.type = "button"
    btn.className = "oneday-mode-btn oneday-layer-btn" + (state[key] ? " is-active" : "")
    btn.dataset.layer = key
    // 文字 + Lucide eye/eye-off 图标（yyt 2026-08-19：不要 emoji）
    const text = dom.createElement("span")
    text.textContent = label
    const eye = dom.createElement("span")
    eye.setAttribute("aria-hidden", "true")
    eye.className = "oneday-eye"
    btn.append(text, eye)
    const syncAria = (on: boolean): void => {
      btn.setAttribute("aria-pressed", String(on))
      btn.setAttribute("aria-label", on ? `隐藏${label}图层` : `显示${label}图层`)
      eye.innerHTML = on ? EYE_OPEN_SVG : EYE_OFF_SVG
    }
    syncAria(state[key])
    btn.addEventListener("click", () => {
      const next = !state[key]
      state[key] = next // 允许全灭（yyt：什么都不显示也是合法状态）
      btn.classList.toggle("is-active", next)
      syncAria(next)
      onChange({ ...state })
    })
    wrap.appendChild(btn)
  }
  return wrap
}
