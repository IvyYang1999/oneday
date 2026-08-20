/**
 * Popover anchor tracker: keeps a body-mounted fixed popover glued to
 * its anchor element across scrolls and resizes. Auto-removes when the
 * anchor leaves the DOM.
 */
export function trackAnchor(
  pop: HTMLElement,
  anchor: Element,
  place: (anchorRect: DOMRect) => void
): () => void {
  const domWindow = pop.ownerDocument.defaultView
  if (!domWindow) return () => {}
  const cleanup = (): void => {
    domWindow.removeEventListener("scroll", onScroll, true)
    domWindow.removeEventListener("resize", onScroll)
  }
  const update = (): void => {
    if (!anchor.isConnected || !pop.isConnected) {
      cleanup()
      pop.remove()
      return
    }
    place(anchor.getBoundingClientRect())
  }
  const onScroll = (): void => {
    void domWindow.requestAnimationFrame(update)
  }
  domWindow.addEventListener("scroll", onScroll, true)
  domWindow.addEventListener("resize", onScroll)
  return cleanup
}
