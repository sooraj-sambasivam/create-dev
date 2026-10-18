import Anthropic from "@anthropic-ai/sdk";
import { judgeIntent } from "../jev/client";
import { IntentResultSchema, type IntentRequest, type IntentResult } from "@create/shared";

/**
 * Routes a spoken line: is it a command for the canvas, and which element does it target?
 * Claude answers through a forced tool call; a keyword router is the fallback (MOCK_AI=1,
 * no ANTHROPIC_API_KEY, model error, or invalid model output). Every result is checked here
 * against the candidate ids, so the model can never target an element that does not exist.
 */

export const INTENT_MODEL = "claude-haiku-5-5";
const INTENT_TIMEOUT_MS = 15_000;

type Candidate = IntentRequest["candidates"][number];
type Action = IntentResult["action"];

const INTENT_TOOL: Anthropic.Tool = {
  name: "route_intent",
  description:
    "Report whether the transcript is a command to edit the canvas, which candidate element it targets (by id, or null), the action, and your confidence.",
  input_schema: {
    type: "object",
    properties: {
      isCommand: { type: "boolean", description: "True only if the speaker asks for an edit. Filler, chatter or narration is false." },
      targetId: {
        type: ["string", "null"],
        description: "One of the candidate ids exactly, or null when no candidate is clearly meant.",
      },
      action: {
        type: "string",
        enum: ["restyle", "move", "delete", "add", "replace_text", "regenerate", "none"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["isCommand", "targetId", "action", "confidence"],
  },
};

/** Filler words that, alone, never make a command. */
const FILLER = new Set([
  "um", "umm", "uh", "uhh", "hmm", "hm", "er", "ah", "like", "so", "okay", "ok", "yeah", "yes", "yep", "no",
  "well", "right", "the", "a", "an", "and", "i", "uh-huh", "mm", "mhm", "you", "know", "actually", "just", "i'm",
  "its", "it's", "that", "this", "is", "it", "to", "of", "hey", "hi", "thanks", "thank", "oh",
]);

/** Verb cues, checked in this order (first match wins). */
const VERB_RULES: Array<{ action: Action; pattern: RegExp }> = [
  { action: "delete", pattern: /\b(delete|remove|erase|get rid of|drop|trash)\b/ },
  { action: "move", pattern: /\b(move|drag|shift|nudge|place|position|align|center|centre)\b/ },
  { action: "replace_text", pattern: /\b(rewrite|reword|rephrase|say|text|caption|label|title|heading)\b/ },
  { action: "regenerate", pattern: /\b(regenerate|redo|rebuild|start over|try again)\b/ },
  { action: "add", pattern: /\b(add|insert|create|append|include)\b/ },
  {
    action: "restyle",
    pattern: /\b(make|change|color|colour|recolor|recolour|style|bigger|smaller|larger|bold|italic|font|round|rounder|shadow|border|background|blue|red|green|black|white|dark|light|pink|purple|yellow|orange)\b/,
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}'\- ]+/gu, " ").replace(/\s+/g, " ").trim();
}

function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Clamp a number into [0, 1]; non-finite values become 0. */
export function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Coerce untrusted model output into a valid IntentResult. targetId must be one of the
 * candidate ids (otherwise null), confidence is clamped, and a non-command never has a target.
 */
export function sanitizeIntent(raw: unknown, candidates: Candidate[]): IntentResult {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = new Set(candidates.map((c) => c.id));
  const isCommand = input.isCommand === true;
  const targetId = typeof input.targetId === "string" && ids.has(input.targetId) ? input.targetId : null;
  const action = IntentResultSchema.shape.action.safeParse(input.action);
  const result: IntentResult = {
    isCommand,
    targetId: isCommand ? targetId : null,
    action: action.success ? action.data : "none",
    confidence: clampConfidence(input.confidence),
  };
  if (!result.isCommand) result.action = "none";
  return IntentResultSchema.parse(result);
}

/** Keyword router. Pure and synchronous, so it always works in mock mode. */
export function routeIntentFallback(req: IntentRequest): IntentResult {
  const tokens = words(req.transcript);
  const none = (confidence: number): IntentResult => ({ isCommand: false, targetId: null, action: "none", confidence });

  if (tokens.length === 0 || tokens.every((t) => FILLER.has(t))) return none(0.95);

  const text = normalize(req.transcript);
  const rule = VERB_RULES.find((r) => r.pattern.test(text));
  if (!rule) return none(0.4);

  const targetId = pickTarget(text, req.candidates);
  // Base confidence for a verb cue; a clear target and a single candidate raise it.
  let confidence = 0.6;
  if (targetId) confidence += 0.2;
  if (req.candidates.length === 1) confidence += 0.1;
  return sanitizeIntent(
    { isCommand: true, targetId: targetId ?? null, action: rule.action, confidence },
    req.candidates,
  );
}

/** Target choice for the keyword router: sole candidate, or the best label word overlap. */
function pickTarget(text: string, candidates: Candidate[]): string | null {
  if (candidates.length === 1) return candidates[0]!.id;
  const spoken = new Set(words(text));
  let best: { id: string; score: number } | null = null;
  let tie = false;
  for (const c of candidates) {
    const labelWords = words(c.label).filter((w) => w.length > 2 && !FILLER.has(w));
    const score = labelWords.filter((w) => spoken.has(w)).length;
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { id: c.id, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }
  return best && !tie ? best.id : null;
}

/** Ask Claude (forced tool call). Throws on transport errors or a missing tool call. */
export async function routeIntentWithClaude(req: IntentRequest, client: Anthropic): Promise<IntentResult> {
  const candidateLines = req.candidates.length
    ? req.candidates.map((c) => `- id=${c.id} kind=${c.kind} label="${c.label}"`).join("\n")
    : "(no candidates; targetId must be null)";
  const message = await client.messages.create(
    {
      model: INTENT_MODEL,
      max_tokens: 300,
      tools: [INTENT_TOOL],
      tool_choice: { type: "tool", name: INTENT_TOOL.name },
      system:
        "You classify a spoken line from someone editing a web page or a drawing. Call route_intent exactly once. " +
        "Set isCommand true only for a request to change the canvas. Choose targetId only from the candidate ids.",
      messages: [
        {
          role: "user",
          content: `Transcript: """${req.transcript}"""\nCandidates:\n${candidateLines}`,
        },
      ],
    },
    { timeout: INTENT_TIMEOUT_MS },
  );
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === INTENT_TOOL.name,
  );
  if (!block) throw new Error("Model did not call route_intent.");
  return sanitizeIntent(block.input, req.candidates);
}

let client: Anthropic | null = null;

export type IntentEngine = "jev" | "haiku" | "keywords";

/**
 * Entry point used by the route. Order: Jev (TYPESAFE_API_KEY) -> Haiku (Anthropic key, not MOCK_AI)
 * -> keyword router. Any engine error or unusable answer falls through, so the caller always gets
 * a valid IntentResult and learns which engine answered. MOCK_AI only gates Claude: Jev runs
 * whenever its own key is set, since it is cheap and fast.
 */
export async function routeIntentWithEngine(
  req: IntentRequest,
  opts: { client?: Anthropic } = {},
): Promise<{ result: IntentResult; engine: IntentEngine }> {
  const jev = await judgeIntent(req);
  const parsed = jev ? IntentResultSchema.safeParse(jev) : null;
  if (parsed?.success) return { result: parsed.data, engine: "jev" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.MOCK_AI === "1" || (!opts.client && !apiKey)) return { result: routeIntentFallback(req), engine: "keywords" };
  try {
    client ??= new Anthropic({ apiKey: apiKey ?? "unset", timeout: INTENT_TIMEOUT_MS, maxRetries: 0 });
    return { result: await routeIntentWithClaude(req, opts.client ?? client), engine: "haiku" };
  } catch (err) {
    console.warn("[route-intent] falling back to keyword router:", err instanceof Error ? err.message : "unknown error");
    return { result: routeIntentFallback(req), engine: "keywords" };
  }
}

export async function routeIntent(req: IntentRequest, opts: { client?: Anthropic } = {}): Promise<IntentResult> {
  return (await routeIntentWithEngine(req, opts)).result;
}
