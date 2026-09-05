import { describe, expect, it } from "vitest"
import { parseTimeline } from "./parser"
import { formatTodoViewHeaderValue, parseTodoViewHeaderValue } from "./todos"

describe("todo view rules", () => {
  it("round-trips the block-local grouping and sorting rule", () => {
    const value = { groupBy: "category", sortBy: "estimate" } as const
    expect(formatTodoViewHeaderValue(value)).toBe("group=category sort=estimate")
    expect(parseTodoViewHeaderValue("sort=estimate group=category")).toEqual(value)
    expect(parseTimeline("todo-view: group=category sort=estimate\n---").todoView).toEqual(value)
  })

  it("fails closed for unknown view rules", () => {
    expect(parseTodoViewHeaderValue("group=project sort=manual")).toBeNull()
    expect(parseTodoViewHeaderValue("group=none sort=random")).toBeNull()
  })
})
