import { z } from "zod";

/**
 * The component tree every input mode (text, voice, canvas, narrate) produces.
 * Props are enumerated on purpose: the renderer stays deterministic and the model
 * cannot invent arbitrary CSS. Keep this file the single source of truth; the
 * server uses it for structured output and the web app for rendering.
 *
 * Two flavours of every node:
 *  - Tree nodes (NodeSchema): what the renderer and the editor use. `style` and
 *    `widthPct` are nullish so hand-written trees (mock, canvas mode) can omit them.
 *  - Flat nodes (FlatNodeSchema): what the model emits. Structured output needs
 *    every field present (nullable, not optional) and rejects recursion, so each
 *    node carries a `parentId` instead of `children`.
 */

const id = z.string().describe("Unique short kebab-case id, e.g. 'hero-title'");

/** Per-node visual overrides a user (or the model, when asked) can set. */
export const StyleSchema = z.object({
  color: z.string().nullable().describe("CSS text color, e.g. #16a34a; null = default"),
  background: z.string().nullable().describe("CSS background color; null = default"),
  radius: z.enum(["none", "sm", "md", "lg", "full"]).nullable().describe("Corner rounding; null = default"),
});
export type Style = z.infer<typeof StyleSchema>;

const styledTree = {
  style: StyleSchema.nullish(),
  widthPct: z.number().nullish(),
};

// ---- leaf fields (shared by tree and flat variants) ----

const headingFields = {
  id,
  type: z.literal("heading"),
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
};
const textFields = {
  id,
  type: z.literal("text"),
  text: z.string(),
  tone: z.enum(["default", "muted"]),
};
const textboxFields = {
  id,
  type: z.literal("textbox"),
  label: z.string().describe("Visible label; empty string for none"),
  placeholder: z.string(),
  multiline: z.boolean(),
};
const buttonFields = {
  id,
  type: z.literal("button"),
  label: z.string(),
  variant: z.enum(["primary", "secondary", "ghost"]),
};
const imageFields = {
  id,
  type: z.literal("image"),
  alt: z.string().describe("What the image shows, used as caption and placeholder seed"),
  aspect: z.enum(["video", "square", "wide"]),
};
const checkboxFields = {
  id,
  type: z.literal("checkbox"),
  label: z.string(),
};
const selectFields = {
  id,
  type: z.literal("select"),
  label: z.string(),
  options: z.array(z.string()),
};
const linkFields = {
  id,
  type: z.literal("link"),
  text: z.string(),
};
const dividerFields = {
  id,
  type: z.literal("divider"),
};
const containerFields = {
  id,
  type: z.literal("container"),
  direction: z.enum(["row", "column"]),
  gap: z.enum(["sm", "md", "lg"]),
  align: z.enum(["start", "center", "end", "stretch"]),
  justify: z.enum(["start", "center", "end", "between"]),
  padding: z.enum(["none", "sm", "md", "lg"]),
  background: z.enum(["none", "surface", "accent", "muted"]),
  width: z.enum(["full", "auto", "half", "third"]),
};

// ---- tree variant ----

export const HeadingSchema = z.object({ ...headingFields, ...styledTree });
export const TextSchema = z.object({ ...textFields, ...styledTree });
export const TextboxSchema = z.object({ ...textboxFields, ...styledTree });
export const ButtonSchema = z.object({ ...buttonFields, ...styledTree });
export const ImageSchema = z.object({ ...imageFields, ...styledTree });
export const CheckboxSchema = z.object({ ...checkboxFields, ...styledTree });
export const SelectSchema = z.object({ ...selectFields, ...styledTree });
export const LinkSchema = z.object({ ...linkFields, ...styledTree });
export const DividerSchema = z.object({ ...dividerFields, ...styledTree });

// Fields are written out here instead of spread: TypeScript can only infer the recursive
// type when the object literal containing the getter is explicit.
export const ContainerSchema = z.object({
  id,
  type: z.literal("container"),
  direction: z.enum(["row", "column"]),
  gap: z.enum(["sm", "md", "lg"]),
  align: z.enum(["start", "center", "end", "stretch"]),
  justify: z.enum(["start", "center", "end", "between"]),
  padding: z.enum(["none", "sm", "md", "lg"]),
  background: z.enum(["none", "surface", "accent", "muted"]),
  width: z.enum(["full", "auto", "half", "third"]),
  style: StyleSchema.nullish(),
  widthPct: z.number().nullish(),
  get children() {
    return z.array(NodeSchema);
  },
});

export const LeafSchema = z.discriminatedUnion("type", [
  HeadingSchema,
  TextSchema,
  TextboxSchema,
  ButtonSchema,
  ImageSchema,
  CheckboxSchema,
  SelectSchema,
  LinkSchema,
  DividerSchema,
]);

export const NodeSchema = z.discriminatedUnion("type", [
  HeadingSchema,
  TextSchema,
  TextboxSchema,
  ButtonSchema,
  ImageSchema,
  CheckboxSchema,
  SelectSchema,
  LinkSchema,
  DividerSchema,
  ContainerSchema,
]);

export const ScreenSchema = z.object({
  title: z.string().describe("Short page title"),
  theme: z.enum(["light", "dark"]),
  children: z.array(NodeSchema),
});

export const GenerateResponseSchema = z.object({
  summary: z.string().describe("One sentence telling the user what was built or changed"),
  screen: ScreenSchema,
});

// ---- flat variant (model output) ----

const parentId = z
  .string()
  .nullable()
  .describe("id of the container this node sits in (must appear earlier in the list), or null for top level");

export const FlatNodeSchema = z.discriminatedUnion("type", [
  z.object({ ...headingFields, parentId }),
  z.object({ ...textFields, parentId }),
  z.object({ ...textboxFields, parentId }),
  z.object({ ...buttonFields, parentId }),
  z.object({ ...imageFields, parentId }),
  z.object({ ...checkboxFields, parentId }),
  z.object({ ...selectFields, parentId }),
  z.object({ ...linkFields, parentId }),
  z.object({ ...dividerFields, parentId }),
  z.object({ ...containerFields, parentId }),
]);

/**
 * Visual overrides travel as one short string per node, e.g.
 *   "hero-cta color=#ffffff bg=#16a34a radius=lg width=50"
 * Anthropic's structured-output grammar has a size ceiling and the node union already sits
 * near it; any extra object type pushes it over, while a list of strings does not.
 */
export const STYLE_LINE_HELP =
  'One line per node that needs a custom look: "<nodeId> color=#16a34a bg=#ffffff radius=lg width=50". ' +
  "Keys are optional; radius is none|sm|md|lg|full; width is percent of the parent (10-100). Empty list when not needed.";

export interface StyleEntry {
  nodeId: string;
  style: Style | null;
  widthPct: number | null;
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;
const RADII = ["none", "sm", "md", "lg", "full"] as const;

export function parseStyleLine(line: string): StyleEntry | null {
  const [nodeId, ...pairs] = line.trim().split(/\s+/);
  if (!nodeId) return null;
  const style: Style = { color: null, background: null, radius: null };
  let widthPct: number | null = null;
  for (const pair of pairs) {
    const [rawKey, value = ""] = pair.split("=");
    const key = rawKey.toLowerCase();
    if ((key === "color" || key === "text") && COLOR_RE.test(value)) style.color = value;
    else if ((key === "bg" || key === "background") && COLOR_RE.test(value)) style.background = value;
    else if (key === "radius" && (RADII as readonly string[]).includes(value)) style.radius = value as Style["radius"];
    else if (key === "width") {
      const n = parseFloat(value);
      if (Number.isFinite(n) && n > 0) widthPct = Math.min(100, Math.max(10, Math.round(n)));
    }
  }
  const hasStyle = Boolean(style.color || style.background || style.radius);
  if (!hasStyle && widthPct === null) return null;
  return { nodeId, style: hasStyle ? style : null, widthPct };
}

export function formatStyleLine(nodeId: string, style: Style | null | undefined, widthPct: number | null | undefined): string | null {
  const parts = [nodeId];
  if (style?.color) parts.push(`color=${style.color}`);
  if (style?.background) parts.push(`bg=${style.background}`);
  if (style?.radius) parts.push(`radius=${style.radius}`);
  if (widthPct) parts.push(`width=${widthPct}`);
  return parts.length > 1 ? parts.join(" ") : null;
}

export const GenerateOutputSchema = z.object({
  summary: z.string().describe("One sentence telling the user what was built or changed"),
  title: z.string().describe("Short page title"),
  theme: z.enum(["light", "dark"]),
  nodes: z
    .array(FlatNodeSchema)
    .describe("Every node on the screen in document order; containers come before their children"),
  styles: z.array(z.string()).describe(STYLE_LINE_HELP),
});

// ---- requests ----

export const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  screen: ScreenSchema.nullable().optional(),
  history: z.array(z.string().max(4000)).max(20).optional(),
  /** Node the user has selected in the editor; "this" / "it" in the prompt refers to it. */
  selectedId: z.string().max(200).nullable().optional(),
});

export const TranscribeResponseSchema = z.object({
  text: z.string(),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
});

// ---- types ----

export type Heading = z.infer<typeof HeadingSchema>;
export type TextNode = z.infer<typeof TextSchema>;
export type Textbox = z.infer<typeof TextboxSchema>;
export type Button = z.infer<typeof ButtonSchema>;
export type Image = z.infer<typeof ImageSchema>;
export type Checkbox = z.infer<typeof CheckboxSchema>;
export type Select = z.infer<typeof SelectSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Divider = z.infer<typeof DividerSchema>;
export type Container = z.infer<typeof ContainerSchema>;
export type Leaf = z.infer<typeof LeafSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type NodeType = Node["type"];
export type Screen = z.infer<typeof ScreenSchema>;
export type FlatNode = z.infer<typeof FlatNodeSchema>;
export type GenerateOutput = z.infer<typeof GenerateOutputSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const NODE_TYPES = NodeSchema.options.map((o) => o.shape.type.value);

// ---- flat <-> tree ----

/** Rebuild the tree from the model's flat list. Unknown parents fall back to top level. */
export function assembleScreen(out: GenerateOutput): GenerateResponse {
  const styleById = new Map<string, StyleEntry>();
  for (const line of out.styles) {
    const entry = parseStyleLine(line);
    if (entry) styleById.set(entry.nodeId, entry);
  }
  const containers = new Map<string, Container>();
  const seen = new Set<string>();
  const roots: Node[] = [];
  for (const flat of out.nodes) {
    const { parentId, ...rest } = flat;
    const entry = styleById.get(rest.id);
    const look = entry ? { style: entry.style, widthPct: entry.widthPct } : {};
    let nodeId = rest.id;
    for (let n = 2; seen.has(nodeId); n++) nodeId = `${rest.id}-${n}`;
    seen.add(nodeId);
    const node: Node =
      rest.type === "container" ? { ...rest, ...look, id: nodeId, children: [] } : { ...rest, ...look, id: nodeId };
    if (node.type === "container") containers.set(node.id, node);
    const parent = parentId ? containers.get(parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return { summary: out.summary, screen: { title: out.title, theme: out.theme, children: roots } };
}

/** Flatten a tree (inverse of assembleScreen): nodes plus the side list of styles. */
export function flattenScreen(screen: Screen): { nodes: FlatNode[]; styles: string[] } {
  const nodes: FlatNode[] = [];
  const styles: string[] = [];
  const walk = (list: Node[], parent: string | null) => {
    for (const n of list) {
      const line = formatStyleLine(n.id, n.style, n.widthPct);
      if (line) styles.push(line);
      if (n.type === "container") {
        const { children, style: _s, widthPct: _w, ...rest } = n;
        nodes.push({ ...rest, parentId: parent });
        walk(children, n.id);
      } else {
        const { style: _s, widthPct: _w, ...rest } = n;
        nodes.push({ ...rest, parentId: parent } as FlatNode);
      }
    }
  };
  walk(screen.children, null);
  return { nodes, styles };
}
