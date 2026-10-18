import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "../../ai/claude";
import { imageBlock } from "../../ask/ask";
import type { LocateProvider } from "../types";
import { BOX_PROMPT, cursorFraction, parseBoxJson } from "./shared";

let shared: Anthropic | null = null;

/** Claude vision fallback; skipped under MOCK_AI so tests and demos never spend. */
export const locateClaude: LocateProvider = async (ctx) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!ctx.deps.client && (!apiKey || process.env.MOCK_AI === "1")) throw new Error("Claude vision unavailable");
  const block = imageBlock(ctx.image?.dataUrl);
  if (!block) return [];
  shared ??= new Anthropic({ apiKey: apiKey ?? "unset", maxRetries: 0 });
  const msg = await (ctx.deps.client ?? shared).messages.create(
    {
      model: process.env.CLAUDE_ASK_MODEL || DEFAULT_MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: [block, { type: "text", text: BOX_PROMPT(cursorFraction(ctx)) }] }],
    },
    { timeout: ctx.timeoutMs },
  );
  return parseBoxJson(msg.content.map((b) => (b.type === "text" ? b.text : "")).join(""), ctx, "claude", 0.7);
};
