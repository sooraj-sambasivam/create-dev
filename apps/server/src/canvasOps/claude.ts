import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ScreenOpsSchema, sanitizeNodes, type CanvasOpsRequest, type ScreenOp } from "@create/shared";
import { GenerationError } from "../ai/claude";
import { outlineScreen } from "./outline";

export const CANVAS_OPS_MODEL = "claude-sonnet-5-5";
export const CANVAS_OPS_FAST_MODEL = "claude-haiku-5-5";
const MAX_CALLS = 2; // first answer + one repair round

export const ApplyOpsInputSchema = z.object({
  summary: z.string().describe("One or two sentences for the user: what changed on the page"),
  ops: ScreenOpsSchema,
});

function toolSchema(): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(ApplyOpsInputSchema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Tool.InputSchema;
}

const APPLY_TOOL: Anthropic.Tool = {
  name: "apply_ops",
  description: "Apply these edit operations to the page. Call exactly once.",
  input_schema: toolSchema(),
};

const SYSTEM = `You turn a rough drawing a person made on a canvas into edits on their web page.
The page is a typed tree (headings, text, buttons, images, containers...). You never write HTML, CSS or code.
You answer by calling apply_ops once with a short summary and a list of operations.

Operations: insert (parentId null = top level, optional index), replace (swap one node for 1-20 nodes), remove, style, update (patch fields of one node), page (title/theme/accent/font).

Rules:
- The region says where on the page the drawing sits (y in page units, page width 1200). The outline lists each node with an estimated y range. Prefer inserting a new top-level section at the index matching the region's y.
- Use replace when the region covers existing nodes and the note implies change ("make this...", "redo", "swap").
- Use only the typed node kinds from the schema. Ids are unique kebab-case, e.g. "pricing-card-pro".
- Read handwriting and box roles from the image (a box with an X is a picture, a wide short box is a button, a line of squiggles is a heading or text). Keep the person's own words verbatim.
- Do real copy, not lorem ipsum. Keep it to what was drawn; do not redesign the rest of the page.
- Never target an id that is not in the outline. Return at most 40 operations.`;

export function parseImage(dataUrl: string): { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string } {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s.exec(dataUrl);
  if (m) return { mediaType: m[1] as "image/png", data: m[2]! };
  return { mediaType: "image/png", data: dataUrl };
}

export function buildPrompt(req: CanvasOpsRequest, reading: string | null): string {
  const r = req.region;
  const where = `y ${Math.round(r.y)}-${Math.round(r.y + r.h)}` + (r.x != null && r.w != null ? `, x ${Math.round(r.x)}-${Math.round(r.x + r.w)}` : "");
  const parts = [
    `<region>${where} (page units, width 1200)</region>`,
    `<note>${req.label || "(no note)"}</note>`,
    `<shapes>${JSON.stringify(req.shapes.slice(0, 60))}</shapes>`,
  ];
  if (reading) parts.push(`<sketch_reading>\n${reading}\n</sketch_reading>`);
  parts.push(`<page_outline>\n${outlineScreen(req.screen)}\n</page_outline>`);
  parts.push("Turn the drawing into operations on this page.");
  return parts.join("\n\n");
}

/** Clean model-written nodes the same way the builder does before strict validation. */
export function sanitizeOpsInput(input: unknown, notes: string[]): unknown {
  const raw = (input ?? {}) as { summary?: unknown; ops?: unknown };
  if (!Array.isArray(raw.ops)) return raw;
  const ops = raw.ops.map((o: unknown) => {
    if (!o || typeof o !== "object") return o;
    const op = o as Record<string, unknown>;
    if (op.op === "insert" && op.node) return { ...op, node: sanitizeNodes([op.node], notes)[0] ?? op.node };
    if (op.op === "replace" && Array.isArray(op.nodes)) return { ...op, nodes: sanitizeNodes(op.nodes, notes) };
    return op;
  });
  return { ...raw, ops };
}

export type OpsClient = Pick<Anthropic, "messages">;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new GenerationError("ANTHROPIC_API_KEY is not set.", 503);
  client ??= new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

export function canvasOpsModel(): string {
  return process.env.CANVAS_OPS_FAST === "1" ? CANVAS_OPS_FAST_MODEL : CANVAS_OPS_MODEL;
}

export async function opsWithClaude(
  req: CanvasOpsRequest,
  reading: string | null,
  anthropic: OpsClient = getClient(),
): Promise<{ summary: string; ops: ScreenOp[] }> {
  const img = parseImage(req.image);
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
        { type: "text", text: buildPrompt(req, reading) },
      ],
    },
  ];
  let problem = "The model did not return any operations.";
  for (let call = 1; call <= MAX_CALLS; call++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: canvasOpsModel(),
        max_tokens: 8000,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: [APPLY_TOOL],
        tool_choice: { type: "tool", name: APPLY_TOOL.name },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new GenerationError("Anthropic rate limit hit. Try again in a few seconds.", 429);
      if (err instanceof Anthropic.APIError) throw new GenerationError(`Anthropic error ${err.status ?? ""}: ${err.message}`, 502);
      throw err;
    }
    if (response.stop_reason === "refusal") throw new GenerationError("The model declined this drawing.", 422);
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === APPLY_TOOL.name);
    if (!toolUse) {
      problem = "The model answered without calling apply_ops.";
      break;
    }
    const parsed = ApplyOpsInputSchema.safeParse(sanitizeOpsInput(toolUse.input, []));
    if (parsed.success) return parsed.data;
    const issues = parsed.error.issues.slice(0, 8).map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    problem = `The model's operations were invalid:\n${issues}`;
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, is_error: true, content: `Fix these problems and call apply_ops again with the complete corrected input:\n${issues}` }],
    });
  }
  throw new GenerationError(problem, 422);
}
