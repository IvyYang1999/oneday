/**
 * Oneday custom menus shared by toolbar and grid components.
 * Menus mount in the owning document body so transformed slots and pop-out
 * windows cannot offset or clip them.
 */

const activeMenuClose = new WeakMap<Document, () => void>()
let menuLabelSequence = 0

export function labelCustomMenu(menu: HTMLElement, label: string, dom: Document): void {
  const labelEl = dom.createElement("span")
  labelEl.id = `oneday-menu-label-${++menuLabelSequence}`
  labelEl.className = "oneday-menu-label"
  labelEl.textContent = label
  menu.prepend(labelEl)
  menu.setAttribute("aria-labelledby", labelEl.id)
}

type MenuOrigin =
  | { anchor: HTMLElement }
  | { dom: Document; x: number; y: number }

export function showCustomMenu(
  menu: HTMLElement,
  origin: MenuOrigin,
  onClose?: () => void
): () => void {
  let anchor: HTMLElement | null
  let dom: Document
  let sourceX: number
  let sourceTop: number
  let sourceBottom: number
  if ("anchor" in origin) {
    anchor = origin.anchor
    dom = anchor.ownerDocument
    const anchorRect = anchor.getBoundingClientRect()
    sourceX = anchorRect.left
    sourceTop = anchorRect.top
    sourceBottom = anchorRect.bottom
  } else {
    anchor = null
    dom = origin.dom
    sourceX = origin.x
    sourceTop = origin.y
    sourceBottom = origin.y
  }
  activeMenuClose.get(dom)?.()
  menu.classList.add("oneday-toolbar-menu")
  dom.body.appendChild(menu)

  const menuRect = menu.getBoundingClientRect()
  const view = dom.defaultView
  const viewportW = view?.innerWidth ?? dom.documentElement.clientWidth
  const viewportH = view?.innerHeight ?? dom.documentElement.clientHeight
  const gap = 4
  const left = Math.min(Math.max(8, sourceX), Math.max(8, viewportW - menuRect.width - 8))
  const below = sourceBottom + gap
  const top = below + menuRect.height <= viewportH - 8
    ? below
    : Math.max(8, sourceTop - menuRect.height - gap)
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    dom.removeEventListener("pointerdown", onPointerDown, true)
    dom.removeEventListener("keydown", onKeyDown, true)
    menu.remove()
    if (activeMenuClose.get(dom) === close) activeMenuClose.delete(dom)
    onClose?.()
  }
  const onPointerDown = (e: Event): void => {
    const target = e.target as Node | null
    if (target && !menu.contains(target) && (!anchor || !anchor.contains(target))) close()
  }
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close()
  }
  dom.addEventListener("pointerdown", onPointerDown, true)
  dom.addEventListener("keydown", onKeyDown, true)
  activeMenuClose.set(dom, close)
  return close
}

export function showActionMenuAtPoint(
  dom: Document,
  x: number,
  y: number,
  accessibleLabel: string,
  actionLabel: string,
  onAction: () => void
): void {
  const menu = dom.createElement("div")
  menu.className = "oneday-ctx-menu"
  menu.setAttribute("role", "menu")
  labelCustomMenu(menu, accessibleLabel, dom)
  const action = dom.createElement("button")
  action.type = "button"
  action.className = "oneday-add-item"
  action.setAttribute("role", "menuitem")
  action.textContent = actionLabel
  let close = (): void => {}
  action.addEventListener("click", () => {
    close()
    onAction()
  })
  menu.appendChild(action)
  close = showCustomMenu(menu, { dom, x, y })
}
