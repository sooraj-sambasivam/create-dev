import { geminiText } from "../../providers/http";
import type { LocateProvider } from "../types";
import { BOX_PROMPT, cursorFraction, parseBoxJson } from "./shared";

/** Gemini bounding boxes: [ymin,xmin,ymax,xmax] normalized 0-1000. */
export const locateGemini: LocateProvider = async (ctx) => {
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error("GEMINI_API_KEY not set");
  if (!ctx.image) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
  try {
    const text = await geminiText({
      user: BOX_PROMPT(cursorFraction(ctx)),
      image: ctx.image.dataUrl,
      json: true,
      maxTokens: 800,
      signal: controller.signal,
      fetchImpl: ctx.deps.fetchImpl,
    });
    if (!text) throw new Error(controller.signal.aborted ? `timeout after ${ctx.timeoutMs}ms` : "no response");
    return parseBoxJson(text, ctx, "gemini", 0.8);
  } finally {
    clearTimeout(timer);
  }
};
