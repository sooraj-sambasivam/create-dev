import { z } from "zod";

/** Shared capture pipeline contract: capture -> locate -> read -> intent -> act. */

export const MAX_CAPTURE_IMAGE_CHARS = 12_000_000; // data URL length cap (~9 MB binary)
const Str = (n: number) => z.string().max(n);
const Px = z.number().finite().min(-100_000).max(100_000);

export const PixelBoxSchema = z.object({ x: Px, y: Px, w: Px.min(0), h: Px.min(0) });
export type PixelBox = z.infer<typeof PixelBoxSchema>;

export const CAPTURE_SOURCES = ["extension", "notch", "screen", "app"] as const;
export const CaptureSourceSchema = z.enum(CAPTURE_SOURCES);
export type CaptureSource = z.infer<typeof CaptureSourceSchema>;

export interface AxNode {
  role: string;
  title?: string;
  value?: string;
  frame: PixelBox;
  children?: AxNode[];
}
const AX_MAX_DEPTH = 3;
const AX_MAX_CHILDREN = 50;
const axLevel = (depth: number): z.ZodType<AxNode> =>
  z.object({
    role: Str(80),
    title: Str(500).optional(),
    value: Str(2000).optional(),
    frame: PixelBoxSchema,
    children: depth >= AX_MAX_DEPTH ? z.undefined().optional() : z.array(axLevel(depth + 1)).max(AX_MAX_CHILDREN).optional(),
  }) as z.ZodType<AxNode>;
/** Accessibility node; `children` is allowed up to depth 3 (root = depth 0). */
export const AxNodeSchema: z.ZodType<AxNode> = axLevel(0);

export const DomInfoSchema = z.object({
  tag: Str(40),
  text: Str(8000),
  rect: PixelBoxSchema,
  selectorPath: Str(1000),
  tableLike: z.boolean().optional(),
  snapshot: Str(60_000).optional(),
});
export type DomInfo = z.infer<typeof DomInfoSchema>;

export const CaptureInputSchema = z.object({
  source: CaptureSourceSchema,
  image: Str(MAX_CAPTURE_IMAGE_CHARS).regex(/^data:image\/[a-z0-9.+-]+;base64,/i).optional(),
  imageSize: z.object({ w: z.number().int().positive().max(20_000), h: z.number().int().positive().max(20_000) }).optional(),
  cursor: z.object({ x: Px, y: Px }).optional(),
  ax: AxNodeSchema.optional(),
  dom: DomInfoSchema.optional(),
  hint: Str(500).optional(),
  utterance: Str(1000).optional(),
});
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

export const LOCATE_KINDS = ["table", "chart", "list", "text", "image", "button", "other"] as const;
export const LocateKindSchema = z.enum(LOCATE_KINDS);
export type LocateKind = z.infer<typeof LocateKindSchema>;

export const LOCATE_SOURCES = ["ax", "dom", "perceptron", "jev", "gemini", "claude", "fused"] as const;
export const LocateSourceSchema = z.enum(LOCATE_SOURCES);
export type LocateSource = z.infer<typeof LocateSourceSchema>;

export interface LocateResult {
  box: PixelBox;
  kind: LocateKind;
  label: string;
  source: LocateSource;
  confidence: number;
  candidates?: LocateResult[];
}
const locateLevel = (nested: boolean): z.ZodType<LocateResult> =>
  z.object({
    box: PixelBoxSchema,
    kind: LocateKindSchema,
    label: Str(300),
    source: LocateSourceSchema,
    confidence: z.number().min(0).max(1),
    candidates: nested ? z.array(z.lazy(() => locateLevel(false))).max(10).optional() : z.undefined().optional(),
  }) as z.ZodType<LocateResult>;
/** Candidates are one level deep (a candidate cannot carry its own candidates). */
export const LocateResultSchema: z.ZodType<LocateResult> = locateLevel(true);

export const STAGES = ["capture", "locate", "read", "intent", "act"] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const StageTimingSchema = z.object({
  stage: StageSchema,
  provider: Str(80),
  ms: z.number().min(0).max(600_000),
  ok: z.boolean(),
  error: Str(500).optional(),
});
export type StageTiming = z.infer<typeof StageTimingSchema>;

export const STAGE_BUDGET_MS = { capture: 120, locate: 300, read: 1500, intent: 300, act: 800 } as const satisfies Record<Stage, number>;

/** Input summary for traces: never contains image bytes or keys. */
export const InputSummarySchema = z.object({
  source: CaptureSourceSchema,
  hasImage: z.boolean(),
  imageBytes: z.number().int().min(0).optional(),
  imageSize: z.object({ w: z.number(), h: z.number() }).optional(),
  cursor: z.object({ x: z.number(), y: z.number() }).optional(),
  hasAx: z.boolean(),
  hasDom: z.boolean(),
  hint: Str(120).optional(),
  utteranceChars: z.number().int().min(0).optional(),
});
export type InputSummary = z.infer<typeof InputSummarySchema>;

export const PipelineTraceSchema = z.object({
  id: Str(80),
  startedAt: z.number(),
  input: InputSummarySchema,
  stages: z.array(StageTimingSchema).max(100),
  result: LocateResultSchema.optional(),
});
export type PipelineTrace = z.infer<typeof PipelineTraceSchema>;

export const LocateRequestSchema = z.object({
  input: CaptureInputSchema,
  providers: z.array(Str(40)).max(10).optional(),
});
export type LocateRequest = z.infer<typeof LocateRequestSchema>;

export const LocateResponseSchema = z.object({
  result: LocateResultSchema.nullable(),
  trace: PipelineTraceSchema,
  /** "Which one?" prompt when ambiguous or no confident match: never a silent miss. */
  ask: Str(300).optional(),
});
export type LocateResponse = z.infer<typeof LocateResponseSchema>;

/** Build a trace input summary without image bytes. */
export function summarizeCaptureInput(i: CaptureInput): InputSummary {
  return {
    source: i.source,
    hasImage: !!i.image,
    imageBytes: i.image ? Math.floor((i.image.length * 3) / 4) : undefined,
    imageSize: i.imageSize,
    cursor: i.cursor,
    hasAx: !!i.ax,
    hasDom: !!i.dom,
    hint: i.hint?.slice(0, 120),
    utteranceChars: i.utterance?.length,
  };
}
