import { setIcon } from "obsidian"
import type { DailyQuoteAppearance, DailyQuoteDefinition } from "../core/daily-quotes"
import { t } from "../i18n"

export interface DailyQuoteViewDeps {
  onNext: () => void
  onEdit: () => void
  resolveBackgroundImage?: (value: string) => string
}

/**
 * Keep controls rendered inside a Markdown code-block widget from handing the
 * same pointer gesture to CodeMirror.  CodeMirror may otherwise move/reveal
 * its selection after the widget has written new source, overriding the
 * scroll snapshot that belongs to that write.
 */
function bindEditorIsolatedClick(element: HTMLElement, action: () => void): void {
  const isolatePointer = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
  }
  element.addEventListener("pointerdown", isolatePointer)
  element.addEventListener("mousedown", isolatePointer)
  element.addEventListener("click", (event) => {
    isolatePointer(event)
    action()
  })
}

export function renderDailyQuoteInto(
  slot: HTMLElement,
  quote: DailyQuoteDefinition | null,
  appearance: DailyQuoteAppearance,
  deps: DailyQuoteViewDeps
): void {
  slot.empty()
  slot.classList.add("oneday-quote-slot")
  const root = slot.createDiv({ cls: "oneday-daily-quote" })
  const header = root.createDiv({ cls: "oneday-component-header" })
  header.createEl("strong", { cls: "oneday-component-title", text: t("dailyQuote") })
  const edit = header.createEl("button", {
    cls: "oneday-component-icon-button clickable-icon",
    attr: { type: "button", "aria-label": t("editDailyQuote") },
  })
  setIcon(edit, "pencil")
  bindEditorIsolatedClick(edit, deps.onEdit)

  if (!quote) {
    const empty = root.createEl("button", {
      cls: "oneday-daily-quote-empty",
      attr: { type: "button", "aria-label": t("addFirstQuote") },
    })
    setIcon(empty.createSpan({ cls: "oneday-daily-quote-empty-icon" }), "quote")
    empty.createSpan({ text: t("addFirstQuote") })
    bindEditorIsolatedClick(empty, deps.onEdit)
    return
  }

  const card = root.createEl("figure", {
    cls: `oneday-daily-quote-card theme-${appearance.theme} layout-${appearance.layout} font-${appearance.font}`,
    attr: { tabindex: "0", role: "button", "aria-label": t("nextQuote") },
  })
  card.style.setProperty("--oneday-quote-font-size", `${appearance.fontSize}px`)
  card.style.setProperty("--oneday-quote-overlay", String(appearance.overlay))
  if (appearance.backgroundColor) card.style.setProperty("--oneday-quote-bg", appearance.backgroundColor)
  if (appearance.textColor) card.style.setProperty("--oneday-quote-text", appearance.textColor)
  if (appearance.accentColor) card.style.setProperty("--oneday-quote-accent", appearance.accentColor)
  if (appearance.backgroundImage) {
    const image = deps.resolveBackgroundImage?.(appearance.backgroundImage) ?? appearance.backgroundImage
    if (image) appendQuoteMedia(card, image, appearance)
  }
  const cursor = card.createDiv({ cls: "oneday-daily-quote-cursor", attr: { "aria-hidden": "true" } })
  cursor.createSpan()
  const body = card.createDiv({ cls: "oneday-daily-quote-body" })
  const text = body.createEl("blockquote", { text: quote.text })
  text.classList.toggle("is-long", quote.text.length > 90)
  text.classList.toggle("is-very-long", quote.text.length > 180)
  if (quote.author.trim()) body.createEl("figcaption", { text: `— ${quote.author.trim()}` })
  const next = (): void => deps.onNext()
  bindEditorIsolatedClick(card, next)
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    event.stopPropagation()
    next()
  })
}

export function appendQuoteMedia(card: HTMLElement, source: string, appearance: DailyQuoteAppearance): void {
  const media = card.createDiv({ cls: "oneday-daily-quote-media", attr: { "aria-hidden": "true" } })
  const image = media.createEl("img", { attr: { src: source, alt: "", draggable: "false" } })
  image.style.objectPosition = `${appearance.imageFocalX * 100}% ${appearance.imageFocalY * 100}%`
  image.style.transform = `scale(${appearance.imageZoom})`
  media.createDiv({ cls: "oneday-daily-quote-image-overlay" })
}
