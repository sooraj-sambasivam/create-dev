import Anthropic from "@anthropic-ai/sdk";
import { EntitySchema, type Entity, type ExtractResponse } from "@create/shared";
import { PERCEPTRON_DEFAULT_MODEL } from "../canvasOps/perceptron";
import { imageBlock } from "../ask/ask";
import { DEFAULT_MODEL } from "../ai/claude";

const TIMEOUT_MS = 20_000;
const PERCEPTRON_URL = "https://api.perceptron.inc/v1/chat/completions";

export const EXTRACT_PROMPT =
  'Read the chart or table in this image. Reply with only JSON: {"kind":"table"|"chart"|"list"|"schedule","title":string,"columns":[{"key":string,"label":string,"type":"text"|"number"|"money"|"date"|"time"|"percent"}],"rows":[{"<key>":"<cell text>"}]}. ' +
  "For a chart, use one text column for the x-axis label and one number column per series, one row per x value. Every cell is a string. Do not invent rows you cannot see.";

/** Pulls the first JSON object out of model text and validates it as an Entity; null when unusable. */
export function parseEntity(text: string, hint?: string): Entity | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { rows?: unknown; title?: unknown };
  if (Array.isArray(o.rows)) {
    o.rows = o.rows.map((r) =>
      r && typeof r === "object" ? Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])) : r,
    );
  }
  if (typeof o.title !== "string" || !o.title.trim()) o.title = hint?.trim().slice(0, 80) || "Extracted data";
  const parsed = EntitySchema.safeParse(raw);
  return parsed.success && parsed.data.rows.length > 0 ? parsed.data : null;
}

/** Deterministic sample entity chosen from the hint, for demos without keys. */
export function mockEntity(hint?: string): Entity {
  const h = (hint ?? "").toLowerCase();
  if (/schedule|bus|route|dining|hours|class/.test(h)) {
    return {
      kind: "schedule",
      title: hint?.trim().slice(0, 80) || "Bus schedule",
      columns: [
        { key: "route", label: "Route", type: "text" },
        { key: "departs", label: "Departs", type: "time" },
        { key: "riders", label: "Riders", type: "number" },
      ],
      rows: [
        { route: "44 Ballard", departs: "8:05 AM", riders: "32" },
        { route: "49 Capitol Hill", departs: "8:20 AM", riders: "41" },
        { route: "70 Eastlake", departs: "8:35 AM", riders: "27" },
        { route: "31 Fremont", departs: "8:50 AM", riders: "19" },
      ],
      source: {},
    };
  }
  if (/price|pricing|plan|cost|menu/.test(h)) {
    return {
      kind: "table",
      title: hint?.trim().slice(0, 80) || "Pricing",
      columns: [
        { key: "plan", label: "Plan", type: "text" },
        { key: "price", label: "Price", type: "money" },
        { key: "seats", label: "Seats", type: "number" },
      ],
      rows: [
        { plan: "Free", price: "$0", seats: "1" },
        { plan: "Pro", price: "$9", seats: "5" },
        { plan: "Team", price: "$19", seats: "25" },
      ],
      source: {},
    };
  }
  return {
    kind: "chart",
    title: hint?.trim().slice(0, 80) || "Weekly signups",
    columns: [
      { key: "week", label: "Week", type: "text" },
      { key: "signups", label: "Signups", type: "number" },
    ],
    rows: [
      { week: "Week 1", signups: "42" },
      { week: "Week 2", signups: "55" },
      { week: "Week 3", signups: "128" },
      { week: "Week 4", signups: "61" },
      { week: "Week 5", signups: "70" },
    ],
    source: {},
  };
}

type FetchFn = typeof fetch;
export type ExtractDeps = { fetchImpl?: FetchFn; client?: Anthropic };

async function viaPerceptron(image: string, hint: string | undefined, fetchImpl: FetchFn): Promise<Entity | null> {
  const apiKey = process.env.PERCEPTRON_API_KEY?.trim();
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(PERCEPTRON_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.PERCEPTRON_MODEL || PERCEPTRON_DEFAULT_MODEL,
        max_completion_tokens: 3000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: hint ? `${EXTRACT_PROMPT}\nContext: ${hint}` : EXTRACT_PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[extract] perceptron HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const c = body.choices?.[0]?.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string }).text ?? "").join("") : "";
    return parseEntity(text, hint);
  } catch (err) {
    console.warn("[extract] perceptron unavailable:", err instanceof Error ? err.message : "unknown");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let claudeClient: Anthropic | null = null;

async function viaClaude(image: string, hint: string | undefined, client?: Anthropic): Promise<Entity | null> {
  const block = imageBlock(image);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!block || (!client && !apiKey)) return null;
  try {
    claudeClient ??= new Anthropic({ apiKey: apiKey ?? "unset", timeout: TIMEOUT_MS, maxRetries: 0 });
    const msg = await (client ?? claudeClient).messages.create(
      {
        model: process.env.CLAUDE_ASK_MODEL || DEFAULT_MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content: [block, { type: "text", text: hint ? `${EXTRACT_PROMPT}\nContext: ${hint}` : EXTRACT_PROMPT }] }],
      },
      { timeout: TIMEOUT_MS },
    );
    return parseEntity(msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""), hint);
  } catch (err) {
    console.warn("[extract] claude vision failed:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

/** Perceptron first, then Claude vision, then a deterministic mock. Never throws for model trouble. */
export async function extractEntity(image: string, hint?: string, deps: ExtractDeps = {}): Promise<ExtractResponse> {
  if (process.env.MOCK_AI !== "1") {
    const p = await viaPerceptron(image, hint, deps.fetchImpl ?? fetch);
    if (p) return { entity: p, provider: "perceptron" };
    const c = await viaClaude(image, hint, deps.client);
    if (c) return { entity: c, provider: "claude" };
  }
  return { entity: mockEntity(hint), provider: "mock" };
}
