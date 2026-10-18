import Anthropic from "@anthropic-ai/sdk";
import { findNode, type AskRequest, type AskResponse, type Node } from "@create/shared";
import { outlineScreen } from "../canvasOps/outline";
import { readSketchWithPerceptron } from "../canvasOps/perceptron";
import { DEFAULT_MODEL } from "../ai/claude";
import { mockAnswerBody } from "./mockAnswer";

/**
 * Chat mode: answers a question about the page or the pointed-at element. It never edits.
 * Real mode asks Claude (Haiku for short questions, Sonnet otherwise); MOCK_AI=1 or no key gives a
 * deterministic answer. suggestCode tells the client to offer "Switch to Code".
 */

export const ASK_FAST_MODEL = "claude-haiku-5-5";
const ASK_TIMEOUT_MS = 30_000;
const SHORT_QUESTION = 80;

/** True when the line asks for a change rather than an answer, so Chat should offer Code mode. */
export function wantsEdit(question: string): boolean {
  const q = question.trim().toLowerCase();
  return !QUESTION_OPENER.test(q) && EDIT_CUES.test(q);
}

const QUESTION_OPENER = /^(what|whats|why|how|who|when|where|which|explain|describe|is|are|does|do)\b/;

const EDIT_CUES =
  /\b(make|change|set|turn|color|colour|recolor|bigger|smaller|larger|wider|taller|shrink|enlarge|resize|move|align|center|centre|delete|remove|add|insert|create|rewrite|reword|replace|swap|regenerate|redo|rebuild|build|fix|update|style|can you|could you|please)\b/;

/** The visible words or value of a node, for answers and the mock reply. */
export function nodeText(n: Node): string {
  switch (n.type) {
    case "heading": case "text": case "badge": case "link": return n.text;
    case "button": case "checkbox": case "textbox": case "select": return n.label;
    case "image": return n.alt;
    case "avatar": return n.name;
    case "list": return n.items.join(", ");
    case "rating": return String(n.value);
    case "data": return n.label ? `${n.label} (${n.field})` : n.field;
    default: return "";
  }
}

/** Deterministic answer: explains the matched element from the page. Offers Code, never claims an edit. */
export function mockAnswer(req: AskRequest, reading?: string | null): string {
  const body = mockAnswerBody(req, reading);
  return wantsEdit(req.question) ? `${body} Want me to change it? Switch to Code.` : body;
}

export function buildSystemPrompt(req: AskRequest, reading?: string | null): string {
  const lines = [
    "You are the assistant inside Create, a tool for building web pages by pointing and talking.",
    "Be concise, plain and helpful. Answer questions about figures, numbers and text on the page directly.",
    "You are in Chat mode: you can NOT edit the page and must never say or imply that you did. If the user asks for a change, tell them to switch to Code mode.",
  ];
  if (req.screen) lines.push(`The current page outline:\n${outlineScreen(req.screen)}`);
  const id = req.pointer?.targetId;
  const node = id && req.screen ? findNode(req.screen, id) : null;
  if (node) lines.push(`The user is pointing at this element (full JSON):\n${JSON.stringify(node).slice(0, 4000)}\n"this" and "that" mean it.`);
  else if (req.pointer?.label) lines.push(`The user is pointing at: "${req.pointer.label}".`);
  if (reading) lines.push(`A vision model read the pointed region as:\n${reading}`);
  return lines.join("\n\n");
}

let client: Anthropic | null = null;

/** Answers the question. Never throws for model trouble: falls back to the mock answer. */
export async function answerAsk(req: AskRequest, opts: { client?: Anthropic } = {}): Promise<AskResponse> {
  const suggestCode = wantsEdit(req.question) || undefined;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const reading = req.pointer?.image ? await readSketchWithPerceptron(req.pointer.image, req.question) : null;
  const provider = reading ? "perceptron+claude" : "claude";
  if (process.env.MOCK_AI === "1" || (!opts.client && !apiKey)) {
    return { answer: mockAnswer(req, reading), provider: "mock", ...(suggestCode ? { suggestCode } : {}) };
  }
  try {
    client ??= new Anthropic({ apiKey: apiKey ?? "unset", timeout: ASK_TIMEOUT_MS, maxRetries: 0 });
    const model = req.question.length <= SHORT_QUESTION && !req.screen ? ASK_FAST_MODEL : process.env.CLAUDE_ASK_MODEL || DEFAULT_MODEL;
    const message = await (opts.client ?? client).messages.create(
      {
        model,
        max_tokens: 600,
        system: buildSystemPrompt(req, reading),
        messages: [...req.history.slice(-10).map((h) => ({ role: h.role, content: h.text })), { role: "user", content: req.question }],
      },
      { timeout: ASK_TIMEOUT_MS },
    );
    const answer = message.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!answer) throw new Error("empty answer");
    return { answer, provider, ...(suggestCode ? { suggestCode } : {}) };
  } catch (err) {
    console.warn("[ask] falling back to mock answer:", err instanceof Error ? err.message : "unknown error");
    return { answer: mockAnswer(req, reading), provider: "mock", ...(suggestCode ? { suggestCode } : {}) };
  }
}
