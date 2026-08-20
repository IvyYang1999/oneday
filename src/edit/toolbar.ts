/**
 * Highlighter toolbar (荧光笔) + plan/record mode toggle + per-block
 * hide/show management (yyt 2026-08-17: 全局色号，块内可隐藏/加回).
 * Pure DOM so it runs in Obsidian and Playwright smoke.
 */

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
  /** "+" menu picks a hidden type to show again. */
  onShow: (type: string) => void
  /** DOM realm that owns this toolbar (Obsidian pop-out safe). */
  domDocument?: Document
}

export interface ToolbarHandle {
  el: HTMLElement
  statusEl: HTMLElement
  /** 外部同步荧光笔模式视觉（视图联动时调用，专家：状态所有权必须一致） */
  setBrushMode: (mode: DrawMode) => void
}

/** Right-click menu on a swatch (pure DOM, same pattern as the + menu). */
function showSwatchMenu(root: HTMLElement, x: number, y: number, type: string, deps: ToolbarDeps): void {
  const dom = root.ownerDocument
  root.querySelectorAll(".oneday-ctx-menu").forEach((m) => m.remove())
  const menu = dom.createElement("div")
  menu.className = "oneday-ctx-menu"
  menu.setAttribute("role", "menu")
  menu.setAttribute("aria-label", `${type} 荧光笔操作`)
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  const hide = dom.createElement("button")
  hide.type = "button"
  hide.className = "oneday-add-item"
  hide.setAttribute("role", "menuitem")
  hide.textContent = "在本块隐藏"
  hide.addEventListener("click", () => {
    menu.remove()
    deps.onHide(type)
  })
  menu.appendChild(hide)
  root.appendChild(menu)
  dom.addEventListener("click", () => menu.remove(), { once: true })
}

export function buildToolbar(deps: ToolbarDeps): ToolbarHandle {
  const dom = deps.domDocument ?? document
  const el = dom.createElement("div")
  el.className = "oneday-toolbar"
  el.setAttribute("role", "toolbar")
  el.setAttribute("aria-label", "Oneday 荧光笔")

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
    btn.title = "左键选中 · 右键隐藏（本块）"
    btn.setAttribute("aria-label", `选择${type}荧光笔`)
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
      showSwatchMenu(el, e.clientX, e.clientY, type, deps)
    })
    el.appendChild(btn)
  }

  // "+" add-back menu (only types already configured globally)
  const hidden = deps.hiddenTypes.filter((t) => t in deps.typeColors)
  if (hidden.length > 0) {
    const addBtn = dom.createElement("button")
    addBtn.type = "button"
    addBtn.className = "oneday-swatch oneday-add"
    addBtn.textContent = "+"
    addBtn.title = "加回隐藏的荧光笔（新色号请去设置页）"
    addBtn.setAttribute("aria-haspopup", "menu")
    addBtn.setAttribute("aria-expanded", "false")
    addBtn.setAttribute("aria-label", "加回隐藏的荧光笔")
    const menu = dom.createElement("div")
    menu.className = "oneday-add-menu"
    menu.setAttribute("role", "menu")
    menu.setAttribute("aria-label", "隐藏的荧光笔")
    menu.style.display = "none"
    for (const type of hidden) {
      const item = dom.createElement("button")
      item.type = "button"
      item.className = "oneday-add-item"
      item.setAttribute("role", "menuitem")
      const dot = dom.createElement("span")
      dot.setAttribute("aria-hidden", "true")
      dot.className = "oneday-swatch-dot"
      dot.style.background = deps.typeColors[type]
      item.appendChild(dot)
      item.appendChild(dom.createTextNode(type))
      item.addEventListener("click", () => {
        menu.style.display = "none"
        addBtn.setAttribute("aria-expanded", "false")
        deps.onShow(type)
      })
      menu.appendChild(item)
    }
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      const open = menu.style.display === "none"
      menu.style.display = open ? "block" : "none"
      addBtn.setAttribute("aria-expanded", String(open))
      if (open) {
        dom.addEventListener("click", () => {
          menu.style.display = "none"
          addBtn.setAttribute("aria-expanded", "false")
        }, { once: true })
      }
    })
    const wrap = dom.createElement("span")
    wrap.className = "oneday-add-wrap"
    wrap.append(addBtn, menu)
    el.appendChild(wrap)
  }

  const setBrushMode = (mode: DrawMode): void => {
    brushWrap.querySelectorAll<HTMLButtonElement>(".oneday-mode-btn").forEach((b) => {
      const active = b.dataset.mode === mode
      b.classList.toggle("is-active", active)
      b.setAttribute("aria-pressed", String(active))
    })
    brushWrap.classList.toggle("is-plan", mode === "plan")
    el.classList.toggle("is-plan", mode === "plan")
  }

  const statusEl = dom.createElement("div")
  statusEl.className = "oneday-draw-status"
  statusEl.setAttribute("role", "status")
  statusEl.setAttribute("aria-live", "polite")
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
      btn.title = on ? `隐藏${label}图层` : `显示${label}图层`
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
