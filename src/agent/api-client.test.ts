import { describe, expect, it } from "vitest"
import { buildChatRequest, parseChatResponse, ApiConfig } from "./api-client"

const OAI: ApiConfig = { provider: "openai-compatible", apiKey: "sk-test", baseUrl: "https://open.bigmodel.cn/api/paas/v4/", model: "glm-4.5-air" }
const ANT: ApiConfig = { provider: "anthropic", apiKey: "sk-ant", baseUrl: "https://api.anthropic.com", model: "claude-haiku-4-5" }

describe("buildChatRequest", () => {
  it("builds an OpenAI-compatible request (strips trailing slash, bearer auth, system+user)", () => {
    const r = buildChatRequest(OAI, "SYS", "刚健身半小时")
    expect(r.url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions")
    expect(r.headers.authorization).toBe("Bearer sk-test")
    const body = JSON.parse(r.body)
    expect(body.model).toBe("glm-4.5-air")
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "刚健身半小时" },
    ])
  })

  it("builds an Anthropic request (x-api-key, system top-level)", () => {
    const r = buildChatRequest(ANT, "SYS", "刚健身半小时")
    expect(r.url).toBe("https://api.anthropic.com/v1/messages")
    expect(r.headers["x-api-key"]).toBe("sk-ant")
    const body = JSON.parse(r.body)
    expect(body.system).toBe("SYS")
    expect(body.messages).toHaveLength(1)
  })
})

describe("parseChatResponse", () => {
  it("extracts OpenAI-compatible content", () => {
    const r = parseChatResponse("openai-compatible", 200, { choices: [{ message: { content: '{"start":"21:05"}' } }] })
    expect(r).toEqual({ ok: true, text: '{"start":"21:05"}' })
  })

  it("extracts Anthropic text part", () => {
    const r = parseChatResponse("anthropic", 200, { content: [{ type: "text", text: "{}" }] })
    expect(r).toEqual({ ok: true, text: "{}" })
  })

  it("surfaces HTTP errors with provider message", () => {
    const r = parseChatResponse("openai-compatible", 401, { error: { message: "invalid key" } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain("401")
    if (!r.ok) expect(r.reason).toContain("invalid key")
  })

  it("rejects malformed payloads", () => {
    expect(parseChatResponse("openai-compatible", 200, {}).ok).toBe(false)
    expect(parseChatResponse("anthropic", 200, { content: [] }).ok).toBe(false)
    expect(parseChatResponse("openai-compatible", 200, null).ok).toBe(false)
  })
})
