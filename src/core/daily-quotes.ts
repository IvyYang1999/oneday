export type DailyQuoteTheme = "timeline" | "paper" | "midnight" | "aurora" | "photo"
export type DailyQuoteLayout = "left" | "center" | "editorial"
export type DailyQuoteFont = "interface" | "serif" | "mono"

export interface DailyQuoteDefinition {
  id: string
  text: string
  author: string
  order: number
}

export interface DailyQuoteAppearance {
  theme: DailyQuoteTheme
  layout: DailyQuoteLayout
  font: DailyQuoteFont
  fontSize: number
  backgroundColor: string
  textColor: string
  accentColor: string
  backgroundImage: string
  overlay: number
  /** Non-destructive background-image crop. Values are normalized and persisted. */
  imageFocalX: number
  imageFocalY: number
  imageZoom: number
}

export interface DailyQuoteBlockState {
  quoteId?: string
  text?: string
  author?: string
  appearance: Partial<DailyQuoteAppearance>
}

export const DAILY_QUOTE_THEMES: Record<DailyQuoteTheme, DailyQuoteAppearance> = {
  timeline: { theme: "timeline", layout: "left", font: "interface", fontSize: 20, backgroundColor: "", textColor: "", accentColor: "", backgroundImage: "", overlay: 0.28, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 },
  paper: { theme: "paper", layout: "center", font: "serif", fontSize: 22, backgroundColor: "#f4efe5", textColor: "#29251f", accentColor: "#a4663a", backgroundImage: "", overlay: 0.18, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 },
  midnight: { theme: "midnight", layout: "center", font: "serif", fontSize: 22, backgroundColor: "#201d2e", textColor: "#f5f1ff", accentColor: "#a98aff", backgroundImage: "", overlay: 0.34, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 },
  aurora: { theme: "aurora", layout: "editorial", font: "interface", fontSize: 20, backgroundColor: "#e6f4ef", textColor: "#173d35", accentColor: "#31a887", backgroundImage: "", overlay: 0.2, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 },
  photo: { theme: "photo", layout: "editorial", font: "serif", fontSize: 22, backgroundColor: "#171923", textColor: "#ffffff", accentColor: "#ffffff", backgroundImage: "", overlay: 0.44, imageFocalX: .5, imageFocalY: .5, imageZoom: 1 },
}

export const DEFAULT_DAILY_QUOTE_APPEARANCE: DailyQuoteAppearance = { ...DAILY_QUOTE_THEMES.timeline }

const THEMES = new Set(Object.keys(DAILY_QUOTE_THEMES))
const LAYOUTS = new Set<DailyQuoteLayout>(["left", "center", "editorial"])
const FONTS = new Set<DailyQuoteFont>(["interface", "serif", "mono"])

export function normalizeDailyQuoteDefinition(value: Partial<DailyQuoteDefinition>, order: number): DailyQuoteDefinition {
  return {
    id: String(value.id || `quote-${order + 1}`).replace(/[^a-z0-9_-]/gi, "-").slice(0, 80),
    text: String(value.text ?? ""),
    author: String(value.author ?? ""),
    order: Number.isFinite(value.order) ? Number(value.order) : order,
  }
}

export function normalizeDailyQuoteAppearance(value?: Partial<DailyQuoteAppearance>): DailyQuoteAppearance {
  const theme = THEMES.has(String(value?.theme)) ? value!.theme! : DEFAULT_DAILY_QUOTE_APPEARANCE.theme
  const base = DAILY_QUOTE_THEMES[theme]
  return {
    theme,
    layout: LAYOUTS.has(value?.layout as DailyQuoteLayout) ? value!.layout! : base.layout,
    font: FONTS.has(value?.font as DailyQuoteFont) ? value!.font! : base.font,
    fontSize: Math.max(14, Math.min(48, Number(value?.fontSize) || base.fontSize)),
    backgroundColor: normalizeCssColor(value?.backgroundColor) ?? base.backgroundColor,
    textColor: normalizeCssColor(value?.textColor) ?? base.textColor,
    accentColor: normalizeCssColor(value?.accentColor) ?? base.accentColor,
    backgroundImage: normalizeBackgroundImage(value?.backgroundImage),
    overlay: Math.max(0, Math.min(0.8, Number.isFinite(value?.overlay) ? Number(value!.overlay) : base.overlay)),
    imageFocalX: clamp(Number(value?.imageFocalX), 0, 1, base.imageFocalX),
    imageFocalY: clamp(Number(value?.imageFocalY), 0, 1, base.imageFocalY),
    imageZoom: clamp(Number(value?.imageZoom), 1, 3, base.imageZoom),
  }
}

export function applyDailyQuoteTheme(theme: DailyQuoteTheme, current?: Partial<DailyQuoteAppearance>): DailyQuoteAppearance {
  const preset = DAILY_QUOTE_THEMES[theme]
  return normalizeDailyQuoteAppearance({
    ...preset,
    backgroundImage: current?.backgroundImage ?? preset.backgroundImage,
    imageFocalX: current?.imageFocalX ?? preset.imageFocalX,
    imageFocalY: current?.imageFocalY ?? preset.imageFocalY,
    imageZoom: current?.imageZoom ?? preset.imageZoom,
  })
}

export function orderedDailyQuotes(values: DailyQuoteDefinition[]): DailyQuoteDefinition[] {
  return values.filter((item) => item.text.trim()).sort((a, b) => a.order - b.order)
}

export function dailyQuoteForDate(values: DailyQuoteDefinition[], date: string): DailyQuoteDefinition | null {
  const quotes = orderedDailyQuotes(values)
  if (quotes.length === 0) return null
  let hash = 0
  for (const char of date) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
  return quotes[hash % quotes.length]
}

export function resolveDailyQuote(values: DailyQuoteDefinition[], date: string, state: DailyQuoteBlockState): DailyQuoteDefinition | null {
  const selected = values.find((item) => item.id === state.quoteId && item.text.trim())
  if (selected) return selected
  if (state.text?.trim()) return { id: state.quoteId || "snapshot", text: state.text, author: state.author ?? "", order: -1 }
  return dailyQuoteForDate(values, date)
}

export function nextDailyQuote(values: DailyQuoteDefinition[], currentId?: string): DailyQuoteDefinition | null {
  const quotes = orderedDailyQuotes(values)
  if (quotes.length === 0) return null
  const index = quotes.findIndex((item) => item.id === currentId)
  return quotes[(index + 1 + quotes.length) % quotes.length]
}

/**
 * A card edit defines both the visible card and the template used by cards
 * created later. Existing cards keep their own source snapshot.
 *
 * Apply the Block snapshot first: a settings write must never make the user
 * lose the edit they can already see. If persisting the future-card default
 * fails, restore the in-memory default and surface the error to the editor.
 */
export async function applyDailyQuoteAppearanceToCurrentAndFuture(
  settings: { dailyQuoteDefaults: DailyQuoteAppearance },
  value: Partial<DailyQuoteAppearance>,
  applyCurrent: (appearance: DailyQuoteAppearance) => void | Promise<void>,
  persistDefaults: () => void | Promise<void>
): Promise<DailyQuoteAppearance> {
  const appearance = normalizeDailyQuoteAppearance(value)
  await applyCurrent(appearance)
  const previous = settings.dailyQuoteDefaults
  settings.dailyQuoteDefaults = appearance
  try {
    await persistDefaults()
  } catch (error) {
    settings.dailyQuoteDefaults = previous
    throw error
  }
  return appearance
}

function normalizeCssColor(value: unknown): string | null {
  const text = String(value ?? "").trim()
  if (!text) return ""
  return /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^<>;]+\)|var\(--[a-z0-9-]+\))$/i.test(text) ? text : null
}

function normalizeBackgroundImage(value: unknown): string {
  const text = String(value ?? "").trim()
  if (!text || text.length > 500 || /[\n\r<>]/.test(text)) return ""
  return text
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}
