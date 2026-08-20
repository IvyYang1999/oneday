/**
 * System prompt builder for the oneday dialog agent (D7: agent returns
 * structured JSON only; the plugin is the sole writer of markdown).
 */
import { TimelineDoc } from "../core/types"
import { formatClock } from "../core/duration"

export interface PromptContext {
  typeColors: Record<string, string>
  now: Date
  doc: TimelineDoc
  /** 多轮对话历史（追问-回答串起来，yyt 2026-08-19） */
  history?: Array<{ role: "user" | "assistant"; content: string }>
}

const GRAMMAR = `oneday 时间轴语法：每个色块一行，格式为「HH:MM-HH:MM <type> [备注]」。
- plan 前缀表示规划层；@HH:MM 是点批注（本任务不需要）。
- 24 小时制；过了零点的时段属于当天（如 00:30-01:30 是今天凌晨）。`

export function buildSystemPrompt(ctx: PromptContext): string {
  const types = Object.keys(ctx.typeColors).join(", ")
  const hh = String(ctx.now.getHours()).padStart(2, "0")
  const mm = String(ctx.now.getMinutes()).padStart(2, "0")

  const existing = ctx.doc.entries
    .filter((e) => !e.plan)
    .sort((a, b) => a.startMin - b.startMin)
    .map((e, i) => `  ${i + 1}) ${formatClock(e.startMin)}-${formatClock(e.endMin)} ${e.type}${e.note ? " " + e.note : ""}`)
    .join("\n")

  return [
    "你是 oneday 时间轴助手的条目生成器。用户会用自然语言描述刚做/在做/计划做的事，你把它转成一条时间轴色块。",
    GRAMMAR,
    `当前时间：${hh}:${mm}。时间轴起点：${formatClock(ctx.doc.rangeStart)}（「起床」类表述从这里开始算睡觉时段）。已登记的任务类型（type 必须从这里选，拿不准用 misc）：${types}。`,
    existing ? `当天已有实际色块（编号供修改/删除引用；可与之并列重叠）：\n${existing}` : "当天还没有实际色块。",
    "规则：",
    "1. 「刚花了 X」→ end=当前时间，start=往前推 X；「从 a 到 b」→ 直接用给定时间。",
    "2. 「X 点醒来/起床/才起」→ 必须同时产出**两个**块：①sleep 从时间轴起点到 X；②这句话里紧接着的事从 X 往后算。",
    "   时间冒号可能是全角（9：15）——理解按 9:15，输出一律半角 HH:MM。",
    "3. 一句话里有几件事就输出几个块（JSON 数组），一件事就输出单对象。不要任何其他文字、不要代码块包裹。",
    "4. 无法确定时间/时长 → {\"error\":\"<一句中文追问>\"}（用户会在同一对话补充，别让用户重述）。",
    "5. 你处于多轮对话：每条用户消息都结合上文理解。",
    "",
    "示例（时间轴起点 07:00）：",
    '输入「我刚健身半小时」（当前时间 21:35）→ {"start":"21:05","end":"21:35","type":"fitness"}',
    '输入「9：15醒来，然后浪费了35分钟刷手机」→ [{"start":"07:00","end":"09:15","type":"sleep","note":"睡觉"},{"start":"09:15","end":"09:50","type":"misc","note":"刷手机"}]',
  ].join("\n")
}
