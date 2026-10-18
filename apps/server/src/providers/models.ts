import type { EffortChoice, ModelChoice } from "@create/shared";

/** Composer model picker: id, label, whether this server can run it, and the efforts it honors. */
export interface ModelInfo {
  id: ModelChoice;
  label: string;
  available: boolean;
  efforts: EffortChoice[];
}

export const CLAUDE_SONNET = "claude-sonnet-5-5";
export const CLAUDE_HAIKU = "claude-haiku-5-5";

export const hasOpenRouter = () => Boolean(process.env.OPENROUTER_API_KEY?.trim());
export const hasTinker = () => Boolean(process.env.TINKER_API_KEY?.trim());
export const hasInkling = () => hasTinker() || hasOpenRouter();
export const TINKER_DEFAULT_BASE = "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1";
export const tinkerBaseUrl = () => (process.env.TINKER_BASE_URL?.trim() || TINKER_DEFAULT_BASE).replace(/\/+$/, "");
export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY?.trim());
/** Tinker (preferred) serves "thinkingmachines/Inkling"; OpenRouter uses the lowercase slug. INKLING_MODEL overrides both. */
export const inklingModel = () =>
  process.env.INKLING_MODEL?.trim() || (hasTinker() ? "thinkingmachines/Inkling" : "thinkingmachines/inkling");
export const geminiModel = () => process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

/** Claude model id for a picker choice; undefined for the non-Claude providers. */
export function claudeModelFor(choice: ModelChoice | undefined): string | undefined {
  if (choice === "sonnet") return CLAUDE_SONNET;
  if (choice === "haiku") return CLAUDE_HAIKU;
  return undefined;
}

export function listModels(): ModelInfo[] {
  const claude = process.env.MOCK_AI === "1" || Boolean(process.env.ANTHROPIC_API_KEY);
  return [
    { id: "sonnet", label: "Sonnet 5.5", available: claude, efforts: ["low", "medium", "high"] },
    { id: "haiku", label: "Haiku 5.5", available: claude, efforts: [] },
    { id: "inkling", label: "Inkling", available: hasInkling(), efforts: ["low", "medium", "high"] },
    { id: "gemini", label: "Gemini", available: hasGemini(), efforts: [] },
  ];
}
