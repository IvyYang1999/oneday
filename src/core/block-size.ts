export interface BlockSize {
  width: number
  height: number
}

export const MIN_BLOCK_WIDTH = 240
export const MIN_BLOCK_HEIGHT = 160
export const MAX_BLOCK_SIZE = 4096
export const MIN_CANVAS_WIDTH = 240
export const MAX_CANVAS_WIDTH = 8192

const BLOCK_SIZE_RE = /^(\d+)\s*[x×]\s*(\d+)$/i

export function parseBlockSize(value: string): BlockSize | null {
  const match = BLOCK_SIZE_RE.exec(value.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (
    !Number.isFinite(width) || !Number.isFinite(height) ||
    width < MIN_BLOCK_WIDTH || width > MAX_BLOCK_SIZE ||
    height < MIN_BLOCK_HEIGHT || height > MAX_BLOCK_SIZE
  ) return null
  return { width: Math.round(width), height: Math.round(height) }
}

export function parseCanvasWidth(value: string): number | null {
  const width = Number(value)
  if (!Number.isFinite(width) || width < MIN_CANVAS_WIDTH || width > MAX_CANVAS_WIDTH) return null
  return Math.round(width)
}

export function serializeBlockSize(size: BlockSize): string {
  return `${Math.round(size.width)}x${Math.round(size.height)}`
}
