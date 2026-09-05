import { DEFAULT_TYPE_COLORS } from "./type-colors"

export interface CategoryPaletteSettings {
  spanTypeColors: Record<string, string>
  markerTypeColors: Record<string, string>
  spanRetiredTypeColors: Record<string, string>
  markerRetiredTypeColors: Record<string, string>
}

export interface LegacyCategoryPaletteSettings extends Partial<CategoryPaletteSettings> {
  typeColors?: Record<string, string>
  retiredTypeColors?: Record<string, string>
}

/** The former shared palette becomes spans; point categories start independent. */
export function migrateCategoryPalettes(data: LegacyCategoryPaletteSettings | null): CategoryPaletteSettings {
  const legacyRenderColors = { ...(data?.retiredTypeColors ?? {}), ...(data?.typeColors ?? {}) }
  return {
    spanTypeColors: { ...(data?.spanTypeColors ?? data?.typeColors ?? DEFAULT_TYPE_COLORS) },
    markerTypeColors: { ...(data?.markerTypeColors ?? {}) },
    spanRetiredTypeColors: { ...(data?.spanRetiredTypeColors ?? data?.retiredTypeColors ?? {}) },
    // Existing markers keep their former shared colors without exposing those
    // names as choices for newly created markers.
    markerRetiredTypeColors: { ...(data?.markerRetiredTypeColors ?? legacyRenderColors) },
  }
}
