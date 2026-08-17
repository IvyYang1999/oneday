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
  /** 居右浮动（分栏）状态与切换 */
  floatRight: boolean
  onToggleFloat: () => void
  /** 文字区（块内图文混排） */
  hasText: boolean
  onEditText: () => void
  /** 时间轴栏在左/右（有文字区时可换侧） */
  side: "left" | "right"
  onToggleSide: () => void
  onSelect: (type: string) => void
  onModeChange: (mode: DrawMode) => void
  /** Menu item: hide this swatch for this block. */
  onHide: (type: string) => void
  /** "+" menu picks a hidden type to show again. */
  onShow: (type: string) => void
}

export interface ToolbarHandle {
  el: HTMLElement
  statusEl: HTMLElement
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
  el.className = "oneday-toolbar" + (deps.mode === "plan" ? " is-plan" : "")

  // 换侧 grip：点击或往对侧拖都交换左右（飞书式）
  const grip = document.createElement("button")
  grip.className = "oneday-grip"
  grip.textContent = "⋮⋮"
  grip.title = "点击或拖到对侧：交换文字区/时间轴位置"
  let gripDownX: number | null = null
  let gripFired = false
  grip.addEventListener("pointerdown", (e) => {
    gripDownX = e.clientX
    gripFired = false
    grip.setPointerCapture(e.pointerId)
  })
  grip.addEventListener("pointermove", (e) => {
    if (gripDownX === null || gripFired) return
    if (Math.abs(e.clientX - gripDownX) > 100) {
      gripFired = true
      deps.onToggleSide()
    }
  })
  grip.addEventListener("pointerup", (e) => {
    if (gripDownX !== null && !gripFired && Math.abs(e.clientY) >= 0) {
      if (Math.abs(e.clientX - gripDownX) < 5) deps.onToggleSide()
    }
    gripDownX = null
  })
  el.appendChild(grip)

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
      el.classList.toggle("is-plan", mode === "plan")
      deps.onModeChange(mode)
    })
    modeWrap.appendChild(btn)
  }
  el.appendChild(modeWrap)

  const floatBtn = document.createElement("button")
  floatBtn.className = "oneday-swatch oneday-float-btn" + (deps.floatRight ? " is-active" : "")
  floatBtn.textContent = "⇥"
  floatBtn.title = deps.floatRight ? "取消居右（分栏）" : "居右浮动，左侧文字环绕（分栏）"
  floatBtn.addEventListener("click", () => deps.onToggleFloat())
  el.appendChild(floatBtn)

  const textBtn = document.createElement("button")
  textBtn.className = "oneday-swatch oneday-text-btn" + (deps.hasText ? " is-active" : "")
  textBtn.textContent = "文"
  textBtn.title = deps.hasText ? "编辑文字区" : "添加文字区（块内左文右图）"
  textBtn.addEventListener("click", () => deps.onEditText())
  el.appendChild(textBtn)

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

  const statusEl = document.createElement("div")
  statusEl.className = "oneday-draw-status"
  return { el, statusEl }
}
