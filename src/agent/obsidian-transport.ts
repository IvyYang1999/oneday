/** Obsidian requestUrl adapter（绕 CORS；移动端也可用）. */
import { requestUrl } from "obsidian"
import { HttpTransport } from "./direct-runner"

export const obsidianTransport: HttpTransport = async (req) => {
  const res = await requestUrl({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    throw: false,
  })
  return { status: res.status, json: res.json as unknown }
}
