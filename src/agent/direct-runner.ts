/** HTTP runner for the dialog: model API 直调（D7 不变——插件仍是唯一写回方）. */
import { ApiConfig, buildChatRequest, parseChatResponse } from "./api-client"

export type ApiRunResult =
  | { ok: true; text: string }
  | { ok: false; reason: string }

/** Minimal HTTP shape; Obsidian requestUrl and test stubs both satisfy it. */
export interface HttpTransport {
  (req: { url: string; method: string; headers: Record<string, string>; body: string }): Promise<{
    status: number
    json: unknown
  }>
}

export async function runEntryAgentApi(
  userText: string,
  systemPrompt: string,
  cfg: ApiConfig,
  http: HttpTransport
): Promise<ApiRunResult> {
  if (!cfg.apiKey.trim()) {
    return { ok: false, reason: "请先在 Oneday 设置里填 API Key" }
  }
  if (!cfg.baseUrl.trim() || !cfg.model.trim()) {
    return { ok: false, reason: "请先在 Oneday 设置里填 Base URL 和模型名" }
  }
  const req = buildChatRequest(cfg, systemPrompt, userText)
  let res
  try {
    res = await http(req)
  } catch (error) {
    return { ok: false, reason: `网络请求失败：${error instanceof Error ? error.message : String(error)}` }
  }
  return parseChatResponse(cfg.provider, res.status, res.json)
}
