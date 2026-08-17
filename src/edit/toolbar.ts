/**
 * Highlighter toolbar (荧光笔色号选择) + draw status line.
 * Pure DOM (document.createElement) so it runs in Obsidian and Playwright smoke.
 */

export interface ToolbarDeps {
  typeColors: Record<string, string>
  activeType: string
  onSelect: (type: string) => void
}

export interface ToolbarHandle {
  el: HTMLElement
  statusEl: HTMLElement
}

export function buildToolbar(deps: ToolbarDeps): ToolbarHandle {
  const el = document.createElement("div")
  el.className = "oneday-toolbar"

  for (const [type, color] of Object.entries(deps.typeColors)) {
    const btn = document.createElement("button")
    btn.className = "oneday-swatch" + (type === deps.activeType ? " is-active" : "")
    btn.dataset.type = type
    const dot = document.createElement("span")
    dot.className = "oneday-swatch-dot"
    dot.style.background = color
    btn.appendChild(dot)
    btn.appendChild(document.createTextNode(type))
    btn.addEventListener("click", () => {
      el.querySelectorAll(".oneday-swatch").forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
      deps.onSelect(type)
    })
    el.appendChild(btn)
  }

  const statusEl = document.createElement("div")
  statusEl.className = "oneday-draw-status"
  return { el, statusEl }
}
