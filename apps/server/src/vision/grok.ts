import type { SketchRequest } from "@create/shared";
import { completeOpenAICompatible, requireKey, runVision } from "./chat";
import type { VisionProvider } from "./types";

export function createGrokProvider(): VisionProvider {
  return {
    id: "grok",
    async generate(req: SketchRequest) {
      const apiKey = requireKey(process.env.XAI_API_KEY || process.env.GROK_API_KEY, "XAI_API_KEY is not set");
      const model = process.env.GROK_MODEL?.trim() || process.env.XAI_MODEL?.trim() || "grok-4.7";
      console.log(`[grok] Using model ${model}`);
      return runVision(req, (turns) =>
        completeOpenAICompatible({
          id: "grok",
          url: "https://api.x.ai/v1/chat/completions",
          apiKey,
          model,
          turns,
          detail: "high",
          timeoutMs: 360_000,
        }),
      );
    },
  };
}
