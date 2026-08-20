import esbuild from "esbuild"
import fs from "node:fs"
import path from "node:path"
import os from "os"
const out = path.join(os.tmpdir(), "oneday-diag2")
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "e.ts"), `
export { buildSystemPrompt } from "/Users/yytyyf/projects/oneday/src/agent/prompt"
export { parseTimeline } from "/Users/yytyyf/projects/oneday/src/core/parser"
`)
await esbuild.build({ entryPoints: [path.join(out, "e.ts")], bundle: true, format: "cjs", platform: "node", outfile: path.join(out, "l.cjs"), logLevel: "silent", external: ["obsidian"] })
const { buildSystemPrompt, parseTimeline } = await import(path.join(out, "l.cjs"))
const cfg = JSON.parse(fs.readFileSync("/Users/yytyyf/Vaults/main/.obsidian/plugins/oneday/data.json", "utf8"))
const sys = buildSystemPrompt({ typeColors: cfg.typeColors, now: new Date(), doc: parseTimeline("range: 7-23\n---\n") })
const r = await fetch(cfg.baseUrl.replace(/\/$/, "") + "/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + cfg.apiKey },
  body: JSON.stringify({ model: cfg.model, max_tokens: 300, temperature: 0, messages: [
    { role: "system", content: sys },
    { role: "user", content: "今天早上9：15醒来，然后浪费了35分钟刷手机" },
  ]}),
})
const j = await r.json()
console.log(JSON.stringify(j).slice(0, 400))
