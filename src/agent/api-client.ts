/**
 * Direct model API client (2026-08-16 yyt 拍板：设置页填 API key 直调模型，
 * 替代绕本地 CLI；任务就是简单 JSON 生成，system prompt 植入规则+上下文).
 *
 * Pure request builders/parsers; HTTP 层由调用方注入（Obsidian 用 requestUrl
 * 绕 CORS，测试用 stub）。
 */

export type ApiProvider = "openai-compatible" | "anthropic"

export interface ApiConfig {
  provider: ApiProvider
  apiKey: string
  baseUrl: string
  model: string
}

export interface BuiltRequest {
  url: string
  method: "POST"
  headers: Record<string, string>
  /** JSON string body */
  body: string
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "")
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export function buildChatRequest(cfg: ApiConfig, systemPrompt: string, userText: string, history: ChatMessage[] = []): BuiltRequest {
  if (cfg.provider === "anthropic") {
    return {
      url: `${stripTrailingSlash(cfg.baseUrl)}/v1/messages`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 2048 // 推理模型 thinking 占预算，300 会截断正文（yyt 2026-08-20 实证 finish_reason=length）,
        system: systemPrompt,
        messages: [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: userText }],
      }),
    }
  }
  return {
    url: `${stripTrailingSlash(cfg.baseUrl)}/chat/completions`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 2048 // 推理模型 thinking 占预算，300 会截断正文（yyt 2026-08-20 实证 finish_reason=length）,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((h) => ({ role: h.role as string, content: h.content })),
        { role: "user", content: userText },
      ],
    }),
  }
}

export type ParsedResponse = { ok: true; text: string } | { ok: false; reason: string }

/** Parse the HTTP JSON body of either provider into plain text. */
export function parseChatResponse(provider: ApiProvider, status: number, body: unknown): ParsedResponse {
  if (body === null || typeof body !== "object") {
    return { ok: false, reason: `响应不是 JSON（HTTP ${status}）` }
  }
  const obj = body as Record<string, unknown>
  if (status < 200 || status >= 300) {
    const err = (obj.error as Record<string, unknown> | undefined)?.message
    return { ok: false, reason: `HTTP ${status}${typeof err === "string" ? `：${err}` : ""}` }
  }
  if (provider === "anthropic") {
    const content = obj.content
    if (Array.isArray(content)) {
      const textPart = content.find((p) => (p as Record<string, unknown>).type === "text") as
        | Record<string, unknown>
        | undefined
      if (textPart && typeof textPart.text === "string") return { ok: true, text: textPart.text }
    }
    return { ok: false, reason: "响应里没有文本内容" }
  }
  const choices = obj.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined
    if (msg && typeof msg.content === "string") return { ok: true, text: msg.content }
  }
  return { ok: false, reason: "响应里没有文本内容" }
}
