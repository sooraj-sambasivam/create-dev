import Anthropic from "@anthropic-ai/sdk";
import { EntitySchema, type Entity, type ExtractResponse, type PixelBox, type StageTiming } from "@create/shared";
import { PERCEPTRON_DEFAULT_MODEL } from "../canvasOps/perceptron";
import { imageBlock } from "../ask/ask";
import { DEFAULT_MODEL } from "../ai/claude";
import { geminiText } from "../providers/http";
import { isEchoTitle } from "../lift/clean";
import { judgeImage, type JevBox, type JevImageResult } from "../jev/image";

/** Extract response plus the optional Jev image judgment; `focus` is the box the client may crop to. */
export type ExtractResult = ExtractResponse & { jev?: JevImageResult; focus?: JevBox };

const TIMEOUT_MS = 20_000;
const PERCEPTRON_URL = "https://api.perceptron.inc/v1/chat/completions";

export const EXTRACT_PROMPT =
  'Read the chart or table in this image. Reply with only JSON: {"kind":"table"|"chart"|"list"|"schedule","title":string,"columns":[{"key":string,"label":string,"type":"text"|"number"|"money"|"date"|"time"|"percent"}],"rows":[{"<key>":"<cell text>"}]}. ' +
  "For a chart, use one text column for the x-axis label and one number column per series, one row per x value. Name the label column by what the labels are (for example Region) and each number column by the measure and unit (for example Life expectancy, years); put the year or date range in the title, not in column labels. Read values from the printed data labels; if none are printed, estimate to the same precision as the axis ticks and keep one row per label, with no repeated labels. Every cell is a string. Do not invent rows you cannot see. " +
  "Rules: the columns are the table's header row, so put the header labels in columns and never repeat them as a data row; skip title lines, dates and notes printed above the header; column labels are copied exactly as printed in the header, with no position words such as (row 1) or (column 1); if a header cell is blank, name it from its values (for example Time). " +
  "Set each column type from its values: money for $ amounts, percent for %, number for plain numbers, time for clock times, date for dates, else text. " +
  "Copy every visible row including total, subtotal and tax rows, with cell text exactly as shown (keep $ , and %); use an empty string for an empty cell, never a placeholder. " +
  "The title is a short name for what the data is (2 to 6 words, from the page headings); it is never the user request. ";

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
  const o = raw as { rows?: unknown; title?: unknown; columns?: unknown };
  if (Array.isArray(o.rows) && Array.isArray(o.columns)) {
    // Schema-constrained OCR returns rows as arrays of cell strings in column order.
    const keys = (o.columns as { key?: unknown }[]).map((c) => String(c?.key ?? ""));
    o.rows = o.rows.map((r) => (Array.isArray(r) ? Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? "")])) : r));
  }
  if (Array.isArray(o.rows)) {
    o.rows = o.rows.map((r) =>
      r && typeof r === "object" ? Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])) : r,
    );
  }
  // A missing title, or one that repeats the user's request, is never kept: the lift step derives a title from the data.
  if (typeof o.title !== "string" || !o.title.trim() || isEchoTitle(o.title, hint)) o.title = "Extracted data";
  const parsed = EntitySchema.safeParse(raw);
  return parsed.success && parsed.data.rows.length > 0 ? parsed.data : null;
}

/** Deterministic sample entity chosen from the hint, for demos without keys. */
export function mockEntity(hint?: string): Entity {
  const h = (hint ?? "").toLowerCase();
  if (/schedule|bus|route|dining|hours|class/.test(h)) {
    return {
      kind: "schedule",
      title: "Bus schedule",
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
      title: "Pricing",
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
    title: "Weekly signups",
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
export type ExtractDeps = {
  fetchImpl?: FetchFn;
  client?: Anthropic;
  jevFetch?: FetchFn;
  /** Where the client's crop sits in the screenshot; metadata only (no server-side cropping). */
  box?: PixelBox;
  /** Receives one timing per read-stage provider attempt. */
  onStage?: (t: StageTiming) => void;
};

/** Strict JSON schema for Perceptron OCR. Rows are arrays of cell strings so columns can be dynamic. */
export const ENTITY_OCR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "title", "columns", "rows"],
  properties: {
    kind: { type: "string", enum: ["table", "chart", "list", "schedule"] },
    title: { type: "string" },
    columns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "type"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["text", "number", "money", "date", "time", "percent"] },
        },
      },
    },
    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
  },
} as const;

export const OCR_PROMPT =
  "Read the table, chart or list in this image. Fill the schema: columns describe each column (key is a short lowercase id), and each row is an array of cell strings in column order. " +
  "For a chart, use one text column for the x-axis label and one number column per series, one row per x value. Keep prices as strings exactly as shown. Do not invent rows you cannot see. " +
  "Rules: the columns are the table's header row, so put the header labels in columns and never repeat them as a data row; skip title lines, dates and notes printed above the header; column labels are copied exactly as printed in the header, with no position words such as (row 1) or (column 1); if a header cell is blank, name it from its values (for example Time). " +
  "Set each column type from its values: money for $ amounts, percent for %, number for plain numbers, time for clock times, date for dates, else text. " +
  "Copy every visible row including total, subtotal and tax rows, with cell text exactly as shown (keep $ , and %); use an empty string for an empty cell, never a placeholder. " +
  "The title is a short name for what the data is (2 to 6 words, from the page headings); it is never the user request. ";

async function timed<T>(deps: ExtractDeps, provider: string, fn: () => Promise<T | null>): Promise<T | null> {
  const t0 = performance.now();
  let out: T | null = null;
  let error: string | undefined;
  try {
    out = await fn();
    if (!out) error = "no usable result";
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 200) : "failed";
  }
  deps.onStage?.({ stage: "read", provider, ms: Math.round(performance.now() - t0), ok: !!out, ...(error ? { error } : {}) });
  return out;
}

async function viaPerceptron(image: string, hint: string | undefined, fetchImpl: FetchFn, box?: PixelBox): Promise<Entity | null> {
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
        response_format: { type: "json_schema", json_schema: { name: "entity", strict: true, schema: ENTITY_OCR_SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: [OCR_PROMPT, hint ? `User request (context only, not a title): ${hint}` : "", box ? "The image is already cropped to the target." : ""].filter(Boolean).join("\n") },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[extract] perceptron HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const c = body.choices?.[0]?.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (p as { text?: string }).text ?? "").join("") : "";
    return parseEntity(text, hint);
  } catch (err) {
    console.warn("[extract] perceptron unavailable:", err instanceof Error ? err.message : "unknown");
    throw err instanceof Error && err.message.startsWith("HTTP") ? err : new Error(controller.signal.aborted ? "timeout" : "network error");
  } finally {
    clearTimeout(timer);
  }
}

async function viaGemini(image: string, hint: string | undefined, fetchImpl?: FetchFn): Promise<Entity | null> {
  if (!process.env.GEMINI_API_KEY?.trim() || !imageBlock(image)) return null;
  const text = await geminiText({ user: hint ? `${EXTRACT_PROMPT}\nUser request (context only, not a title): ${hint}` : EXTRACT_PROMPT, image, json: true, maxTokens: 3000, fetchImpl });
  return text ? parseEntity(text, hint) : null;
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
        messages: [{ role: "user", content: [block, { type: "text", text: hint ? `${EXTRACT_PROMPT}\nUser request (context only, not a title): ${hint}` : EXTRACT_PROMPT }] }],
      },
      { timeout: TIMEOUT_MS },
    );
    return parseEntity(msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""), hint);
  } catch (err) {
    console.warn("[extract] claude vision failed:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

async function chain(image: string, hint: string | undefined, deps: ExtractDeps): Promise<ExtractResponse> {
  if (process.env.MOCK_AI !== "1") {
    const p = await timed(deps, "perceptron", () => viaPerceptron(image, hint, deps.fetchImpl ?? fetch, deps.box));
    if (p) return { entity: p, provider: "perceptron" };
    const g = await timed(deps, "gemini", () => viaGemini(image, hint, deps.fetchImpl));
    // ExtractResponse.provider is frozen in shared; the picker only needs to know it was not mock.
    if (g) return { entity: g, provider: "gemini" as unknown as "claude" };
    const c = await timed(deps, "claude", () => viaClaude(image, hint, deps.client));
    if (c) return { entity: c, provider: "claude" };
  }
  deps.onStage?.({ stage: "read", provider: "mock", ms: 0, ok: true });
  return { entity: mockEntity(hint), provider: "mock" };
}

/**
 * Perceptron first, then Claude vision, then a deterministic mock. Never throws for model trouble.
 * Jev runs alongside (its own 1.5s timeout, null on any failure) and only adds `jev` and `focus`.
 */
export async function extractEntity(image: string, hint?: string, deps: ExtractDeps = {}): Promise<ExtractResult> {
  const useJev = process.env.MOCK_AI !== "1" || Boolean(deps.jevFetch);
  const jevP = useJev ? judgeImage(image, { fetchImpl: deps.jevFetch }).catch(() => null) : Promise.resolve(null);
  const result = await chain(image, hint, deps);
  const jev = await jevP;
  if (!jev) return result;
  return { ...result, jev, ...(jev.box ? { focus: jev.box } : {}) };
}
