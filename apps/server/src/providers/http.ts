import type { EffortChoice } from "@create/shared";
import { geminiModel, hasGemini, hasOpenRouter, inklingModel } from "./models";

type FetchFn = typeof fetch;
const TIMEOUT_MS = 90_000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface TextCall {
  system?: string;
  user: string;
  /** PNG/JPEG data URL attached to the user turn. */
  image?: string;
  history?: { role: "user" | "assistant"; text: string }[];
  json?: boolean;
  maxTokens?: number;
  effort?: EffortChoice;
  signal?: AbortSignal;
  fetchImpl?: FetchFn;
}

function withTimeout(signal: AbortSignal | undefined): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  const onAbort = () => c.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  return { signal: c.signal, done: () => { clearTimeout(t); signal?.removeEventListener("abort", onAbort); } };
}

/** One OpenRouter chat completion with Inkling. Returns the text, or null on any failure (never logs the key). */
export async function inklingText(call: TextCall): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key || !hasOpenRouter()) return null;
  const t = withTimeout(call.signal);
  try {
    const userContent = call.image
      ? [{ type: "image_url", image_url: { url: call.image } }, { type: "text", text: call.user }]
      : call.user;
    const messages = [
      ...(call.system ? [{ role: "system", content: call.system }] : []),
      ...(call.history ?? []).map((h) => ({ role: h.role, content: h.text })),
      { role: "user", content: userContent },
    ];
    const res = await (call.fetchImpl ?? globalThis.fetch)(OPENROUTER_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: t.signal,
      body: JSON.stringify({
        model: inklingModel(),
        messages,
        max_tokens: call.maxTokens ?? 8000,
        ...(call.json ? { response_format: { type: "json_object" } } : {}),
        ...(call.effort ? { reasoning: { effort: call.effort } } : {}),
      }),
    });
    if (!res.ok) {
      console.warn(`[inkling] HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const c = body.choices?.[0]?.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string }).text ?? "").join("") : "";
    return text.trim() || null;
  } catch (err) {
    console.warn("[inkling] unavailable:", err instanceof Error ? err.message : "unknown");
    return null;
  } finally {
    t.done();
  }
}

/** One Gemini generateContent call. Returns the text, or null on any failure (never logs the key). */
export async function geminiText(call: TextCall): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || !hasGemini()) return null;
  const t = withTimeout(call.signal);
  try {
    const parts: Record<string, unknown>[] = [];
    const m = call.image ? /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(call.image) : null;
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2]!.replace(/\s/g, "") } });
    parts.push({ text: call.user });
    const contents = [
      ...(call.history ?? []).map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] })),
      { role: "user", parts },
    ];
    const res = await (call.fetchImpl ?? globalThis.fetch)(`${GEMINI_BASE}/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      signal: t.signal,
      body: JSON.stringify({
        ...(call.system ? { systemInstruction: { parts: [{ text: call.system }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: call.maxTokens ?? 8000,
          ...(call.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });
    if (!res.ok) {
      console.warn(`[gemini] HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return text.trim() || null;
  } catch (err) {
    console.warn("[gemini] unavailable:", err instanceof Error ? err.message : "unknown");
    return null;
  } finally {
    t.done();
  }
}

/** Text from the chosen non-Claude provider; null when it is not configured or fails. */
export function altText(provider: "inkling" | "gemini", call: TextCall): Promise<string | null> {
  return provider === "inkling" ? inklingText(call) : geminiText(call);
}

/** First JSON object in model text, or undefined. */
export function extractJson(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]);
  } catch {
    return undefined;
  }
}
