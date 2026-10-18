import type { SketchRequest } from "@create/shared";
import { completeOpenAICompatible, requireKey, runVision } from "./chat";
import type { VisionProvider } from "./types";

export function createOpenAIProvider(): VisionProvider {
  return {
    id: "openai",
    async generate(req: SketchRequest) {
      const apiKey = requireKey(process.env.OPENAI_API_KEY, "OPENAI_API_KEY is not set");
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o";
      console.log(`[openai] Using model ${model}`);
      return runVision(req, (turns) =>
        completeOpenAICompatible({
          id: "openai",
          url: "https://api.openai.com/v1/chat/completions",
          apiKey,
          model,
          turns,
        }),
      );
    },
  };
}
