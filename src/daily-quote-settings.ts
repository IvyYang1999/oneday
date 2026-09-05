import { setIcon } from "obsidian"
import type { OnedaySettings } from "./settings"
import {
  applyDailyQuoteTheme,
  DEFAULT_DAILY_QUOTE_APPEARANCE,
  DAILY_QUOTE_THEMES,
  normalizeDailyQuoteAppearance,
  type DailyQuoteAppearance,
  type DailyQuoteDefinition,
  type DailyQuoteFont,
  type DailyQuoteLayout,
  type DailyQuoteTheme,
} from "./core/daily-quotes"
import { appendQuoteMedia } from "./render/daily-quote-view"
import { t } from "./i18n"

export interface DailyQuoteImageChoice { path: string; name: string }

export interface DailyQuoteSettingsHost {
  settings: Pick<OnedaySettings, "dailyQuotes" | "dailyQuoteDefaults">
  saveSettings(options?: { rerender?: boolean }): Promise<void>
  resolveDailyQuoteBackgroundImage?(value: string): string
  importDailyQuoteBackgroundImage?(file: File): Promise<string>
  listDailyQuoteBackgroundImages?(): DailyQuoteImageChoice[]
}

export interface DailyQuoteSettingsOptions {
  appearance: DailyQuoteAppearance
  previewQuote?: DailyQuoteDefinition | null
  scope: "block" | "defaults" | "block-and-defaults"
  onApply: (value: DailyQuoteAppearance) => void | Promise<void>
  onCancel?: () => void
}

export function renderDailyQuoteSettings(
  container: HTMLElement,
  host: DailyQuoteSettingsHost,
  options: DailyQuoteSettingsOptions
): void {
  container.empty()
  container.classList.add("oneday-quote-settings")
  let draft = normalizeDailyQuoteAppearance(options.appearance)
  let activeTab: "design" | "library" = "design"

  const tabs = container.createDiv({ cls: "oneday-quote-settings-tabs", attr: { role: "tablist", "aria-label": t("dailyQuoteSettings") } })
  const body = container.createDiv({ cls: "oneday-quote-settings-body" })
  const status = container.createDiv({ cls: "oneday-quote-settings-status", attr: { "aria-live": "polite" } })
  const tabButtons = new Map<"design" | "library", HTMLButtonElement>()

  const setStatus = (message: string, error = false): void => {
    status.textContent = message
    status.classList.toggle("is-error", error)
  }
  const resolveImage = (value: string): string => host.resolveDailyQuoteBackgroundImage?.(value)
    ?? (/^https?:\/\//i.test(value) ? value : "")

  const renderTab = (): void => {
    for (const [key, button] of tabButtons) {
      const selected = key === activeTab
      button.setAttribute("aria-selected", String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    if (activeTab === "design") renderDesign()
    else renderLibrary()
  }
  for (const [key, label] of [["design", t("quoteCardDesign")], ["library", t("quoteLibrary")]] as const) {
    const button = tabs.createEl("button", { text: label, attr: { type: "button", role: "tab", "aria-selected": "false" } })
    button.addEventListener("click", () => { activeTab = key; renderTab() })
    tabButtons.set(key, button)
  }

  const renderDesign = (): void => {
    body.empty()
    body.className = "oneday-quote-settings-body is-design"
    let cropSnapshot: DailyQuoteAppearance | null = null
    let cropMode = false
    const designer = body.createDiv({ cls: "oneday-quote-designer" })
    const panel = designer.createDiv({ cls: "oneday-quote-design-panel" })
    const previewPanel = designer.createDiv({ cls: "oneday-quote-preview-panel" })
    previewPanel.createEl("h4", { text: t("quoteLivePreview") })
    const preview = previewPanel.createDiv({ cls: "oneday-quote-settings-preview" })
    const cropActions = previewPanel.createDiv({ cls: "oneday-quote-crop-actions" })

    const paintPreview = (): void => {
      preview.empty()
      const quote = options.previewQuote ?? host.settings.dailyQuotes.find((item) => item.text.trim()) ?? null
      const card = preview.createEl("figure", {
        cls: `oneday-daily-quote-card theme-${draft.theme} layout-${draft.layout} font-${draft.font}${cropMode ? " is-cropping" : ""}`,
        attr: cropMode ? { tabindex: "0", "aria-label": t("quoteCropHelp") } : {},
      })
      card.style.setProperty("--oneday-quote-font-size", `${draft.fontSize}px`)
      card.style.setProperty("--oneday-quote-overlay", String(draft.overlay))
      if (draft.backgroundColor) card.style.setProperty("--oneday-quote-bg", draft.backgroundColor)
      if (draft.textColor) card.style.setProperty("--oneday-quote-text", draft.textColor)
      if (draft.accentColor) card.style.setProperty("--oneday-quote-accent", draft.accentColor)
      if (draft.backgroundImage) {
        const source = resolveImage(draft.backgroundImage)
        if (source) appendQuoteMedia(card, source, draft)
      }
      card.createDiv({ cls: "oneday-daily-quote-cursor" }).createSpan()
      const content = card.createDiv({ cls: "oneday-daily-quote-body" })
      content.createEl("blockquote", { text: quote?.text || t("quotePreviewText") })
      if (quote?.author) content.createEl("figcaption", { text: `— ${quote.author}` })
      const paintImageTransform = (): void => {
        const image = card.querySelector<HTMLImageElement>(".oneday-daily-quote-media img")
        if (!image) return
        image.style.objectPosition = `${draft.imageFocalX * 100}% ${draft.imageFocalY * 100}%`
        image.style.transform = `scale(${draft.imageZoom})`
      }
      if (cropMode) attachCropInteraction(card, () => draft, (next) => {
        // Keep the same preview node alive for the whole gesture. Rebuilding it
        // here would release pointer capture after the first pointermove.
        draft = normalizeDailyQuoteAppearance(next)
        paintImageTransform()
      })

      cropActions.empty()
      cropActions.classList.toggle("is-visible", cropMode)
      if (!cropMode) return
      labeledRange(cropActions, t("quoteImageZoom"), draft.imageZoom, 1, 3, .05, (value) => {
        // Replacing the range input during `input` makes a continuous slider
        // gesture stop after one frame, so only update the live image transform.
        draft = normalizeDailyQuoteAppearance({ ...draft, imageZoom: value })
        paintImageTransform()
      })
      const buttons = cropActions.createDiv({ cls: "oneday-quote-crop-buttons" })
      textButton(buttons, t("resetCrop"), () => {
        draft = normalizeDailyQuoteAppearance({ ...draft, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 }); paintPreview()
      })
      textButton(buttons, t("cancelCrop"), () => {
        if (cropSnapshot) draft = cropSnapshot
        cropMode = false; cropSnapshot = null; paintPreview()
      })
      textButton(buttons, t("finishCrop"), () => { cropMode = false; cropSnapshot = null; paintPreview() }, "mod-cta")
    }

    const updateDraft = (next: Partial<DailyQuoteAppearance>): void => {
      draft = normalizeDailyQuoteAppearance({ ...draft, ...next }); paintPreview()
    }

    const themesSection = designSection(panel, t("quoteTheme"))
    const themes = themesSection.createDiv({ cls: "oneday-quote-theme-grid", attr: { role: "radiogroup", "aria-label": t("quoteTheme") } })
    for (const theme of Object.keys(DAILY_QUOTE_THEMES) as DailyQuoteTheme[]) {
      const button = themes.createEl("button", { attr: { type: "button", role: "radio", "aria-checked": String(draft.theme === theme) } })
      button.dataset.theme = theme
      button.createSpan({ cls: `oneday-quote-theme-swatch theme-${theme}` })
      button.createSpan({ text: t(`quoteTheme_${theme}`) })
      button.addEventListener("click", () => {
        themes.querySelectorAll("button").forEach((item) => item.setAttribute("aria-checked", String(item === button)))
        draft = applyDailyQuoteTheme(theme, draft); paintPreview()
      })
    }

    const typography = designSection(panel, t("quoteTypography"))
    const controls = typography.createDiv({ cls: "oneday-quote-settings-controls" })
    selectControl(controls, t("quoteLayout"), draft.layout, [
      ["left", t("quoteLayout_left")], ["center", t("quoteLayout_center")], ["editorial", t("quoteLayout_editorial")],
    ], (value) => updateDraft({ layout: value as DailyQuoteLayout }))
    selectControl(controls, t("quoteFont"), draft.font, [
      ["interface", t("quoteFont_interface")], ["serif", t("quoteFont_serif")], ["mono", t("quoteFont_mono")],
    ], (value) => updateDraft({ font: value as DailyQuoteFont }))
    const fontSize = labeledRange(
      controls,
      t("quoteFontSize"),
      draft.fontSize,
      14,
      48,
      1,
      (value) => updateDraft({ fontSize: value }),
      (value) => `${Math.round(value)} px`
    )
    fontSize.classList.add("is-font-size")

    const background = designSection(panel, t("quoteBackground"))
    const media = background.createDiv({ cls: "oneday-quote-media-editor", attr: { tabindex: "0", role: "group", "aria-label": t("quoteBackgroundImage") } })
    const fileInput = background.createEl("input", { cls: "oneday-quote-file-input", attr: { type: "file", accept: "image/*" } })
    const renderMedia = (): void => {
      media.empty()
      const source = draft.backgroundImage ? resolveImage(draft.backgroundImage) : ""
      if (!source) {
        const empty = media.createDiv({ cls: "oneday-quote-media-empty" })
        setIcon(empty.createSpan({ cls: "oneday-quote-media-icon" }), "image-plus")
        empty.createEl("strong", { text: t("quoteDropImage") })
        empty.createEl("span", { text: t("quoteDropImageHint") })
      } else {
        const thumb = media.createDiv({ cls: "oneday-quote-media-thumb" })
        const image = thumb.createEl("img", { attr: { src: source, alt: "", draggable: "false" } })
        image.style.objectPosition = `${draft.imageFocalX * 100}% ${draft.imageFocalY * 100}%`
        image.style.transform = `scale(${draft.imageZoom})`
        const tools = media.createDiv({ cls: "oneday-quote-media-tools" })
        textButton(tools, t("replaceImage"), () => fileInput.click())
        textButton(tools, t("adjustCrop"), () => { cropSnapshot = { ...draft }; cropMode = true; paintPreview() })
        textButton(tools, t("removeImage"), () => {
          updateDraft({ backgroundImage: "", imageFocalX: .5, imageFocalY: .5, imageZoom: 1 }); renderMedia()
        }, "is-destructive")
      }
    }
    const importFile = async (file: File | undefined): Promise<void> => {
      if (!file) return
      if (!file.type.startsWith("image/")) return setStatus(t("quoteImageInvalid"), true)
      if (file.size > 15 * 1024 * 1024) return setStatus(t("quoteImageTooLarge"), true)
      if (!host.importDailyQuoteBackgroundImage) return setStatus(t("quoteImageImportUnavailable"), true)
      try {
        setStatus(t("quoteImageImporting"))
        const imagePath = await host.importDailyQuoteBackgroundImage(file)
        updateDraft({ backgroundImage: imagePath, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 })
        setStatus(t("quoteImageImported")); renderMedia()
      } catch { setStatus(t("quoteImageImportFailed"), true) }
    }
    fileInput.addEventListener("change", () => { void importFile(fileInput.files?.[0]); fileInput.value = "" })
    media.addEventListener("dragover", (event) => { event.preventDefault(); media.classList.add("is-dragover") })
    media.addEventListener("dragleave", () => media.classList.remove("is-dragover"))
    media.addEventListener("drop", (event) => { event.preventDefault(); media.classList.remove("is-dragover"); void importFile(event.dataTransfer?.files[0]) })
    media.addEventListener("paste", (event) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"))
      if (!file) return
      event.preventDefault(); void importFile(file)
    })
    const sourceActions = background.createDiv({ cls: "oneday-quote-media-sources" })
    textButton(sourceActions, t("chooseLocalImage"), () => fileInput.click())
    const vaultImages = host.listDailyQuoteBackgroundImages?.() ?? []
    if (vaultImages.length) {
      const vault = sourceActions.createEl("select", { attr: { "aria-label": t("chooseVaultImage") } })
      vault.createEl("option", { text: t("chooseVaultImage"), attr: { value: "" } })
      vaultImages.forEach((item) => vault.createEl("option", { text: item.name, attr: { value: item.path } }))
      vault.addEventListener("change", () => {
        if (!vault.value) return
        updateDraft({ backgroundImage: vault.value, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 }); vault.value = ""; renderMedia()
      })
    }
    const urlDetails = background.createEl("details", { cls: "oneday-quote-url-source" })
    urlDetails.createEl("summary", { text: t("useImageUrl") })
    const urlRow = urlDetails.createDiv({ cls: "oneday-quote-url-row" })
    const url = urlRow.createEl("input", { attr: { type: "url", placeholder: "https://…", "aria-label": t("useImageUrl") } })
    textButton(urlRow, t("useImage"), () => {
      const value = url.value.trim()
      if (!/^https?:\/\//i.test(value)) return setStatus(t("quoteImageUrlInvalid"), true)
      updateDraft({ backgroundImage: value, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 }); urlDetails.open = false; renderMedia()
    })
    labeledRange(background, t("quoteOverlay"), draft.overlay, 0, .8, .05, (value) => updateDraft({ overlay: value }))
    renderMedia()

    const advanced = panel.createEl("details", { cls: "oneday-quote-advanced" })
    advanced.createEl("summary", { text: t("quoteAdvancedColors") })
    const colors = advanced.createDiv({ cls: "oneday-quote-settings-controls" })
    colorControl(colors, t("quoteBackgroundColor"), draft.backgroundColor, (value) => updateDraft({ backgroundColor: value }))
    colorControl(colors, t("quoteTextColor"), draft.textColor, (value) => updateDraft({ textColor: value }))
    colorControl(colors, t("quoteAccentColor"), draft.accentColor, (value) => updateDraft({ accentColor: value }))

    const footer = body.createDiv({ cls: "oneday-quote-settings-footer" })
    textButton(footer, t("restoreQuoteDefaults"), () => {
      draft = normalizeDailyQuoteAppearance(options.scope === "defaults" ? DEFAULT_DAILY_QUOTE_APPEARANCE : host.settings.dailyQuoteDefaults)
      renderDesign()
    })
    const primary = footer.createDiv({ cls: "oneday-quote-settings-primary-actions" })
    if (options.onCancel) textButton(primary, t("cancel"), options.onCancel)
    const applyLabel = options.scope === "defaults"
      ? t("setNewCardDefault")
      : options.scope === "block-and-defaults"
        ? t("applyAndSetNewCardDefault")
        : t("applyToCurrentCard")
    textButton(primary, applyLabel, async () => {
      try { setStatus(t("saving")); await options.onApply(normalizeDailyQuoteAppearance(draft)); setStatus(t("saved")) }
      catch { setStatus(t("saveFailed"), true) }
    }, "mod-cta")
    paintPreview()
  }

  const renderLibrary = (): void => {
    body.empty()
    body.className = "oneday-quote-settings-body is-library"
    const header = body.createDiv({ cls: "oneday-quote-library-header" })
    const copy = header.createDiv()
    copy.createEl("h4", { text: t("quoteLibrary") })
    copy.createEl("p", { text: t("quoteLibraryDescription") })
    const add = header.createEl("button", { cls: "oneday-quote-add", attr: { type: "button" } })
    setIcon(add, "plus"); add.createSpan({ text: t("addQuote") })
    const list = body.createDiv({ cls: "oneday-quote-library-list" })
    let composer: DailyQuoteDefinition | null = null
    let deleted: { quote: DailyQuoteDefinition; index: number } | null = null

    const persist = async (): Promise<boolean> => {
      host.settings.dailyQuotes.forEach((item, index) => { item.order = index })
      setStatus(t("saving"))
      try { await host.saveSettings({ rerender: true }); setStatus(t("saved")); return true }
      catch { setStatus(t("saveFailed"), true); return false }
    }
    const commitOrder = async (ids: string[]): Promise<boolean> => {
      const previous = [...host.settings.dailyQuotes]
      const previousOrders = new Map(previous.map((item) => [item.id, item.order]))
      const byId = new Map(previous.map((item) => [item.id, item]))
      const next = ids.map((id) => byId.get(id)).filter((item): item is DailyQuoteDefinition => Boolean(item))
      for (const item of previous) if (!ids.includes(item.id)) next.push(item)
      host.settings.dailyQuotes.splice(0, host.settings.dailyQuotes.length, ...next)
      if (await persist()) return true
      host.settings.dailyQuotes.splice(0, host.settings.dailyQuotes.length, ...previous)
      for (const item of previous) item.order = previousOrders.get(item.id) ?? item.order
      renderList()
      return false
    }
    const renderList = (): void => {
      list.empty()
      if (deleted) {
        const undo = list.createDiv({ cls: "oneday-quote-library-undo", attr: { role: "status" } })
        undo.createSpan({ text: t("quoteDeleted") })
        textButton(undo, t("undo"), async () => {
          if (!deleted) return
          host.settings.dailyQuotes.splice(deleted.index, 0, deleted.quote); deleted = null; await persist(); renderList()
        })
      }
      for (const quote of [...host.settings.dailyQuotes].sort((a, b) => a.order - b.order)) {
        renderQuoteRow(list, quote, host, async (direction) => {
          const values = host.settings.dailyQuotes.sort((a, b) => a.order - b.order)
          const index = values.findIndex((item) => item.id === quote.id)
          const target = Math.max(0, Math.min(values.length - 1, index + direction))
          if (target === index) return
          const ids = values.map((item) => item.id)
          const [moved] = ids.splice(index, 1); ids.splice(target, 0, moved)
          if (await commitOrder(ids)) renderList()
        }, async () => {
          const index = host.settings.dailyQuotes.findIndex((item) => item.id === quote.id)
          if (index < 0) return
          deleted = { quote, index }; host.settings.dailyQuotes.splice(index, 1); await persist(); renderList()
        }, commitOrder)
      }
      if (composer) renderQuoteComposer(list, composer, async () => {
        if (!composer?.text.trim()) return setStatus(t("quoteTextRequired"), true)
        host.settings.dailyQuotes.push({ ...composer, text: composer.text.trim(), author: composer.author.trim(), order: host.settings.dailyQuotes.length })
        composer = null; await persist(); renderList()
      }, () => { composer = null; renderList() })
    }
    add.addEventListener("click", () => {
      if (!composer) composer = { id: `quote-${Date.now().toString(36)}`, text: "", author: "", order: host.settings.dailyQuotes.length }
      renderList(); list.querySelector<HTMLTextAreaElement>(".oneday-quote-composer textarea")?.focus()
    })
    renderList()
  }

  renderTab()
}

function renderQuoteRow(
  list: HTMLElement,
  quote: DailyQuoteDefinition,
  host: DailyQuoteSettingsHost,
  move: (direction: -1 | 1) => Promise<void>,
  remove: () => Promise<void>,
  reorder: (ids: string[]) => Promise<boolean>
): void {
  const row = list.createDiv({ cls: "oneday-quote-library-row", attr: { "data-quote-id": quote.id } })
  const grip = row.createEl("button", {
    cls: "oneday-quote-library-grip",
    attr: { type: "button", "aria-label": t("reorderQuote") },
  })
  setIcon(grip, "grip-vertical")
  grip.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    void move(event.key === "ArrowUp" ? -1 : 1)
  })
  const summary = row.createDiv({ cls: "oneday-quote-library-summary" })
  summary.createEl("strong", { text: quote.text || t("quoteText") })
  if (quote.author) summary.createEl("span", { text: quote.author })
  const actions = row.createDiv({ cls: "oneday-quote-library-actions" })
  iconButton(actions, "pencil", t("editQuote"), () => row.classList.toggle("is-editing"))
  iconButton(actions, "trash-2", t("deleteQuote"), () => void remove(), "is-destructive")
  const editor = row.createDiv({ cls: "oneday-quote-library-editor" })
  const text = labeledTextarea(editor, t("quoteText"), quote.text)
  const author = labeledInput(editor, t("quoteAuthor"), quote.author)
  const editorActions = editor.createDiv({ cls: "oneday-quote-library-editor-actions" })
  textButton(editorActions, t("cancel"), () => { text.value = quote.text; author.value = quote.author; row.classList.remove("is-editing") })
  textButton(editorActions, t("save"), async () => {
    if (!text.value.trim()) return
    quote.text = text.value.trim(); quote.author = author.value.trim(); await host.saveSettings({ rerender: true }); row.classList.remove("is-editing")
    summary.querySelector("strong")!.textContent = quote.text
    const old = summary.querySelector("span")
    if (quote.author) old ? old.textContent = quote.author : summary.createEl("span", { text: quote.author })
    else old?.remove()
  }, "mod-cta")
  attachQuoteRowDrag(list, row, grip, reorder)
}

function attachQuoteRowDrag(
  list: HTMLElement,
  row: HTMLElement,
  grip: HTMLButtonElement,
  commit: (ids: string[]) => Promise<boolean>
): void {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let originalIndex = 0
  let dragging = false
  let placeholder: HTMLElement | null = null

  const rows = (): HTMLElement[] => Array.from(list.querySelectorAll<HTMLElement>(".oneday-quote-library-row"))
    .filter((candidate) => candidate !== row)

  const clearDragStyle = (): void => {
    row.classList.remove("is-dragging")
    for (const property of ["position", "left", "top", "width", "height", "transform", "z-index", "pointer-events"]) {
      row.style.removeProperty(property)
    }
  }

  const restoreOriginalPosition = (): void => {
    placeholder?.remove()
    placeholder = null
    clearDragStyle()
    const candidates = rows()
    list.insertBefore(row, candidates[originalIndex] ?? null)
  }

  const finish = (cancelled: boolean): void => {
    if (pointerId === null) return
    const activePointer = pointerId
    pointerId = null
    document.removeEventListener("keydown", onKeyDown, true)
    if (grip.hasPointerCapture(activePointer)) grip.releasePointerCapture(activePointer)
    if (!dragging) return
    dragging = false
    if (cancelled || !placeholder) return restoreOriginalPosition()
    list.insertBefore(row, placeholder)
    placeholder.remove()
    placeholder = null
    clearDragStyle()
    const ids = Array.from(list.querySelectorAll<HTMLElement>(".oneday-quote-library-row"))
      .map((candidate) => candidate.dataset.quoteId ?? "")
      .filter(Boolean)
    void commit(ids)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return
    event.preventDefault()
    finish(true)
  }

  const beginDrag = (event: PointerEvent): void => {
    const rect = row.getBoundingClientRect()
    originalIndex = Array.from(list.querySelectorAll<HTMLElement>(".oneday-quote-library-row")).indexOf(row)
    placeholder = document.createElement("div")
    placeholder.className = "oneday-quote-library-placeholder"
    placeholder.style.height = `${rect.height}px`
    list.insertBefore(placeholder, row)
    row.classList.add("is-dragging")
    row.style.position = "fixed"
    row.style.left = `${rect.left}px`
    row.style.top = `${rect.top}px`
    row.style.width = `${rect.width}px`
    row.style.height = `${rect.height}px`
    row.style.zIndex = "1000"
    row.style.pointerEvents = "none"
    dragging = true
    grip.setPointerCapture(event.pointerId)
  }

  const placePlaceholder = (clientY: number): void => {
    if (!placeholder) return
    const candidate = rows().find((item) => clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2)
    if (candidate) list.insertBefore(placeholder, candidate)
    else list.appendChild(placeholder)
  }

  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || row.classList.contains("is-editing")) return
    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    grip.setPointerCapture(event.pointerId)
    document.addEventListener("keydown", onKeyDown, true)
    event.preventDefault()
  })
  grip.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!dragging && Math.hypot(dx, dy) < 5) return
    if (!dragging) beginDrag(event)
    row.style.transform = `translate3d(0, ${event.clientY - startY}px, 0)`
    placePlaceholder(event.clientY)
    const edge = 56
    if (event.clientY < edge) window.scrollBy(0, -Math.min(14, edge - event.clientY))
    else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, Math.min(14, event.clientY - (window.innerHeight - edge)))
  })
  grip.addEventListener("pointerup", () => finish(false))
  grip.addEventListener("pointercancel", () => finish(true))
  grip.addEventListener("lostpointercapture", () => {
    if (pointerId !== null) finish(true)
  })
}

function renderQuoteComposer(container: HTMLElement, draft: DailyQuoteDefinition, save: () => void | Promise<void>, cancel: () => void): void {
  const row = container.createDiv({ cls: "oneday-quote-composer" })
  row.createEl("h5", { text: t("newQuote") })
  const text = labeledTextarea(row, t("quoteText"), draft.text)
  const author = labeledInput(row, t("quoteAuthor"), draft.author)
  text.addEventListener("input", () => { draft.text = text.value })
  author.addEventListener("input", () => { draft.author = author.value })
  const actions = row.createDiv({ cls: "oneday-quote-library-editor-actions" })
  textButton(actions, t("cancel"), cancel)
  textButton(actions, t("saveQuote"), save, "mod-cta")
}

function attachCropInteraction(card: HTMLElement, getAppearance: () => DailyQuoteAppearance, update: (value: DailyQuoteAppearance) => void): void {
  let pointerId: number | null = null
  let originX = 0, originY = 0, startX = 0, startY = 0
  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return
    pointerId = event.pointerId; originX = event.clientX; originY = event.clientY
    const appearance = getAppearance(); startX = appearance.imageFocalX; startY = appearance.imageFocalY
    card.setPointerCapture(event.pointerId); event.preventDefault()
  })
  card.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) return
    const rect = card.getBoundingClientRect()
    update({ ...getAppearance(), imageFocalX: clamp(startX - (event.clientX - originX) / Math.max(1, rect.width)), imageFocalY: clamp(startY - (event.clientY - originY) / Math.max(1, rect.height)) })
  })
  const end = (event: PointerEvent): void => { if (pointerId === event.pointerId) pointerId = null }
  card.addEventListener("pointerup", end); card.addEventListener("pointercancel", end)
  card.addEventListener("keydown", (event) => {
    const amount = event.shiftKey ? .05 : .01
    const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[event.key]
    if (!delta) return
    event.preventDefault(); const current = getAppearance()
    update({ ...current, imageFocalX: clamp(current.imageFocalX + delta[0]), imageFocalY: clamp(current.imageFocalY + delta[1]) })
  })
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)) }
function designSection(container: HTMLElement, title: string): HTMLElement {
  const section = container.createDiv({ cls: "oneday-quote-design-section" }); section.createEl("h4", { text: title }); return section
}

let fieldId = 0
function field(container: HTMLElement, label: string): { row: HTMLElement; id: string } {
  const row = container.createDiv({ cls: "oneday-quote-setting-field" })
  const id = `oneday-quote-field-${++fieldId}`
  row.createEl("label", { text: label, attr: { for: id } })
  return { row, id }
}

function selectControl(container: HTMLElement, label: string, value: string, options: [string, string][], onChange: (value: string) => void | Promise<void>): void {
  const { row, id } = field(container, label); const select = row.createEl("select", { attr: { id } })
  options.forEach(([key, text]) => select.createEl("option", { text, attr: { value: key } })); select.value = value
  select.addEventListener("change", () => void onChange(select.value))
}

function labeledRange(
  container: HTMLElement,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
  format: (value: number) => string = (next) => `${Math.round(next * 100)}%`
): HTMLElement {
  const { row, id } = field(container, label); const wrap = row.createDiv({ cls: "oneday-quote-range" })
  const input = wrap.createEl("input", { attr: { id, type: "range", min: String(min), max: String(max), step: String(step) } })
  const output = wrap.createEl("output", { text: format(value), attr: { for: id } }); input.value = String(value)
  input.addEventListener("input", () => { const next = Number(input.value); output.textContent = format(next); onChange(next) }); return row
}

function colorControl(container: HTMLElement, label: string, value: string, onChange: (value: string) => void | Promise<void>): void {
  const { row, id } = field(container, label); const wrap = row.createDiv({ cls: "oneday-quote-color-control" })
  const color = wrap.createEl("input", { attr: { id, type: "color", "aria-label": label } })
  color.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"
  const text = wrap.createEl("input", { attr: { type: "text", placeholder: t("quoteThemeDefault"), "aria-label": `${label} ${t("colorValue")}` } }); text.value = value
  color.addEventListener("input", () => { text.value = color.value }); color.addEventListener("change", () => void onChange(color.value)); text.addEventListener("change", () => void onChange(text.value.trim()))
}

function labeledTextarea(container: HTMLElement, label: string, value: string): HTMLTextAreaElement {
  const { row, id } = field(container, label); const input = row.createEl("textarea", { attr: { id, rows: "3" } }); input.value = value; return input
}
function labeledInput(container: HTMLElement, label: string, value: string): HTMLInputElement {
  const { row, id } = field(container, label); const input = row.createEl("input", { attr: { id, type: "text" } }); input.value = value; return input
}
function textButton(container: HTMLElement, label: string, action: () => void | Promise<void>, cls = ""): HTMLButtonElement {
  const button = container.createEl("button", { cls, text: label, attr: { type: "button" } }); button.addEventListener("click", () => void action()); return button
}
function iconButton(container: HTMLElement, icon: string, label: string, action: () => void, cls = ""): HTMLButtonElement {
  const button = container.createEl("button", { cls: `oneday-quote-icon-button ${cls}`, attr: { type: "button", "aria-label": label } }); setIcon(button, icon); button.addEventListener("click", action); return button
}
