import { GenerationError } from "../ai/claude";
import { createAnthropicProvider } from "./anthropic";
import { createGrokProvider } from "./grok";
import { createOpenAIProvider } from "./openai";
import { createPerceptronProvider } from "./perceptron";
import { VISION_PROVIDER_IDS, type VisionProvider, type VisionProviderId } from "./types";

const providers: Record<VisionProviderId, () => VisionProvider> = {
  perceptron: createPerceptronProvider,
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  grok: createGrokProvider,
};

export function listProviderIds(): VisionProviderId[] {
  return [...VISION_PROVIDER_IDS];
}

/**
 * VISION_PROVIDER wins when it is set.
 * Otherwise Perceptron is the default when its key is present, and Anthropic otherwise.
 */
export function resolveVisionProviderId(explicit?: string): VisionProviderId {
  const requested = (explicit ?? process.env.VISION_PROVIDER ?? "").trim().toLowerCase();
  if (requested) {
    if (!isProviderId(requested)) {
      throw new GenerationError(
        `Unknown vision provider "${requested}". Supported: ${VISION_PROVIDER_IDS.join(", ")}`,
        400,
      );
    }
    return requested;
  }
  if (process.env.PERCEPTRON_API_KEY?.trim()) return "perceptron";
  return "anthropic";
}

export function getVisionProvider(id?: string): VisionProvider {
  return providers[resolveVisionProviderId(id)]();
}

function isProviderId(value: string): value is VisionProviderId {
  return (VISION_PROVIDER_IDS as readonly string[]).includes(value);
}
