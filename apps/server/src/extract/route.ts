import { Router } from "express";
import { ExtractRequestSchema, PixelBoxSchema, type StageTiming } from "@create/shared";
import { bigJson } from "../middleware/bodyLimit";
import { createRateLimiter } from "../middleware/rateLimit";
import { newTraceId, writeTrace } from "../pipeline/trace";
import { extractEntity } from "./extract";

/** `box` is where the client's crop sits in the screenshot (metadata; the client sends the cropped pixels). */
const RequestSchema = ExtractRequestSchema.extend({ box: PixelBoxSchema.optional() });

/** POST /api/extract { image, hint?, box? } -> { entity, provider, trace }. Mount with app.use("/api", extractRouter) before the global parser. */
export const extractRouter = Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

extractRouter.post("/extract", limiter, bigJson("That image is too large. Try a tighter crop."), async (req, res) => {
  const parsed = RequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }
  const { image, hint, box } = parsed.data;
  const stages: StageTiming[] = [];
  const startedAt = Date.now();
  try {
    const result = await extractEntity(image, hint, { box, onStage: (t) => stages.push(t) });
    const trace = {
      id: newTraceId(),
      startedAt,
      input: {
        source: "app" as const,
        hasImage: true,
        imageBytes: Math.floor((image.length * 3) / 4),
        hasAx: false,
        hasDom: false,
        ...(hint ? { hint: hint.slice(0, 120) } : {}),
      },
      stages,
    };
    await writeTrace(trace);
    res.json({ ...result, trace });
  } catch (err) {
    console.error("[extract] unexpected", err);
    res.status(500).json({ error: "Could not read that image." });
  }
});
