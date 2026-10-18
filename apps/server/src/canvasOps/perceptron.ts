/**
 * Perceptron sketch reading (sponsor track). OpenAI-compatible chat completions at
 * https://api.perceptron.inc/v1. Docs (docs.perceptron.inc) list "perceptron-mk1.5" as the model id
 * and do not document /v1/models, so the id is checked against /v1/models best-effort and the
 * documented id is used when that listing is unavailable. The key stays on the server.
 */
const BASE_URL = "https://api.perceptron.inc/v1";
export const PERCEPTRON_DEFAULT_MODEL = "perceptron-mk1.5";
export const PERCEPTRON_TIMEOUT_MS = 6000;

const READING_PROMPT =
  "This is a quick wireframe sketch of part of a web page. 1) Transcribe any handwritten text exactly. " +
  "2) List each drawn element on its own line as `role @ position: detail`, where role is one of " +
  "button, image, heading, text, card, nav, form, input, list, icon, footer, hero, other, and position " +
  "is a short phrase such as top-left or center. 3) End with one line `layout:` describing the overall " +
  "arrangement (columns, rows, stacking). Be brief. No preamble.";

type FetchFn = typeof fetch;
export type PerceptronOptions = { fetchImpl?: FetchFn; timeoutMs?: number; apiKey?: string; prompt?: string };

let resolvedModel: string | null = null;

/** Test hook: forget the cached model id. */
export function resetPerceptronCache(): void {
  resolvedModel = null;
}

async function resolveModel(apiKey: string, fetchImpl: FetchFn, signal: AbortSignal): Promise<string> {
  if (resolvedModel) return resolvedModel;
  let model = process.env.PERCEPTRON_MODEL || PERCEPTRON_DEFAULT_MODEL;
  try {
    const res = await fetchImpl(`${BASE_URL}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal });
    if (res.ok) {
      const body = (await res.json()) as { data?: { id?: unknown }[] };
      const ids = (body.data ?? []).map((m) => m.id).filter((i): i is string => typeof i === "string");
      if (ids.length > 0 && !ids.includes(model)) {
        model = ids.filter((i) => i.startsWith("perceptron")).sort().pop() ?? model;
      }
    }
  } catch {
    // Listing is optional; keep the documented id.
    if (signal.aborted) throw new Error("perceptron timeout");
  }
  resolvedModel = model;
  return model;
}

/**
 * Returns a short reading of the sketch, or null when no key is set, the call fails or it exceeds
 * the timeout. Never throws: callers treat the reading as optional.
 */
export async function readSketchWithPerceptron(
  image: string,
  label: string,
  opts: PerceptronOptions = {},
): Promise<string | null> {
  const apiKey = opts.apiKey ?? process.env.PERCEPTRON_API_KEY;
  if (!apiKey) return null;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PERCEPTRON_TIMEOUT_MS);
  try {
    const model = await resolveModel(apiKey, fetchImpl, controller.signal);
    const res = await fetchImpl(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_completion_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: label ? `${opts.prompt ?? READING_PROMPT}\nThe user's note: ${label}` : (opts.prompt ?? READING_PROMPT) },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[canvas-ops] perceptron HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (p as { text?: string }).text ?? "").join("") : "";
    const reading = text.trim().slice(0, 2000);
    return reading || null;
  } catch (err) {
    console.warn(`[canvas-ops] perceptron unavailable: ${(err as Error).name === "AbortError" ? "timeout" : (err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const DESCRIBE_PROMPT =
  "Describe what this image shows for someone who cannot see it. Name the kind of thing (photo, chart, table, screenshot, sketch, UI), " +
  "transcribe any visible text and numbers exactly, and note colors, layout and anything that stands out. Be brief and factual. No preamble.";

/** General visual description for Chat image questions (Perceptron perceptron-mk1.5). Null without a key or on any failure. */
export function describeImageWithPerceptron(image: string, question: string, opts: PerceptronOptions = {}): Promise<string | null> {
  return readSketchWithPerceptron(image, question, { ...opts, prompt: DESCRIBE_PROMPT });
}
