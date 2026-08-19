/** 深色荧光笔上文字反色：WCAG 相对亮度，深底白字浅底黑字（yyt 2026-08-19） */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [r + m, g + m, b + m]
}

export function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim())
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split("").map((c) => c + c).join("")
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
  }
  const hsl = /^hsl\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%\s*\)$/i.exec(color.trim())
  if (hsl) return hslToRgb(Number(hsl[1]) % 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100)
  return null
}

/** WCAG 相对亮度 0..1 */
export function relativeLuminance(color: string): number | null {
  const rgb = parseColor(color)
  if (!rgb) return null
  const f = (c: number): number => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2])
}

/** 底色深 -> 白字；底色浅 -> 深字。 */
export function readableTextColor(bgColor: string): string {
  const lum = relativeLuminance(bgColor)
  if (lum === null) return "#1a1a1a"
  return lum < 0.42 ? "#ffffff" : "#1a1a1a"
}
