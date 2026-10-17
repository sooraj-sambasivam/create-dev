import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  GenerateOutputSchema,
  GenerateResponseSchema,
  assembleScreen,
  preserveStyles,
  type GenerateRequest,
  type GenerateResponse,
} from "@create/shared";
import { SYSTEM_PROMPT } from "./prompt";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export class GenerationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new GenerationError(
      "ANTHROPIC_API_KEY is not set. Add it to apps/server/.env or set MOCK_AI=1.",
      503,
    );
  }
  // timeout is in milliseconds for the TypeScript SDK.
  client ??= new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

export function buildUserMessage(req: GenerateRequest): string {
  const parts: string[] = [];
  if (req.history && req.history.length > 0) {
    parts.push(`<history>\n${req.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n</history>`);
  }
  if (req.screen) {
    parts.push(`<current_screen>\n${JSON.stringify(req.screen)}\n</current_screen>`);
  }
  if (req.screen && req.selectedId) {
    parts.push(
      `<selected_node>${req.selectedId}</selected_node>\nThe user has this node selected. Words like "this", "it" or "here" refer to it; apply the edit to it (or around it) unless the request clearly says otherwise.`,
    );
  }
  parts.push(req.screen ? `Edit request: ${req.prompt}` : `Build this screen: ${req.prompt}`);
  return parts.join("\n\n");
}

export async function generateWithClaude(req: GenerateRequest): Promise<GenerateResponse> {
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const anthropic = getClient();
  const started = Date.now();

  let response;
  try {
    response = await anthropic.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(req) }],
      output_config: {
        // Low effort keeps time-to-screen short for a live demo; raise if layouts get sloppy.
        effort: "low",
        // Flat node list: the API rejects recursive schemas, see assembleScreen.
        format: zodOutputFormat(GenerateOutputSchema),
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new GenerationError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY.", 502);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new GenerationError("Anthropic rate limit hit. Try again in a few seconds.", 429);
    }
    if (err instanceof Anthropic.APIError) {
      throw new GenerationError(`Anthropic error ${err.status ?? ""}: ${err.message}`, 502);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.explanation ?? "safety policy";
    throw new GenerationError(`The model declined this request (${why}).`, 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new GenerationError("The screen was too large to finish. Try a simpler description.", 422);
  }
  if (!response.parsed_output) {
    throw new GenerationError("The model returned output that did not match the screen schema.", 422);
  }

  // Rebuild the tree, then validate it against the renderer's schema.
  const checked = GenerateResponseSchema.safeParse(assembleScreen(response.parsed_output));
  if (!checked.success) {
    throw new GenerationError(`Schema mismatch: ${checked.error.issues[0]?.message ?? "unknown"}`, 422);
  }

  console.log(
    `[generate] ${model} ${Date.now() - started}ms ` +
      `in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
  );
  // Safety net: keep hand-set styles on nodes the model returned without them.
  return { ...checked.data, screen: preserveStyles(req.screen, checked.data.screen) };
}
