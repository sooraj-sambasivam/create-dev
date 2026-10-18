import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "../ai/claude";
import type { Entity } from "@create/shared";
import type { LiftCopy } from "./entityToScreen";

const TIMEOUT_MS = 12_000;
let client: Anthropic | null = null;

export function parsePolish(text: string): LiftCopy {
  const m = /\{[\s\S]*\}/.exec(text);
  const field = (k: string, max: number) => {
    const r = new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
    return r?.[1]?.replace(/\\"/g, '"').trim().slice(0, max) || undefined;
  };
  const loose = (): LiftCopy => {
    const c = { title: field("title", 120), summary: field("summary", 240), footer: field("footer", 160) };
    return c.title || c.summary || c.footer ? c : {};
  };
  if (!m) return loose();
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const pick = (k: string, max: number) => (typeof o[k] === "string" && o[k].trim() ? (o[k] as string).trim().slice(0, max) : undefined);
    return { title: pick("title", 120), summary: pick("summary", 240), footer: pick("footer", 160) };
  } catch {
    return loose();
  }
}

/** Optional copy polish (title, one-line summary, footer). Never sees or alters rows beyond a 5-row sample for context. */
export async function polishCopy(entity: Entity, instruction: string | undefined): Promise<{ copy: LiftCopy; provider: "claude" | "mock" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.MOCK_AI === "1" || !apiKey) return { copy: {}, provider: "mock" };
  try {
    client ??= new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const sample = entity.rows.slice(0, 5).map((r) => entity.columns.map((c) => r[c.key] ?? "").join(" | ")).join("\n");
    const ask = () => client!.messages.create(
      {
        model: process.env.CLAUDE_EDIT_MODEL || "claude-haiku-5-5",
        max_tokens: 400,
        system: [
          'You write the copy for a small app that was made from a table the user pointed at. Reply with only a JSON object: {"title": string, "summary": string, "footer": string}.',
          "Title: names what the data is, 2 to 6 words, from the table's own headings and values (for example \"Sales by category\", \"Coffee shop invoice\", \"Life expectancy by region\"). Never copy the user's request into the title, never start it with a verb like track or turn, and never use generic words like data, table or tracker alone.",
          "Summary: one plain sentence, under 16 words, naming what the data covers (for example \"Price, projects and storage for Starter, Pro and Team.\"); never start with \"This page\", \"This app\" or \"A page\". Footer: one short plain line about adding rows.",
          "Style: plain and short. Sentence case. No hype words (seamless, powerful, effortless, insights, unlock, easily). No exclamation marks, no emoji, never say website. Do not invent numbers or facts that are not in the table. Do not mention rows or columns by index.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: `Table: ${entity.title}\n${entity.source.title ? `Source page heading: ${entity.source.title}\n` : ""}Columns: ${entity.columns.map((c) => c.label).join(", ")}\nSample rows:\n${sample}\nThe user's request (context only, not a title): ${instruction?.trim() || "track this"}`,
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );
    // Haiku sometimes returns an empty reply; one retry is cheaper than a generic title.
    let text = "";
    let copy: LiftCopy = {};
    for (let attempt = 0; attempt < 2 && !Object.keys(copy).length; attempt++) {
      const msg = await ask();
      text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      copy = parsePolish(text);
    }
    if (!Object.keys(copy).length) console.warn("[lift] polish unparsed:", text.slice(0, 200));
    return Object.keys(copy).length ? { copy, provider: "claude" } : { copy: {}, provider: "mock" };
  } catch (err) {
    console.warn("[lift] polish skipped:", err instanceof Error ? err.message : "unknown");
    return { copy: {}, provider: "mock" };
  }
}
