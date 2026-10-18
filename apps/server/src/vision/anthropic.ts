import type { SketchRequest } from "@create/shared";
import { DEFAULT_MODEL } from "../ai/claude";
import { completeAnthropic, requireKey, runVision } from "./chat";
import type { VisionProvider } from "./types";

export function anthropicVisionModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
}

export function createAnthropicProvider(): VisionProvider {
  return {
    id: "anthropic",
    async generate(req: SketchRequest) {
      const apiKey = requireKey(process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY is not set");
      const model = anthropicVisionModel();
      console.log(`[anthropic] Using model ${model}`);
      return runVision(req, (turns) => completeAnthropic({ apiKey, model, turns }));
    },
  };
}
