import type { GenerateResponse, SketchRequest } from "@create/shared";

export const VISION_PROVIDER_IDS = ["perceptron", "openai", "anthropic", "grok"] as const;

export type VisionProviderId = (typeof VISION_PROVIDER_IDS)[number];

export interface VisionProvider {
  id: VisionProviderId;
  generate(req: SketchRequest): Promise<GenerateResponse>;
}

export type VisionImage = {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string;
};

/** A user turn may carry the sketch image. The repair turn sends it again. */
export type VisionUserContent = {
  text: string;
  image?: VisionImage;
};

export type VisionTurn =
  | { role: "system"; content: string }
  | { role: "user"; content: string | VisionUserContent }
  | { role: "assistant"; content: string };
