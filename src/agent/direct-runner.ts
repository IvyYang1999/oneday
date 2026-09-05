/** HTTP runner for the dialog: model API 直调（D7 不变——插件仍是唯一写回方）. */
import { ApiConfig, buildChatRequest, parseChatResponse } from "./api-client"
import { t } from "../i18n"

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
  http: HttpTransport,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<ApiRunResult> {
  if (!cfg.apiKey.trim()) {
    return { ok: false, reason: t("missingApiKey") }
  }
  if (!cfg.baseUrl.trim() || !cfg.model.trim()) {
    return { ok: false, reason: t("missingApiEndpoint") }
  }
  const req = buildChatRequest(cfg, systemPrompt, userText, history)
  let res
  try {
    res = await http(req)
  } catch (error) {
    return { ok: false, reason: t("networkFailed", { reason: error instanceof Error ? error.message : String(error) }) }
  }
  return parseChatResponse(cfg.provider, res.status, res.json)
}
