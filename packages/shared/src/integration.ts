import { z } from "zod";
import { ScreenSchema } from "./schema";

/**
 * Contracts for the canvas, narrate, share and voice features layered on the core builder.
 * Client (apps/web) and server (apps/server) both import these; change them only together.
 */

/** A tldraw shape reduced to what the model needs, in page coordinates. */
export const ShapeSummarySchema = z.object({
  id: z.string(),
  type: z.string(),
  text: z.string().max(2000).optional(),
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
});
export type IntentRequest = z.infer<typeof IntentRequestSchema>;
export const IntentResultSchema = z.object({
  isCommand: z.boolean(),
  targetId: z.string().nullable(),
  action: z.enum(["restyle", "move", "delete", "add", "replace_text", "regenerate", "none"]),
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
