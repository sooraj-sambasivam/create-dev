import { Router } from "express";
import { AskRequestSchema } from "@create/shared";
import { createRateLimiter } from "../middleware/rateLimit";
import { answerAsk } from "./ask";

/** POST /api/ask: Chat mode. Mount with app.use("/api", askRouter) after the global JSON parser (pointer images need up to ~2mb). */
export const askRouter = Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

askRouter.post("/ask", limiter, async (req, res) => {
  const parsed = AskRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }
  try {
    res.json(await answerAsk(parsed.data));
  } catch (err) {
    console.error("[ask] unexpected", err);
    res.status(500).json({ error: "Could not answer that." });
  }
});
