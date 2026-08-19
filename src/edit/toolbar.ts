/**
 * Highlighter toolbar (荧光笔) + plan/record mode toggle + per-block
 * hide/show management (yyt 2026-08-17: 全局色号，块内可隐藏/加回).
 * Pure DOM so it runs in Obsidian and Playwright smoke.
 */

export type DrawMode = "actual" | "plan"

export type ViewMode = "all" | "actual" | "plan"

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
}

export interface ToolbarHandle {
  el: HTMLElement
  statusEl: HTMLElement
  /** 外部同步荧光笔模式视觉（视图联动时调用，专家：状态所有权必须一致） */
  setBrushMode: (mode: DrawMode) => void
}

/** Right-click menu on a swatch (pure DOM, same pattern as the + menu). */
function showSwatchMenu(root: HTMLElement, x: number, y: number, type: string, deps: ToolbarDeps): void {
  root.querySelectorAll(".oneday-ctx-menu").forEach((m) => m.remove())
  const menu = document.createElement("div")
  menu.className = "oneday-ctx-menu"
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  const hide = document.createElement("button")
  hide.className = "oneday-add-item"
  hide.textContent = "在本块隐藏"
  hide.addEventListener("click", () => {
    menu.remove()
    deps.onHide(type)
  })
  menu.appendChild(hide)
  root.appendChild(menu)
  document.addEventListener("click", () => menu.remove(), { once: true })
}

export function buildToolbar(deps: ToolbarDeps): ToolbarHandle {
  const el = document.createElement("div")
  el.className = "oneday-toolbar"

  // 荧光笔模式小开关（新增为 记录/计划，回到荧光笔区）
  const brushLabel = document.createElement("span")
  brushLabel.className = "oneday-toggle-label"
  brushLabel.textContent = "新增为"
  el.appendChild(brushLabel)
  const brushWrap = document.createElement("span")
  brushWrap.className = "oneday-mode oneday-brush-toggle" + (deps.brushMode === "plan" ? " is-plan" : "")
  for (const [m, label] of [["actual", "记录"], ["plan", "计划"]] as Array<[DrawMode, string]>) {
    const btn = document.createElement("button")
    btn.className = "oneday-mode-btn oneday-brush-btn" + (m === deps.brushMode ? " is-active" : "")
    btn.dataset.mode = m
    const sym = document.createElement("span")
    sym.className = m === "actual" ? "oneday-sym oneday-sym-dot" : "oneday-sym oneday-sym-hatch"
    btn.appendChild(sym)
    btn.appendChild(document.createTextNode(label))
    btn.addEventListener("click", () => {
      brushWrap.querySelectorAll(".oneday-mode-btn").forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
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
    const btn = document.createElement("button")
    btn.className = "oneday-swatch" + (type === deps.activeType ? " is-active" : "")
    btn.dataset.type = type
    btn.title = "左键选中 · 右键隐藏（本块）"
    const dot = document.createElement("span")
    dot.className = "oneday-swatch-dot"
    dot.style.setProperty("--c", deps.typeColors[type])
    btn.appendChild(dot)
    btn.appendChild(document.createTextNode(type))
    btn.addEventListener("click", () => {
      el.querySelectorAll(".oneday-swatch").forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
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
    const addBtn = document.createElement("button")
    addBtn.className = "oneday-swatch oneday-add"
    addBtn.textContent = "+"
    addBtn.title = "加回隐藏的荧光笔（新色号请去设置页）"
    const menu = document.createElement("div")
    menu.className = "oneday-add-menu"
    menu.style.display = "none"
    for (const type of hidden) {
      const item = document.createElement("button")
      item.className = "oneday-add-item"
      const dot = document.createElement("span")
      dot.className = "oneday-swatch-dot"
      dot.style.background = deps.typeColors[type]
      item.appendChild(dot)
      item.appendChild(document.createTextNode(type))
      item.addEventListener("click", () => {
        menu.style.display = "none"
        deps.onShow(type)
      })
      menu.appendChild(item)
    }
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      menu.style.display = menu.style.display === "none" ? "block" : "none"
    })
    document.addEventListener("click", () => (menu.style.display = "none"))
    const wrap = document.createElement("span")
    wrap.className = "oneday-add-wrap"
    wrap.append(addBtn, menu)
    el.appendChild(wrap)
  }

  const setBrushMode = (mode: DrawMode): void => {
    brushWrap.querySelectorAll(".oneday-mode-btn").forEach((b) => {
      b.classList.toggle("is-active", (b as HTMLElement).dataset.mode === mode)
    })
    brushWrap.classList.toggle("is-plan", mode === "plan")
    el.classList.toggle("is-plan", mode === "plan")
  }

  const statusEl = document.createElement("div")
  statusEl.className = "oneday-draw-status"
  return { el, statusEl, setBrushMode }
}

/** 记录/计划分段开关（独立组件，贴时间轴槽位顶部右侧，yyt 2026-08-17） */
export function buildModeToggle(mode: DrawMode, onChange: (mode: DrawMode) => void): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "oneday-mode oneday-mode-docked" + (mode === "plan" ? " is-plan" : "")
  const modes: Array<[DrawMode, string]> = [["actual", "记录"], ["plan", "计划"]]
  for (const [m, label] of modes) {
    const btn = document.createElement("button")
    btn.className = "oneday-mode-btn" + (m === mode ? " is-active" : "")
    btn.dataset.mode = m
    btn.textContent = label
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".oneday-mode-btn").forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
      wrap.classList.toggle("is-plan", m === "plan")
      onChange(m)
    })
    wrap.appendChild(btn)
  }
  return wrap
}

const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.6A9.5 9.5 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.44 9.44 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/></svg>'

export interface LayerView {
  actual: boolean
  plan: boolean
}

/** 图层开关：记录/计划各自独立点亮，都亮=全部（yyt 2026-08-17 拍板：三态多余）。
 *  最后亮着的那个不允许再灭（防止全空）。 */
export function buildLayerToggles(view: LayerView, onChange: (view: LayerView) => void): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "oneday-mode oneday-view-toggle"
  wrap.setAttribute("role", "group")
  wrap.setAttribute("aria-label", "显示图层")
  const state = { ...view }
  for (const [key, label] of [["actual", "记录"], ["plan", "计划"]] as Array<["actual" | "plan", string]>) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "oneday-mode-btn oneday-layer-btn" + (state[key] ? " is-active" : "")
    btn.dataset.layer = key
    // 文字 + Lucide eye/eye-off 图标（yyt 2026-08-19：不要 emoji）
    const text = document.createElement("span")
    text.textContent = label
    const eye = document.createElement("span")
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
