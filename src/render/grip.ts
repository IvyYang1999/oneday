/** Build the shared 2 × 3 dot language used by every direct-move grip. */
export function appendSixDotGrip(control: HTMLElement): void {
  const dom = control.ownerDocument
  for (let index = 0; index < 6; index++) {
    const dot = dom.createElement("span")
    dot.setAttribute("aria-hidden", "true")
    control.appendChild(dot)
  }
}
