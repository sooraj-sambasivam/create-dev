import type { GenerateResponse, SketchRequest } from "@create/shared";
import { GenerationError } from "../ai/claude";
import { assertSketchImageSize, parseSketchImage } from "../sketch/claude";
import { buildRepairPrompt, buildSystemPrompt, buildUserPrompt } from "./prompt";
import { formatVisionProblem, parseAbelScreen } from "./schema";
import type { VisionImage, VisionTurn } from "./types";

/** First attempt plus one repair. A third model call is not allowed. */
const MAX_ROUNDS = 2;

export async function runVision(
  req: SketchRequest,
  complete: (turns: VisionTurn[]) => Promise<string>,
): Promise<GenerateResponse> {
  assertSketchImageSize(req.image);
  const image = parseSketchImage(req.image);
  const turns: VisionTurn[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: { text: buildUserPrompt(req), image } },
  ];
  let lastProblem = "The model did not return a screen.";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const text = await complete(turns);
    try {
      return parseAbelScreen(text, req);
    } catch (err) {
      lastProblem = formatVisionProblem(err);
      if (round === 0) {
        turns.push({ role: "assistant", content: text });
        turns.push({ role: "user", content: { text: buildRepairPrompt(lastProblem), image } });
      }
    }
  }
  throw new GenerationError(lastProblem, 422);
}

export function requireKey(value: string | undefined, message: string): string {
  const key = value?.trim();
  if (!key) throw new GenerationError(message, 503);
  return key;
}

type OpenAICompatibleArgs = {
  id: string;
  url: string;
  apiKey: string;
  model: string;
  turns: VisionTurn[];
  /** Grok reads the sketch more reliably at high detail. */
  detail?: "high";
  timeoutMs?: number;
};

export async function completeOpenAICompatible(args: OpenAICompatibleArgs): Promise<string> {
  const body = await postJson(
    args.url,
    { authorization: `Bearer ${args.apiKey}` },
    {
      model: args.model,
      messages: args.turns.map((turn) => openAIMessage(turn, args.detail)),
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    },
    args.timeoutMs ?? 180_000,
    args.id,
  );
  return openAIText(body);
}

type AnthropicArgs = {
  apiKey: string;
  model: string;
  turns: VisionTurn[];
};

export async function completeAnthropic(args: AnthropicArgs): Promise<string> {
  const system = args.turns.find((turn) => turn.role === "system");
  const body = await postJson(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
    },
    {
      model: args.model,
      max_tokens: 16000,
      system: system && system.role === "system" ? system.content : buildSystemPrompt(),
      messages: args.turns.filter((turn) => turn.role !== "system").map(anthropicMessage),
    },
    180_000,
    "anthropic",
  );
  return anthropicText(body);
}

function openAIMessage(turn: VisionTurn, detail?: "high") {
  if (turn.role === "system" || turn.role === "assistant") {
    return { role: turn.role, content: turn.content };
  }
  if (typeof turn.content === "string") return { role: "user" as const, content: turn.content };
  const parts: Array<Record<string, unknown>> = [];
  if (turn.content.image) parts.push(imageUrlPart(turn.content.image, detail));
  parts.push({ type: "text", text: turn.content.text });
  return { role: "user" as const, content: parts };
}

function imageUrlPart(image: VisionImage, detail?: "high") {
  const url = `data:${image.mediaType};base64,${image.data}`;
  return {
    type: "image_url",
    image_url: detail ? { url, detail } : { url },
  };
}

function anthropicMessage(turn: VisionTurn) {
  if (turn.role === "assistant") return { role: "assistant" as const, content: turn.content };
  if (turn.role === "system") return { role: "user" as const, content: turn.content };
  if (typeof turn.content === "string") return { role: "user" as const, content: turn.content };
  const content: Array<Record<string, unknown>> = [];
  if (turn.content.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: turn.content.image.mediaType, data: turn.content.image.data },
    });
  }
  content.push({ type: "text", text: turn.content.text });
  return { role: "user" as const, content };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  provider: string,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network error";
    throw new GenerationError(`${provider} request failed: ${message}`, 502);
  }
  const text = await res.text();
  if (!res.ok) throw httpError(provider, res.status, text);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GenerationError(`${provider} returned non-JSON.`, 502);
  }
}

function httpError(provider: string, status: number, body: string): GenerationError {
  if (status === 401 || status === 403) return new GenerationError(`${provider} rejected the API key.`, 502);
  if (status === 429) return new GenerationError(`${provider} rate limit hit. Try again in a few seconds.`, 429);
  return new GenerationError(`${provider} error ${status}: ${body.slice(0, 300)}`, 502);
}

function openAIText(body: unknown): string {
  const content = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  return contentToString(content);
}

function anthropicText(body: unknown): string {
  const content = (body as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const row = block as { type?: unknown; text?: unknown };
      return row.type === "text" && typeof row.text === "string" ? row.text : "";
    })
    .join("\n")
    .trim();
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n")
    .trim();
}
