/** Pure type->color config helpers (荧光笔色号, D2). Obsidian-free, unit-testable. */

export const DEFAULT_TYPE_COLORS: Record<string, string> = {
  math: "#7fd4c1",
  micro: "#9bd17b",
  english: "#f6c667",
  sleep: "#d9d9d9",
  meal: "#f5a3b7",
  misc: "#c8b6e2",
}

/** Parse "type: #hex" lines (blank lines and // comments ignored). */
export function parseTypeColors(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === "" || line.startsWith("//")) continue
    const m = /^([A-Za-z][\w-]*)\s*[:=]\s*(#[0-9A-Fa-f]{3,8}|[A-Za-z].*)$/.exec(line)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

export function serializeTypeColors(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([type, color]) => `${type}: ${color}`)
    .join("\n")
}

/** 未登记类型的确定性颜色：同名同色（替代全灰兜底，yyt 2026-08-17）。 */
export function hashTypeColor(type: string): string {
  let h = 0
  for (const ch of type) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  }
  return `hsl(${h % 360} 62% 62%)`
}
