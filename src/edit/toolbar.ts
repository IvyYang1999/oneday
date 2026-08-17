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
  mode: DrawMode
  onSelect: (type: string) => void
  onModeChange: (mode: DrawMode) => void
  /** Right-click a swatch hides it for this block. */
  onHide: (type: string) => void
  /** "+" menu picks a hidden type to show again. */
  onShow: (type: string) => void
}

export interface ToolbarHandle {
  el: HTMLElement
  statusEl: HTMLElement
}

export function buildToolbar(deps: ToolbarDeps): ToolbarHandle {
  const el = document.createElement("div")
  el.className = "oneday-toolbar"

  // 计划/记录 mode toggle
  const modeWrap = document.createElement("span")
  modeWrap.className = "oneday-mode"
  const modes: Array<[DrawMode, string]> = [["actual", "记录"], ["plan", "计划"]]
  for (const [mode, label] of modes) {
    const btn = document.createElement("button")
    btn.className = "oneday-mode-btn" + (mode === deps.mode ? " is-active" : "")
    btn.dataset.mode = mode
    btn.textContent = label
    btn.addEventListener("click", () => {
      modeWrap.querySelectorAll(".oneday-mode-btn").forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
      deps.onModeChange(mode)
    })
    modeWrap.appendChild(btn)
  }
  el.appendChild(modeWrap)

  // Visible swatches = global palette minus hidden
  const visible = Object.keys(deps.typeColors).filter((t) => !deps.hiddenTypes.includes(t))
  for (const type of visible) {
    const btn = document.createElement("button")
    btn.className = "oneday-swatch" + (type === deps.activeType ? " is-active" : "")
    btn.dataset.type = type
    btn.title = "左键选中 · 右键隐藏（本块）"
    const dot = document.createElement("span")
    dot.className = "oneday-swatch-dot"
    dot.style.background = deps.typeColors[type]
    btn.appendChild(dot)
    btn.appendChild(document.createTextNode(type))
    btn.addEventListener("click", () => {
      el.querySelectorAll(".oneday-swatch").forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
      deps.onSelect(type)
    })
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault()
      deps.onHide(type)
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

  const statusEl = document.createElement("div")
  statusEl.className = "oneday-draw-status"
  return { el, statusEl }
}
