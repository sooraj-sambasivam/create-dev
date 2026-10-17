import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  GenerateResponseSchema,
  preserveStyles,
  sanitizeScreen,
  type GenerateResponse,
  type SketchRequest,
} from "@create/shared";
import { DEFAULT_MODEL, GenerationError, buildUserMessage } from "../ai/claude";
import { SYSTEM_PROMPT } from "../ai/prompt";

const MAX_CALLS = 3; // first attempt plus repair rounds

export const SKETCH_INSTRUCTIONS = `The attached image is a hand-drawn wireframe of the page, and <sketch_shapes> lists its shapes in page coordinates (x, y, w, h, type, text). Turn the drawing into a real page:
- Rectangles are sections, cards, inputs, images or buttons: decide by aspect ratio, size and position. Wide and short boxes with a short label are buttons; roughly square or large empty boxes are images; boxes that hold other shapes are containers or cards.
- Text shapes are exact copy: use their words verbatim. Do not rewrite them. Fill in believable copy only for empty boxes that clearly need it.
- Arrows are flow hints (for example a button pointing at a section means that button links to it with href '#id').
- Keep the order of the drawing: top to bottom, then left to right. Shapes side by side become a row.
- If a current screen is given, keep what the drawing does not change and update the rest to match the sketch.`;

export type SketchMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Largest decoded image the sketch route accepts. 5 MiB. */
export const MAX_SKETCH_IMAGE_BYTES = 5 * 1024 * 1024;

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s;
const MEDIA_TYPES: Record<string, SketchMediaType> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/**
 * Splits a sketch image into its media type and raw base64. Accepts a png, jpeg, webp or gif data
 * URL; a bare base64 string is treated as png. Any other data URL type is refused with 415.
 */
export function parseSketchImage(image: string): { mediaType: SketchMediaType; data: string } {
  let mediaType: SketchMediaType = "image/png";
  let payload = image;
  if (image.startsWith("data:")) {
    const m = DATA_URL.exec(image);
    const declared = m ? MEDIA_TYPES[m[1].toLowerCase()] : undefined;
    if (!m || !declared) {
      throw new GenerationError("Sketch image must be a PNG, JPEG, WebP or GIF data URL.", 415);
    }
    mediaType = declared;
    payload = m[2];
  }
  return { mediaType, data: payload.replace(/\s+/g, "") };
}

export function toBase64(image: string): string {
  return parseSketchImage(image).data;
}

/**
 * Decoded byte length of a base64 string, computed from its length and padding without decoding.
 */
export function decodedBase64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/**
 * Throws GenerationError 413 when the sketch image decodes to more than 5 MiB. Call before any
 * upstream request so an oversize image never reaches Anthropic.
 */
export function assertSketchImageSize(image: string): void {
  const { data } = parseSketchImage(image);
  if (decodedBase64Bytes(data) > MAX_SKETCH_IMAGE_BYTES) {
    throw new GenerationError("Sketch image is larger than 5 MB. Draw a smaller sketch or export at a lower size.", 413);
  }
}

export function buildSketchMessage(req: SketchRequest): string {
  const base = buildUserMessage({
    prompt: req.prompt?.trim() || "Turn my sketch into a page.",
    screen: req.screen ?? undefined,
  } as Parameters<typeof buildUserMessage>[0]);
  return `${base}\n\n<sketch_shapes>\n${JSON.stringify(req.shapes)}\n</sketch_shapes>\n\n${SKETCH_INSTRUCTIONS}`;
}

function sketchTool(): Anthropic.Tool {
  const json = z.toJSONSchema(GenerateResponseSchema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return {
    name: "render_screen",
    description: "Render the complete page. Call exactly once with the whole screen tree and a summary for the user.",
    input_schema: json as Anthropic.Tool.InputSchema,
  };
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new GenerationError("ANTHROPIC_API_KEY is not set. Add it to apps/server/.env or set MOCK_AI=1.", 503);
  client ??= new Anthropic({ apiKey, timeout: 180_000, maxRetries: 1 });
  return client;
}

export async function generateSketchWithClaude(req: SketchRequest): Promise<GenerateResponse> {
  // Validate the image before touching the client, so bad or oversize input never reaches Anthropic.
  assertSketchImageSize(req.image);
  const image = parseSketchImage(req.image);
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const anthropic = getClient();
  const tool = sketchTool();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: buildSketchMessage(req) },
      ],
    },
  ];
  let lastProblem = "The model did not return a page.";

  for (let call = 1; call <= MAX_CALLS; call++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages
        .stream({
          model,
          max_tokens: 32000,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: [tool],
          tool_choice: { type: "auto" },
          messages,
          output_config: { effort: "medium" },
        })
        .finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new GenerationError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY.", 502);
      if (err instanceof Anthropic.RateLimitError) throw new GenerationError("Anthropic rate limit hit. Try again in a few seconds.", 429);
      if (err instanceof Anthropic.APIError) throw new GenerationError(`Anthropic error ${err.status ?? ""}: ${err.message}`, 502);
      throw err;
    }
    if (response.stop_reason === "refusal") throw new GenerationError("The model declined this request.", 422);
    if (response.stop_reason === "max_tokens") throw new GenerationError("The page was too large to finish. Try a simpler sketch.", 422);

    messages.push({ role: "assistant", content: response.content });
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool.name);
    if (!toolUse) {
      lastProblem = "The model answered without calling the tool.";
      messages.push({ role: "user", content: `Now call ${tool.name} with the result.` });
      continue;
    }

    const notes: string[] = [];
    const raw = (toolUse.input ?? {}) as Record<string, unknown>;
    const parsed = GenerateResponseSchema.safeParse({ ...raw, screen: sanitizeScreen(raw.screen, notes) });
    if (parsed.success) {
      let screen = preserveStyles(req.screen, parsed.data.screen);
      if (req.screen?.accent && !screen.accent) screen = { ...screen, accent: req.screen.accent };
      const unique = [...new Set(notes)];
      return { summary: unique.length ? `${parsed.data.summary} ${unique.join(" ")}` : parsed.data.summary, screen };
    }
    const issues = parsed.error.issues.slice(0, 8).map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    lastProblem = `The model's output was invalid:\n${issues}`;
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `The input did not match the schema. Fix these problems and call ${tool.name} again with the complete corrected input:\n${issues}`,
        },
      ],
    });
  }
  throw new GenerationError(lastProblem, 422);
}
