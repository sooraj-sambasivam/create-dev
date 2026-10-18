import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NodeSchema, sanitizeNodes, type Node, type Screen } from "@create/shared";
import type { NarrationSession } from "@create/shared";
import { GenerationError, generateWithClaude } from "../ai/claude";
import { PlanSchema, digestSession, outlineScreen, slug, takeId, type Plan, type PlanSection } from "./plan";

export const PLAN_MODEL = process.env.DEMO_PLAN_MODEL || "claude-haiku-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new GenerationError("ANTHROPIC_API_KEY is not set. Add it to apps/server/.env or set MOCK_AI=1.", 503);
  client ??= new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 });
  return client;
}

function planTool(): Anthropic.Tool {
  const json = z.toJSONSchema(PlanSchema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return {
    name: "plan_page",
    description: "Plan the page: a title and up to 6 ordered sections.",
    input_schema: json as Anthropic.Tool.InputSchema,
  };
}

const PLAN_SYSTEM = `You turn a person's spoken walkthrough of an app or website idea into a page plan.
You get the transcript, the things they pointed at (lasso targets) and optionally an outline of the page they already have.
Call plan_page once. Rules:
- title: a short product or page name taken from what they said.
- sections: 3 to 6, in reading order. Each has a kebab-case id, a purpose (2 to 4 word heading) and content (the concrete copy and facts the speaker gave for it; do not invent facts they did not mention, keep the words they used).
- A thing they pointed at while talking becomes or informs a section.
- If an existing page outline is given, plan only what is new or changed; do not repeat sections it already has.`;

export function buildPlanMessage(session: NarrationSession, screen?: Screen | null): string {
  const d = digestSession(session);
  const parts = [
    `<transcript>\n${d.speech.map((s, i) => `${i + 1}. ${s}`).join("\n") || "(no speech)"}\n</transcript>`,
    `<pointed_at>\n${d.targets.map((t) => `- ${t.label} (${t.kind})`).join("\n") || "(nothing)"}\n</pointed_at>`,
  ];
  if (d.notes.length) parts.push(`<notes>\n${d.notes.map((n) => `- ${n}`).join("\n")}\n</notes>`);
  const outline = outlineScreen(screen);
  if (outline.length) parts.push(`<current_page title="${screen?.title ?? ""}">\n${JSON.stringify(outline)}\n</current_page>`);
  return parts.join("\n\n");
}

/** Haiku turns the session into a plan. Throws on failure; the caller falls back to the mock plan. */
export async function planWithClaude(session: NarrationSession, screen?: Screen | null, signal?: AbortSignal): Promise<Plan> {
  const tool = planTool();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPlanMessage(session, screen) }];
  let problem = "The planner returned nothing usable.";
  for (let call = 0; call < 2; call++) {
    const res = await getClient().messages.create({
      model: PLAN_MODEL,
      max_tokens: 4000,
      system: PLAN_SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages,
    }, { signal });
    const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!use) break;
    const parsed = PlanSchema.safeParse(use.input);
    if (parsed.success) {
      const taken = new Set<string>();
      return { ...parsed.data, sections: parsed.data.sections.map((s) => ({ ...s, id: takeId(taken, slug(s.id, "section")) })) };
    }
    problem = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Invalid plan: ${problem}. Call plan_page again.` }],
    });
  }
  throw new GenerationError(problem, 422);
}

export function sectionPrompt(plan: Plan, section: PlanSection, index: number): string {
  return [
    `You are building ONE section of the page "${plan.title}" (section ${index + 1} of ${plan.sections.length}: "${section.purpose}").`,
    `Section content to cover (use these words and facts): ${section.content || section.purpose}`,
    `Other sections on the page: ${plan.sections.map((s) => s.purpose).join(", ")}.`,
    `Output rules: return a screen whose children are ONLY this section's content: no navigation bar, no footer, no other sections. Make it one visually complete section (heading plus real content such as cards, a list, images or a form where it fits).`,
    `Give the top-level container the id "${section.id}".`,
  ].join("\n");
}

/** Settle early with the abort reason when the signal fires; the wrapped promise's late result is ignored. */
export function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    p.catch(() => {}); // a late rejection after abort must not be unhandled
  });
}

/** Build one section with Abel's generate machinery; the nodes are validated by its schema pass. */
export async function buildSectionWithClaude(
  plan: Plan,
  section: PlanSection,
  index: number,
  signal?: AbortSignal,
): Promise<{ nodes: Node[]; accent?: string | null }> {
  signal?.throwIfAborted();
  // generateWithClaude (Abel-owned) takes no AbortSignal, so its in-flight request cannot be cancelled
  // from here; stop waiting on it as soon as the client leaves and never start it after an abort.
  const res = await abortable(generateWithClaude({ prompt: sectionPrompt(plan, section, index), screen: undefined }, { skipPhotoVerify: true }), signal);
  const clean = z.array(NodeSchema).parse(sanitizeNodes(res.screen.children));
  return { nodes: clean, accent: res.screen.accent };
}

/**
 * Wrap a built section's nodes into one container with the planned id, renaming any node id that
 * is already taken so sections built in parallel never collide.
 */
export function wrapSection(section: PlanSection, nodes: Node[], taken: Set<string>): Node {
  const first = nodes.length === 1 && nodes[0].type === "container" ? (nodes[0] as Extract<Node, { type: "container" }>) : null;
  const id = takeId(taken, section.id);
  const rename = (list: Node[]): Node[] =>
    list.map((n) => {
      const nid = takeId(taken, n.id);
      return n.type === "container" ? { ...n, id: nid, children: rename(n.children) } : { ...n, id: nid };
    });
  if (first) return { ...first, id, children: rename(first.children) };
  return { id, type: "container", direction: "column", gap: "md", padding: "lg", children: rename(nodes) } as unknown as Node;
}
