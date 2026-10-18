import { z } from "zod";

/**
 * The page tree every input mode (text, voice, canvas, narrate) produces and the renderer draws.
 *
 * The model returns this tree directly as the input of a tool call (see apps/server/src/ai),
 * so there is no structured-output grammar limit: new element types and props can be added
 * here freely. Most props have defaults so the model (or a hand-written tree) can omit them;
 * the server validates with these schemas and asks the model to repair anything invalid.
 */

const id = z.string().min(1).describe("Unique short kebab-case id, e.g. 'hero-title'. Links can target it with href '#id'.");

// ---- shared value types ----

/** Where a button or link goes: a section on the page ('#pricing'), a website, email or phone. */
export const HrefSchema = z
  .string()
  .regex(/^(#[\w-]+|https?:\/\/\S+|mailto:\S+|tel:[+\d\s()-]+)$/i, "href must be #section-id, https://…, mailto: or tel:")
  .describe("'#node-id' to scroll to a section, 'https://…' for another site, 'mailto:…' or 'tel:…'");

/** An Iconify icon name, 'set:icon'. The server corrects names that don't exist. */
export const IconNameSchema = z
  .string()
  .regex(/^[a-z0-9-]+:[a-z0-9-]+$/i, "icon must look like 'set:name', e.g. 'lucide:shopping-cart'")
  .describe("Iconify icon 'set:name', e.g. 'lucide:shopping-cart' (line), 'fluent-emoji-flat:shopping-cart' (cartoon)");

/** A user-uploaded file ('/api/uploads/…') or a full https URL. */
export const SrcSchema = z
  .string()
  .regex(/^(\/api\/uploads\/[\w.-]+|https:\/\/\S+)$/, "src must be an uploaded asset url or https URL")
  .describe("Use an uploaded asset url from <assets> when the user refers to their own logo or photo");

const Color = z.string().regex(/^#[0-9a-f]{3,8}$/i, "colors are hex like #16a34a");

/** Per-element visual overrides. Everything is optional; omit what you don't need. */
export const StyleSchema = z.object({
  color: Color.nullish().describe("Text (or icon) color"),
  background: Color.nullish(),
  gradientTo: Color.nullish().describe("With background, makes a diagonal gradient from background to this color"),
  radius: z.enum(["none", "sm", "md", "lg", "full"]).nullish(),
  shadow: z.enum(["none", "sm", "md", "lg"]).nullish(),
  border: z.boolean().nullish().describe("Thin outline in the theme's border color"),
  fontSize: z.enum(["sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"]).nullish(),
  weight: z.enum(["normal", "medium", "semibold", "bold", "black"]).nullish(),
  align: z.enum(["left", "center", "right"]).nullish().describe("Text alignment"),
  italic: z.boolean().nullish(),
  filter: z
    .enum(["none", "grayscale", "sepia"])
    .nullish()
    .describe("Photo or icon effect; grayscale turns colorful (cartoon) icons and photos grey"),
});
export type Style = z.infer<typeof StyleSchema>;

const common = {
  id,
  style: StyleSchema.nullish(),
  widthPct: z.number().min(5).max(100).nullish().describe("Width as percent of the parent; omit for automatic"),
};

// ---- elements ----

export const HeadingSchema = z.object({
  ...common,
  type: z.literal("heading"),
  text: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
});

export const TextSchema = z.object({
  ...common,
  type: z.literal("text"),
  text: z.string(),
  tone: z.enum(["default", "muted"]).default("default"),
});

export const ButtonSchema = z.object({
  ...common,
  type: z.literal("button"),
  label: z.string().describe("Can be empty for an icon-only button"),
  variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
  icon: IconNameSchema.nullish().describe("Icon shown before the label"),
  href: HrefSchema.nullish(),
});

export const LinkSchema = z.object({
  ...common,
  type: z.literal("link"),
  text: z.string().describe("Can be empty for an icon-only link, e.g. a social icon"),
  icon: IconNameSchema.nullish(),
  href: HrefSchema.nullish(),
});

export const IconSchema = z.object({
  ...common,
  type: z.literal("icon"),
  name: IconNameSchema,
  size: z.enum(["sm", "md", "lg", "xl", "2xl"]).default("md"),
});

export const ImageSchema = z.object({
  ...common,
  type: z.literal("image"),
  alt: z.string().describe("Describes the picture in a sentence"),
  query: z.string().nullish().describe("2-4 concrete words for a stock photo search, e.g. 'latte art closeup'"),
  src: SrcSchema.nullish(),
  aspect: z.enum(["video", "square", "wide", "portrait"]).default("video"),
  size: z
    .enum(["logo", "small", "medium", "full"])
    .default("full")
    .describe("full fills its column; logo (40px tall), small (96px) and medium (200px) keep the whole picture uncropped, for logos and badges"),
});

export const AvatarSchema = z.object({
  ...common,
  type: z.literal("avatar"),
  name: z.string().describe("Person's name; initials are shown when there is no photo"),
  query: z.string().nullish().describe("Photo search, e.g. 'smiling woman portrait'"),
  src: SrcSchema.nullish(),
  size: z.enum(["sm", "md", "lg"]).default("md"),
});

export const BadgeSchema = z.object({
  ...common,
  type: z.literal("badge"),
  text: z.string().describe("Short label like 'New', 'Most popular', '20% off'"),
});

export const ListSchema = z.object({
  ...common,
  type: z.literal("list"),
  items: z.array(z.string()),
  marker: z.enum(["bullet", "check", "number", "none"]).default("bullet"),
});

export const RatingSchema = z.object({
  ...common,
  type: z.literal("rating"),
  value: z.number().min(0).max(5).describe("Stars out of 5, e.g. 4.8"),
  label: z.string().nullish().describe("e.g. '1,240 reviews'"),
});

export const TableSchema = z.object({
  ...common,
  type: z.literal("table"),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())).describe("Each row has one cell per column"),
});

export const AccordionSchema = z.object({
  ...common,
  type: z.literal("accordion"),
  items: z.array(z.object({ question: z.string(), answer: z.string() })).describe("FAQ-style expandable rows"),
});

export const VideoSchema = z.object({
  ...common,
  type: z.literal("video"),
  url: z.string().describe("A YouTube or Vimeo link; leave empty for a placeholder the user can fill in"),
  aspect: z.enum(["video", "square"]).default("video"),
});

export const MapSchema = z.object({
  ...common,
  type: z.literal("map"),
  address: z.string().describe("Street address or place name shown on an embedded map"),
});

export const TextboxSchema = z.object({
  ...common,
  type: z.literal("textbox"),
  label: z.string().default(""),
  placeholder: z.string().default(""),
  multiline: z.boolean().default(false),
});

export const CheckboxSchema = z.object({
  ...common,
  type: z.literal("checkbox"),
  label: z.string(),
});

export const SelectSchema = z.object({
  ...common,
  type: z.literal("select"),
  label: z.string().default(""),
  options: z.array(z.string()),
});

export const DividerSchema = z.object({
  ...common,
  type: z.literal("divider"),
});

export const SpacerSchema = z.object({
  ...common,
  type: z.literal("spacer"),
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
});

// Fields are written out here instead of spread from a shared object: TypeScript can only infer
// the recursive type when the object literal containing the getter is explicit.
export const ContainerSchema = z.object({
  id,
  style: StyleSchema.nullish(),
  widthPct: z.number().min(5).max(100).nullish(),
  type: z.literal("container"),
  direction: z.enum(["row", "column"]).default("column"),
  gap: z.enum(["none", "sm", "md", "lg"]).default("md"),
  align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
  justify: z.enum(["start", "center", "end", "between"]).default("start"),
  padding: z.enum(["none", "sm", "md", "lg", "xl"]).default("none"),
  background: z.enum(["none", "surface", "accent", "muted"]).default("none"),
  width: z.enum(["full", "auto", "half", "third", "quarter"]).default("full"),
  wrap: z.boolean().default(false).describe("Let a row wrap onto several lines (e.g. many cards or logos)"),
  bgQuery: z.string().nullish().describe("Background photo search; text on top stays readable via overlay"),
  bgSrc: SrcSchema.nullish(),
  overlay: z.enum(["none", "light", "dark"]).default("dark").describe("Tint over a background photo"),
  get children() {
    return z.array(NodeSchema);
  },
});

export const NodeSchema = z.discriminatedUnion("type", [
  HeadingSchema,
  TextSchema,
  ButtonSchema,
  LinkSchema,
  IconSchema,
  ImageSchema,
  AvatarSchema,
  BadgeSchema,
  ListSchema,
  RatingSchema,
  TableSchema,
  AccordionSchema,
  VideoSchema,
  MapSchema,
  TextboxSchema,
  CheckboxSchema,
  SelectSchema,
  DividerSchema,
  SpacerSchema,
  ContainerSchema,
]);

export const FONTS = ["sans", "serif", "display", "rounded", "mono", "handwritten"] as const;

export const ScreenSchema = z.object({
  title: z.string().describe("Short page title"),
  theme: z.enum(["light", "dark"]).default("light"),
  accent: Color.nullish().describe("Brand color used for primary buttons, links and accent sections"),
  font: z
    .enum(FONTS)
    .default("sans")
    .describe("sans = modern, serif = elegant/editorial, display = bold/techy, rounded = friendly, mono = developer, handwritten = playful"),
  children: z.array(NodeSchema),
});

export const GenerateResponseSchema = z.object({
  summary: z
    .string()
    .describe("One or two sentences for the user: what you built or changed, and anything you could not do"),
  screen: ScreenSchema,
});

// ---- requests ----

export const AssetSchema = z.object({
  url: SrcSchema,
  name: z.string().max(200),
});

export const GenerateRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  screen: ScreenSchema.nullable().optional(),
  history: z.array(z.string().max(4000)).max(20).optional(),
  /** Files the user uploaded; the model may place them by url. */
  assets: z.array(AssetSchema).max(50).optional(),
  /** Respond with NDJSON frames ({type:"partial"|"done"|"error"}) instead of one JSON body. */
  stream: z.boolean().optional(),
});

/** Edit one element (and its children) instead of regenerating the whole page. */
export const EditNodeRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  screen: ScreenSchema,
  nodeId: z.string().min(1).max(200),
  assets: z.array(AssetSchema).max(50).optional(),
});

export const EditNodeResponseSchema = z.object({
  summary: z.string(),
  /** Nodes that replace the target, in order. Empty means the target was removed. */
  nodes: z.array(NodeSchema),
});

export const TranscribeResponseSchema = z.object({ text: z.string() });
export const UploadResponseSchema = AssetSchema;
export const ApiErrorSchema = z.object({ error: z.string() });

// ---- types ----

export type Heading = z.infer<typeof HeadingSchema>;
export type TextNode = z.infer<typeof TextSchema>;
export type Button = z.infer<typeof ButtonSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Icon = z.infer<typeof IconSchema>;
export type Image = z.infer<typeof ImageSchema>;
export type Avatar = z.infer<typeof AvatarSchema>;
export type Container = z.infer<typeof ContainerSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type NodeType = Node["type"];
export type Leaf = Exclude<Node, Container>;
export type Screen = z.infer<typeof ScreenSchema>;
export type Font = Screen["font"];
export type Asset = z.infer<typeof AssetSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type EditNodeRequest = z.infer<typeof EditNodeRequestSchema>;
export type EditNodeResponse = z.infer<typeof EditNodeResponseSchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const NODE_TYPES = NodeSchema.options.map((o) => o.shape.type.value);

/** Fields that hold free text, per type; used for inline editing and for the editor UI. */
export const TEXT_FIELD: Partial<Record<NodeType, string>> = {
  heading: "text",
  text: "text",
  button: "label",
  link: "text",
  badge: "text",
  checkbox: "label",
  textbox: "label",
  select: "label",
};
