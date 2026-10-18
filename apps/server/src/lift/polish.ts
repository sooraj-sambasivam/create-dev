import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "../ai/claude";
import type { Entity } from "@create/shared";
import type { LiftCopy } from "./entityToScreen";

const TIMEOUT_MS = 12_000;
let client: Anthropic | null = null;

export function parsePolish(text: string): LiftCopy {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return {};
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const pick = (k: string, max: number) => (typeof o[k] === "string" && o[k].trim() ? (o[k] as string).trim().slice(0, max) : undefined);
    return { title: pick("title", 120), summary: pick("summary", 240), footer: pick("footer", 160) };
  } catch {
    return {};
  }
}

/** Optional copy polish (title, one-line summary, footer). Never sees or alters rows beyond a 5-row sample for context. */
export async function polishCopy(entity: Entity, instruction: string | undefined): Promise<{ copy: LiftCopy; provider: "claude" | "mock" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.MOCK_AI === "1" || !apiKey) return { copy: {}, provider: "mock" };
  try {
    client ??= new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
    const sample = entity.rows.slice(0, 5).map((r) => entity.columns.map((c) => r[c.key] ?? "").join(" | ")).join("\n");
    const msg = await client.messages.create(
      {
        model: process.env.CLAUDE_EDIT_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        system:
          'You write short copy for a small tracking app made from a table. Reply with only JSON: {"title": string, "summary": string, "footer": string}. Title under 8 words, summary one plain sentence, footer one short friendly line. Sentence case. Never say website. Do not invent data.',
        messages: [
          {
            role: "user",
            content: `Table: ${entity.title}\nColumns: ${entity.columns.map((c) => c.label).join(", ")}\nSample rows:\n${sample}\nUser request: ${instruction?.trim() || "track this"}`,
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const copy = parsePolish(text);
    return Object.keys(copy).length ? { copy, provider: "claude" } : { copy: {}, provider: "mock" };
  } catch (err) {
    console.warn("[lift] polish skipped:", err instanceof Error ? err.message : "unknown");
    return { copy: {}, provider: "mock" };
  }
}
