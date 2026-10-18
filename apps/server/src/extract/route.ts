import { Router } from "express";
import { ExtractRequestSchema } from "@create/shared";
import { bigJson } from "../middleware/bodyLimit";
import { createRateLimiter } from "../middleware/rateLimit";
import { extractEntity } from "./extract";

/** POST /api/extract { image, hint? } -> { entity, provider }. Mount with app.use("/api", extractRouter) before the global parser. */
export const extractRouter = Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

extractRouter.post("/extract", limiter, bigJson("That image is too large. Try a tighter crop."), async (req, res) => {
  const parsed = ExtractRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }
  try {
    res.json(await extractEntity(parsed.data.image, parsed.data.hint));
  } catch (err) {
    console.error("[extract] unexpected", err);
    res.status(500).json({ error: "Could not read that image." });
  }
});
