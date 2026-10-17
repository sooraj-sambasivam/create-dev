import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  EditNodeResponseSchema,
  GenerateResponseSchema,
  findNode,
  preserveStyles,
  sanitizeNodes,
  sanitizeScreen,
  walkNodes,
  type Asset,
  type EditNodeRequest,
  type EditNodeResponse,
  type GenerateRequest,
  type GenerateResponse,
  type Node,
} from "@create/shared";
import { resolveIconNames } from "../icons";
import { resolvePhoto } from "../images";
import { EDIT_NODE_INSTRUCTIONS, SYSTEM_PROMPT } from "./prompt";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
type Effort = "low" | "medium" | "high";
const MAX_ATTEMPTS = 3;

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
    throw new GenerationError("ANTHROPIC_API_KEY is not set. Add it to apps/server/.env or set MOCK_AI=1.", 503);
  }
  // timeout is in milliseconds for the TypeScript SDK.
  client ??= new Anthropic({ apiKey, timeout: 180_000, maxRetries: 1 });
  return client;
}

function effortFrom(envValue: string | undefined, fallback: Effort): Effort {
  return envValue === "low" || envValue === "medium" || envValue === "high" ? envValue : fallback;
}

function toolSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Tool.InputSchema;
}

// Tool definitions are built once so the request prefix (and its prompt cache) stays stable.
const RENDER_TOOL: Anthropic.Tool = {
  name: "render_screen",
  description: "Render the complete page. Call exactly once with the whole screen tree and a summary for the user.",
  input_schema: toolSchema(GenerateResponseSchema),
};
const REPLACE_TOOL: Anthropic.Tool = {
  name: "replace_element",
  description: "Replace the target element with these nodes (empty list removes it). Call exactly once.",
  input_schema: toolSchema(EditNodeResponseSchema),
};
const WEB_FETCH_TOOL = { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 } as unknown as Anthropic.ToolUnion;

const URL_RE = /https?:\/\/[^\s<>"]+/i;

/**
 * Ask Claude to call `tool`, then clean and validate its input. Invalid input goes back to
 * Claude as an error tool_result so it can repair it (up to MAX_ATTEMPTS calls). When the
 * request contains a URL, Claude may fetch it first (e.g. the user's existing site or menu).
 */
async function runTool<T>(opts: {
  label: string;
  tool: Anthropic.Tool;
  userMessage: string;
  effort: Effort;
  allowWebFetch: boolean;
  validate: (input: unknown, notes: string[]) => z.ZodSafeParseResult<T>;
}): Promise<{ data: T; notes: string[] }> {
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const anthropic = getClient();
  const started = Date.now();
  const tools: Anthropic.ToolUnion[] = opts.allowWebFetch ? [opts.tool, WEB_FETCH_TOOL] : [opts.tool];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.userMessage }];
  let lastProblem = "The model did not return a page.";

  for (let call = 1; call <= MAX_ATTEMPTS + 2; call++) {
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages
        .stream({
          model,
          max_tokens: 32000,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools,
          tool_choice: { type: "auto" },
          messages,
          output_config: { effort: opts.effort },
        })
        .finalMessage();
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
      throw new GenerationError(`The model declined this request (${response.stop_details?.explanation ?? "safety policy"}).`, 422);
    }
    if (response.stop_reason === "max_tokens") {
      throw new GenerationError("The page was too large to finish. Try asking for fewer sections.", 422);
    }
    // A server tool (web fetch) paused the turn; send it back to continue.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === opts.tool.name,
    );
    messages.push({ role: "assistant", content: response.content });
    if (!toolUse) {
      lastProblem = "The model answered without calling the tool.";
      messages.push({ role: "user", content: `Now call ${opts.tool.name} with the result.` });
      continue;
    }

    const notes: string[] = [];
    const parsed = opts.validate(toolUse.input, notes);
    if (parsed.success) {
      console.log(
        `[${opts.label}] ${model} effort=${opts.effort} calls=${call} ${Date.now() - started}ms ` +
          `out=${response.usage.output_tokens} cached=${response.usage.cache_read_input_tokens ?? 0}`,
      );
      return { data: parsed.data, notes };
    }

    const issues = parsed.error.issues
      .slice(0, 8)
      .map((i) => `- ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    lastProblem = `The model's output was invalid:\n${issues}`;
    console.warn(`[${opts.label}] invalid output on call ${call}, asking for a repair\n${issues}`);
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          is_error: true,
          content: `The input did not match the schema. Fix these problems and call ${opts.tool.name} again with the complete corrected input:\n${issues}`,
        },
      ],
    });
  }
  throw new GenerationError(lastProblem, 422);
}

// ---- post-processing shared by builds and edits ----

/** Replace icon names that don't exist with the closest real icon; drop ones with no match. */
async function fixIcons(nodes: Node[], notes: string[]): Promise<Node[]> {
  const names: string[] = [];
  walkNodes(nodes, (n) => {
    if (n.type === "icon") names.push(n.name);
    if ((n.type === "button" || n.type === "link") && n.icon) names.push(n.icon);
  });
  if (names.length === 0) return nodes;
  const resolved = await resolveIconNames(names);
  const map = (list: Node[]): Node[] =>
    list.flatMap((n): Node[] => {
      if (n.type === "icon") {
        const name = resolved.get(n.name);
        if (!name) {
          notes.push(`Couldn't find an icon for "${n.name}".`);
          return [];
        }
        return [{ ...n, name }];
      }
      if ((n.type === "button" || n.type === "link") && n.icon) return [{ ...n, icon: resolved.get(n.icon) ?? null }];
      if (n.type === "container") return [{ ...n, children: map(n.children) }];
      return [n];
    });
  return map(nodes);
}

type PhotoSlot = { kind: "image" | "avatar" | "background"; query: string; label: string };

function photoSlot(n: Node): PhotoSlot | null {
  if (n.type === "image" && !n.src) return { kind: "image", query: n.query || n.alt, label: n.alt };
  if (n.type === "avatar" && !n.src && n.query) return { kind: "avatar", query: n.query, label: n.name };
  if (n.type === "container" && !n.bgSrc && n.bgQuery) return { kind: "background", query: n.bgQuery, label: n.bgQuery };
  return null;
}

/**
 * Make sure every stock photo on the page actually exists before we answer, so the AI never
 * claims "I changed the photo" when nothing was found. Searches that only work in a simpler
 * form are rewritten to that form; searches with no result are reported to the user.
 * Lookups are cached, so unchanged photos cost nothing on later edits.
 */
async function verifyPhotos(nodes: Node[], notes: string[]): Promise<Node[]> {
  const queries = new Set<string>();
  walkNodes(nodes, (n) => {
    const slot = photoSlot(n);
    if (slot) queries.add(slot.query);
  });
  if (queries.size === 0) return nodes;

  const results = new Map<string, { query: string } | null>();
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 15_000));
  await Promise.race([
    Promise.all([...queries].map(async (q) => results.set(q, await resolvePhoto(q)))),
    timeout,
  ]);

  const missing: string[] = [];
  const map = (list: Node[]): Node[] =>
    list.map((n) => {
      const slot = photoSlot(n);
      let next: Node = n;
      if (slot && results.has(slot.query)) {
        const found = results.get(slot.query);
        if (!found) {
          missing.push(slot.label);
        } else if (found.query !== slot.query) {
          if (n.type === "image" || n.type === "avatar") next = { ...n, query: found.query };
          if (n.type === "container") next = { ...n, bgQuery: found.query };
        }
      }
      return next.type === "container" ? { ...next, children: map(next.children) } : next;
    });
  const out = map(nodes);
  if (missing.length > 0) {
    const list = [...new Set(missing)].slice(0, 4).map((m) => `"${m}"`).join(", ");
    notes.push(
      `I couldn't find a matching stock photo for ${list}, so ${missing.length === 1 ? "it shows" : "they show"} a "no photo" placeholder. Upload your own picture there, or describe it in simpler words.`,
    );
  }
  return out;
}

function withNotes(summary: string, notes: string[]): string {
  const unique = [...new Set(notes)];
  return unique.length ? `${summary} ${unique.join(" ")}` : summary;
}

function assetsBlock(assets: Asset[] | undefined): string | null {
  if (!assets || assets.length === 0) return null;
  return `<assets>\n${JSON.stringify(assets)}\n</assets>`;
}

// ---- public API ----

function today(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function buildUserMessage(req: GenerateRequest): string {
  const parts: string[] = [`Today is ${today()}.`];
  const assets = assetsBlock(req.assets);
  if (assets) parts.push(assets);
  if (req.history && req.history.length > 0) {
    parts.push(`<history>\n${req.history.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n</history>`);
  }
  if (req.screen) parts.push(`<current_screen>\n${JSON.stringify(req.screen)}\n</current_screen>`);
  parts.push(req.screen ? `Edit request: ${req.prompt}` : `Build this screen: ${req.prompt}`);
  return parts.join("\n\n");
}

export async function generateWithClaude(req: GenerateRequest): Promise<GenerateResponse> {
  // A new page benefits from more thought; page-wide edits stay quick.
  const effort = req.screen
    ? effortFrom(process.env.CLAUDE_EDIT_EFFORT, "low")
    : effortFrom(process.env.CLAUDE_BUILD_EFFORT, "medium");
  const { data, notes } = await runTool({
    label: "generate",
    tool: RENDER_TOOL,
    userMessage: buildUserMessage(req),
    effort,
    allowWebFetch: URL_RE.test(req.prompt),
    validate: (input, notes) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      return GenerateResponseSchema.safeParse({ ...raw, screen: sanitizeScreen(raw.screen, notes) });
    },
  });

  let screen = preserveStyles(req.screen, data.screen);
  const [withIcons] = await Promise.all([fixIcons(screen.children, notes)]);
  screen = { ...screen, children: await verifyPhotos(withIcons, notes) };
  // Keep the brand color on edits unless the model deliberately changed it.
  if (req.screen?.accent && !screen.accent) screen.accent = req.screen.accent;
  return { summary: withNotes(data.summary, notes), screen };
}

export async function editNodeWithClaude(req: EditNodeRequest): Promise<EditNodeResponse> {
  const target = findNode(req.screen, req.nodeId);
  if (!target) throw new GenerationError("That element no longer exists. Select it again.", 404);

  const message = [
    `Today is ${today()}.`,
    assetsBlock(req.assets),
    `<current_screen>\n${JSON.stringify(req.screen)}\n</current_screen>`,
    `<target_node>\n${JSON.stringify(target)}\n</target_node>`,
    EDIT_NODE_INSTRUCTIONS,
    `Edit request for ${req.nodeId}: ${req.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data, notes } = await runTool({
    label: "edit-node",
    tool: REPLACE_TOOL,
    userMessage: message,
    effort: effortFrom(process.env.CLAUDE_EDIT_EFFORT, "low"),
    allowWebFetch: URL_RE.test(req.prompt),
    validate: (input, notes) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      return EditNodeResponseSchema.safeParse({ ...raw, nodes: sanitizeNodes(raw.nodes, notes) });
    },
  });

  // Carry over hand-set styles for nodes the model kept but returned without them.
  const kept = preserveStyles({ ...req.screen, children: [target] }, { ...req.screen, children: data.nodes });
  const nodes = await verifyPhotos(await fixIcons(kept.children, notes), notes);
  return { summary: withNotes(data.summary, notes), nodes };
}
