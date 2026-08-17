/**
 * Grid layout model (yyt 2026-08-17: 组件手柄拖拽移动+缩放、自动吸附).
 * 12 columns x 20px rows; each component is {id,x,y,w,h}, persisted in the
 * `layout:` header as:  layout: text@0,0,6,12 toolbar@6,0,6,2 ...
 * Overlaps resolve by pushing down (gridstack-style vertical compaction).
 */

export const GRID_COLS = 12
export const GRID_ROW_H = 20

export type SlotId = string // 核心: toolbar|timeline|stats|dialog；文本框: text, text2, text3…
export const CORE_SLOT_IDS = ["toolbar", "timeline", "stats", "dialog"] as const
export function isTextSlot(id: SlotId): boolean {
  return id === "text" || /^text\d+$/.test(id)
}
export function isValidSlotId(id: string): id is SlotId {
  return (CORE_SLOT_IDS as readonly string[]).includes(id) || isTextSlot(id)
}

export interface GridItem {
  id: SlotId
  x: number
  y: number
  w: number
  h: number
}

const TOKEN_RE = /^([a-z][a-z0-9]*)@(\d+),(\d+),(\d+),(\d+)$/

export function parseLayoutHeader(value: string): GridItem[] | null {
  const items: GridItem[] = []
  for (const token of value.trim().split(/\s+/)) {
    const m = TOKEN_RE.exec(token)
    if (!m || !isValidSlotId(m[1])) continue
    items.push(clampItem({ id: m[1] as SlotId, x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))
  }
  if (items.length === 0) return null
  // dedupe by id, first wins
  const seen = new Set<string>()
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
}

export function serializeLayoutHeader(items: GridItem[]): string {
  return items.map((it) => `${it.id}@${it.x},${it.y},${it.w},${it.h}`).join(" ")
}

export function clampItem(it: GridItem): GridItem {
  const w = Math.min(GRID_COLS, Math.max(1, it.w))
  const h = Math.max(1, it.h)
  return {
    ...it,
    w,
    h,
    x: Math.min(GRID_COLS - w, Math.max(0, it.x)),
    y: Math.max(0, it.y),
  }
}

export function overlaps(a: GridItem, b: GridItem): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Push-down compaction: later items overlapping earlier ones get pushed below.
 * priorityId（正在被拖拽的组件）先落位——拖动的组件赢，别人让它。
 */
export function resolveOverlaps(items: GridItem[], priorityId?: SlotId): GridItem[] {
  const sorted = [...items].sort((a, b) => {
    if (priorityId) {
      if (a.id === priorityId) return -1
      if (b.id === priorityId) return 1
    }
    return a.y - b.y || a.x - b.x
  })
  const out: GridItem[] = []
  for (const raw of sorted) {
    const it = { ...raw }
    let moved = true
    while (moved) {
      moved = false
      for (const placed of out) {
        if (overlaps(it, placed)) {
          it.y = placed.y + placed.h
          moved = true
        }
      }
    }
    out.push(it)
  }
  return out
}

/** Default arrangement (px heights converted to rows by caller-supplied estimates). */
export function defaultGrid(textCount: number, side: "left" | "right" | undefined, timelineRows: number): GridItem[] {
  const rail: GridItem[] = [
    { id: "toolbar", x: 0, y: 0, w: 0, h: 3 },
    { id: "timeline", x: 0, y: 0, w: 0, h: Math.max(4, timelineRows) },
    { id: "stats", x: 0, y: 0, w: 0, h: 1 },
    { id: "dialog", x: 0, y: 0, w: 0, h: 4 },
  ]
  if (textCount === 0) {
    let y = 0
    return rail.map((it) => {
      const r = { ...it, x: 0, y, w: GRID_COLS }
      y += r.h
      return r
    })
  }
  const railCol = side === "left" ? 0 : 6
  const textCol = side === "left" ? 6 : 0
  // 每个文本框一个槽位，左列竖排；默认小巧（4 行），随输入自动撑高
  const items: GridItem[] = []
  let textY = 0
  for (let i = 0; i < textCount; i++) {
    items.push({ id: i === 0 ? "text" : `text${i + 1}`, x: textCol, y: textY, w: 6, h: 4 })
    textY += 4
  }
  let y = 0
  for (const it of rail) {
    items.push({ ...it, x: railCol, y, w: 6 })
    y += it.h
  }
  return items
}

/** Effective grid: header layout completed with any missing slots (appended below). */
export function resolveGrid(
  parsed: GridItem[] | null,
  textCount: number,
  side: "left" | "right" | undefined,
  timelineRows: number,
  hiddenSlots: SlotId[] = []
): GridItem[] {
  const wantTextIds = Array.from({ length: textCount }, (_, i) => (i === 0 ? "text" : `text${i + 1}`))
  const base = parsed ?? defaultGrid(textCount, side, timelineRows)
  // 隐藏槽位剔除；文本槽位数量与文本区数量对齐
  let items = base.filter((it) => !hiddenSlots.includes(it.id) && (!isTextSlot(it.id) || wantTextIds.includes(it.id)))
  const present = new Set(items.map((it) => it.id))
  const required: SlotId[] = [...wantTextIds, ...CORE_SLOT_IDS].filter((id) => !hiddenSlots.includes(id))
  let maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  for (const id of required) {
    if (present.has(id)) continue
    const d = defaultGrid(textCount, side, timelineRows).find((it) => it.id === id)!
    items.push({ ...d, y: maxY })
    maxY += d.h
    present.add(id)
  }
  items = items.map(clampItem)
  return compactGrid(resolveOverlaps(items))
}

/**
 * Gravity compaction (iOS 主屏/gridstack): items fall up, then slide left,
 * then fall up again — no stray gaps. anchorId（被拖组件）保持在原位，
 * 其他组件绕着它压实。
 */
export function compactGrid(items: GridItem[], anchorId?: SlotId): GridItem[] {
  const anchor = anchorId ? items.find((i) => i.id === anchorId) : undefined
  const placed: GridItem[] = anchor ? [{ ...anchor }] : []
  const rest = items.filter((i) => i.id !== anchorId)

  const overlapWithPlaced = (it: GridItem): GridItem[] => placed.filter((p) => overlaps(it, p))

  // pass 1: 向上落
  for (const raw of [...rest].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const it = { ...raw, y: 0 }
    for (;;) {
      const blockers = overlapWithPlaced(it)
      if (blockers.length === 0) break
      it.y = Math.min(...blockers.map((b) => b.y + b.h))
    }
    placed.push(it)
  }
  // pass 2: 向左滑
  for (const it of [...placed].sort((a, b) => a.x - b.x || a.y - b.y)) {
    if (anchor && it.id === anchor.id) continue
    const others = placed.filter((p) => p !== it)
    it.x = 0
    for (;;) {
      const blockers = others.filter((p) => overlaps(it, p))
      if (blockers.length === 0) break
      const nx = Math.min(...blockers.map((b) => b.x + b.w))
      if (nx > GRID_COLS - it.w) break // 右边界，滑不动就停
      it.x = nx
    }
  }
  // pass 3: 再向上落一次（左滑可能腾出上方空间）
  const finalPlaced: GridItem[] = anchor ? [placed.find((p) => p.id === anchor.id)!] : []
  for (const raw of placed.filter((p) => !anchor || p.id !== anchor.id).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const it = { ...raw, y: 0 }
    for (;;) {
      const blockers = finalPlaced.filter((p) => overlaps(it, p))
      if (blockers.length === 0) break
      it.y = Math.min(...blockers.map((b) => b.y + b.h))
    }
    finalPlaced.push(it)
  }
  return finalPlaced
}

/** Total grid height in rows. */
export function gridRows(items: GridItem[]): number {
  return items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
}
