import { Router, type ErrorRequestHandler } from "express";
import { bigJson } from "../middleware/bodyLimit";
import { CanvasOpsRequestSchema } from "@create/shared";
import { GenerationError } from "../ai/claude";
import { runCanvasOps } from "../canvasOps/pipeline";

export const canvasOpsRouter = Router();

// The app-wide limit is 3mb; a canvas PNG is bigger, so raise it on this path only.
canvasOpsRouter.use("/canvas-ops", bigJson("The drawing is too large. Select a smaller area."));

canvasOpsRouter.post("/canvas-ops", async (req, res) => {
  const parsed = CanvasOpsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({ error: `Invalid request: ${issue ? `${issue.path.join(".")} ${issue.message}`.trim() : "bad body"}` });
    return;
  }
  try {
    res.json(await runCanvasOps(parsed.data));
  } catch (err) {
    if (err instanceof GenerationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[canvas-ops] unexpected", err);
    res.status(500).json({ error: "Canvas edit failed unexpectedly." });
  }
});

const bodyErrors: ErrorRequestHandler = (err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "The drawing is too large. Select a smaller area." });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid request: body is not valid JSON." });
    return;
  }
  next(err);
};
canvasOpsRouter.use(bodyErrors);
