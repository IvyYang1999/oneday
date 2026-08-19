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
  const cleanup = (): void => {
    window.removeEventListener("scroll", onScroll, true)
    window.removeEventListener("resize", onScroll)
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
    void requestAnimationFrame(update)
  }
  window.addEventListener("scroll", onScroll, true)
  window.addEventListener("resize", onScroll)
  return cleanup
}
