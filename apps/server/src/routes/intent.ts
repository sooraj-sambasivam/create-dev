import { Router } from "express";
import { IntentRequestSchema } from "@create/shared";
import { routeIntentWithEngine } from "../intent/intent";

/** POST /api/route-intent: is a spoken line a command, and which candidate does it target? */
export const intentRouter = Router();

intentRouter.post("/route-intent", async (req, res) => {
  const parsed = IntentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }
  try {
    const { result, engine } = await routeIntentWithEngine(parsed.data);
    res.setHeader("x-intent-engine", engine);
    res.json(result);
  } catch (err) {
    console.error("[route-intent] unexpected", err);
    res.status(500).json({ error: "Intent routing failed unexpectedly." });
  }
});
