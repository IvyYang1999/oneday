import { describe, expect, it } from "vitest"
import { buildTypeMenuOptions } from "./block-menu-model"

describe("block type submenu model", () => {
  it("keeps every type in one secondary menu and marks the current type", () => {
    expect(buildTypeMenuOptions(["开发", "运动", "睡觉"], "开发")).toEqual([
      { title: "开发", type: "开发", checked: true },
      { title: "运动", type: "运动", checked: false },
      { title: "睡觉", type: "睡觉", checked: false },
    ])
  })

  it("deduplicates types while retaining a missing legacy current type", () => {
    expect(buildTypeMenuOptions(["运动", "运动"], "旧类型")).toEqual([
      { title: "旧类型", type: "旧类型", checked: true },
      { title: "运动", type: "运动", checked: false },
    ])
  })
})
