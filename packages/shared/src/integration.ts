import { z } from "zod";
import { EffortSchema, ModelChoiceSchema, ScreenSchema } from "./schema";
import { ScreenOpSchema } from "./ops";

/**
 * Contracts for the canvas, narrate, share and voice features layered on the core builder.
 * Client (apps/web) and server (apps/server) both import these; change them only together.
 */

/** A tldraw shape reduced to what the model needs, in page coordinates. */
export const ShapeSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().max(2000).optional(),
  /** Library origin of a placed shape, e.g. { icon: "lucide:star" } or { photo: "<url>" }. */
  meta: z.record(z.string(), z.string().max(2000)).optional(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type ShapeSummary = z.infer<typeof ShapeSummarySchema>;

/** POST /api/generate-sketch: a drawing (PNG + shapes) becomes a Screen, or refines the current one. */
export const SketchRequestSchema = z.object({
  /** PNG data URL or bare base64 of the canvas or selection. */
  image: z.string().min(1).max(8_000_000),
  shapes: z.array(ShapeSummarySchema).max(500).default([]),
  prompt: z.string().max(4000).optional(),
  /** The current page, so the model iterates instead of starting over. */
  screen: ScreenSchema.nullish(),
});
export type SketchRequest = z.infer<typeof SketchRequestSchema>;
// Response: GenerateResponse ({ summary, screen }) from ./schema.

/** One recorded moment of a narration. `t` is ms since the session started. */
export const NarrationEventSchema = z.discriminatedUnion("kind", [
  z.object({ t: z.number(), kind: z.literal("speech"), text: z.string().max(4000), final: z.boolean() }),
  z.object({
    t: z.number(),
    kind: z.literal("lasso"),
    rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    /** Screen node ids (data-node-id) or tldraw shape ids under the lasso. */
    targets: z.array(z.object({ id: z.string(), label: z.string().max(200), kind: z.enum(["node", "shape"]) })).max(100),
  }),
  z.object({ t: z.number(), kind: z.literal("note"), text: z.string().max(4000) }),
]);
export type NarrationEvent = z.infer<typeof NarrationEventSchema>;

export const NarrationSessionSchema = z.object({
  id: z.string(),
  context: z.enum(["page", "canvas"]),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  events: z.array(NarrationEventSchema).max(2000),
  /** PNG data URLs (canvas exports), oldest first. */
  snapshots: z.array(z.string().max(4_000_000)).max(6).default([]),
});
export type NarrationSession = z.infer<typeof NarrationSessionSchema>;

/** POST /api/demo: a narration session becomes a full clickable page. Streams NDJSON DemoChunk lines. */
export const DemoRequestSchema = z.object({
  session: NarrationSessionSchema,
  screen: ScreenSchema.nullish(),
});
export type DemoRequest = z.infer<typeof DemoRequestSchema>;
export type DemoChunk =
  | { type: "step"; label: string; pct: number }
  | { type: "result"; summary: string; screen: z.infer<typeof ScreenSchema>; mock: boolean }
  | { type: "error"; message: string };

/** POST /api/route-intent: is a spoken line a command, and about which element? */
export const IntentRequestSchema = z.object({
  transcript: z.string().min(1).max(4000),
  candidates: z.array(z.object({ id: z.string(), label: z.string().max(200), kind: z.enum(["node", "shape"]) })).max(100),
  /** The element under the pointer when the utterance started, so "this"/"that"/"here" can resolve to it. */
  pointer: z.object({ targetId: z.string().nullable(), label: z.string().max(200).optional() }).optional(),
});
export type IntentRequest = z.infer<typeof IntentRequestSchema>;
export const INTENT_ACTIONS = ["restyle", "resize", "move", "delete", "add", "replace_text", "replace_media", "regenerate", "ask", "none"] as const;
export const IntentResultSchema = z.object({
  isCommand: z.boolean(),
  targetId: z.string().nullable(),
  action: z.enum(INTENT_ACTIONS),
  confidence: z.number(),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

/** GET /api/voice-token: ElevenLabs single-use realtime Scribe token, or a fallback signal. */
export type VoiceTokenResult =
  | { provider: "elevenlabs"; token: string; model: "scribe_v2_realtime"; expiresInSec: number }
  | { provider: "batch"; reason: string };

/** POST /api/prototypes saves a page; GET /api/prototypes/:id returns it. Viewer: /?p=<id>. */
export const SharePrototypeRequestSchema = z.object({
  screen: ScreenSchema,
  title: z.string().max(200).optional(),
});
export type SharePrototypeRequest = z.infer<typeof SharePrototypeRequestSchema>;
export type SharePrototypeResponse = { id: string; url: string };
export type SharedPrototype = { id: string; title: string; screen: z.infer<typeof ScreenSchema>; createdAt: string };

/** POST /api/canvas-ops: a drawn region (PNG + shapes + label) becomes typed edit ops on the current page. */
export const CanvasOpsRequestSchema = z.object({
  /** PNG data URL, at most 6MB. */
  image: z.string().min(1).max(6_000_000),
  label: z.string().max(500),
  /** Region of the page the drawing covers, in page units (page width 1200). */
  region: z.object({ y: z.number(), h: z.number(), x: z.number().optional(), w: z.number().optional() }),
  shapes: z.array(ShapeSummarySchema).max(200),
  screen: ScreenSchema.nullable(),
});
export type CanvasOpsRequest = z.infer<typeof CanvasOpsRequestSchema>;

export const CanvasOpsResponseSchema = z.object({
  summary: z.string(),
  ops: z.array(ScreenOpSchema),
  provider: z.enum(["perceptron+claude", "claude", "mock"]),
  sketchReading: z.string().optional(),
});
export type CanvasOpsResponse = z.infer<typeof CanvasOpsResponseSchema>;

/** A live data source an element can show, fetched by the server from a fixed allow-list. */
export const LiveSourceSchema = z.object({
  id: z.enum(["weather", "github-stars", "crypto-price", "hn-top", "time", "youtube-views"]),
  params: z.record(z.string(), z.string()),
});
export type LiveSource = z.infer<typeof LiveSourceSchema>;

export type LiveCatalog = { id: LiveSource["id"]; label: string; params: { name: string; example: string }[] }[];

/** POST /api/ask: Chat mode. Answers a question, optionally about the page or the pointed-at element; never edits. */
export const AskRequestSchema = z.object({
  question: z.string().min(1).max(4000),
  screen: ScreenSchema.nullish(),
  pointer: z
    .object({
      targetId: z.string().nullable(),
      label: z.string().max(200).optional(),
      /** PNG/JPEG data URL of the region around the pointer, at most 1.5MB, for visual questions. */
      image: z.string().max(1_500_000).optional(),
    })
    .optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20).default([]),
  model: ModelChoiceSchema.optional(),
  effort: EffortSchema.optional(),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;
export type AskResponse = { answer: string; provider: "claude" | "perceptron+claude" | "inkling" | "gemini" | "mock"; suggestCode?: boolean };

/** POST /api/forms/:appId stores a submission from a form on a user's page; GET lists them. */
export const FormSubmissionSchema = z.object({
  formId: z.string().max(200),
  fields: z.record(z.string().max(100), z.string().max(4000)),
});
export type FormSubmission = z.infer<typeof FormSubmissionSchema>;
export type StoredSubmission = FormSubmission & { id: string; appId: string; createdAt: string };

/** A pointed-at table, chart, list or schedule turned into typed data. Source of a "lift" into a live app. */
export const EntityColumnSchema = z.object({
  key: z.string().max(60),
  label: z.string().max(120),
  type: z.enum(["text", "number", "money", "date", "time", "percent"]),
});
export const EntitySchema = z.object({
  kind: z.enum(["table", "chart", "list", "schedule"]),
  title: z.string().max(200),
  columns: z.array(EntityColumnSchema).min(1).max(20),
  rows: z.array(z.record(z.string(), z.string().max(500))).max(500),
  source: z.object({ url: z.string().max(2000).optional(), title: z.string().max(300).optional() }).default({}),
});
export type Entity = z.infer<typeof EntitySchema>;

/** POST /api/lift: an entity (plus an optional spoken/typed instruction) becomes a live app; returns a share link. */
export const LiftRequestSchema = z.object({
  entity: EntitySchema,
  instruction: z.string().max(1000).optional(),
});
export type LiftRequest = z.infer<typeof LiftRequestSchema>;
export type LiftResponse = { id: string; url: string; formId: string; provider: "claude" | "mock" };

/** POST /api/extract: a pixel crop (chart or screenshot) becomes an entity, read by Perceptron or Claude vision. */
export const ExtractRequestSchema = z.object({
  image: z.string().min(1).max(4_000_000),
  hint: z.string().max(500).optional(),
});
export type ExtractResponse = { entity: Entity; provider: "perceptron" | "gemini" | "claude" | "mock" };
