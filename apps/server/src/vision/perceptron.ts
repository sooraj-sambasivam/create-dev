import type { SketchRequest } from "@create/shared";
import { completeOpenAICompatible, requireKey, runVision } from "./chat";
import type { VisionProvider } from "./types";

export function createPerceptronProvider(): VisionProvider {
  return {
    id: "perceptron",
    async generate(req: SketchRequest) {
      const apiKey = requireKey(process.env.PERCEPTRON_API_KEY, "PERCEPTRON_API_KEY is not set");
      const model = process.env.PERCEPTRON_MODEL?.trim() || "perceptron-mk1.5";
      console.log(`[perceptron] Using model ${model}`);
      return runVision(req, (turns) =>
        completeOpenAICompatible({
          id: "perceptron",
          url: "https://api.perceptron.inc/v1/chat/completions",
          apiKey,
          model,
          turns,
        }),
      );
    },
  };
}
