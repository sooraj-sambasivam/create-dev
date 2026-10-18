import express, { Router } from "express";
import { SketchRequestSchema } from "@create/shared";
import { GenerationError } from "../ai/claude";
import { buildMockSketchScreen, withVisionProviderSummary } from "../sketch/mock";
import { getVisionProvider, resolveVisionProviderId } from "../vision/registry";

export const sketchRouter = Router();

// The app-wide limit is 3mb; a canvas PNG is bigger, so raise it on this path only.
sketchRouter.use("/generate-sketch", express.json({ limit: "10mb" }));

sketchRouter.post("/generate-sketch", async (req, res) => {
  const parsed = SketchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }

  try {
    if (process.env.MOCK_AI === "1") {
      await new Promise((r) => setTimeout(r, process.env.NODE_ENV === "test" ? 0 : 500));
      const provider = resolveVisionProviderId();
      res.json(withVisionProviderSummary(buildMockSketchScreen(parsed.data.shapes, parsed.data.prompt), provider));
      return;
    }
    res.json(await getVisionProvider().generate(parsed.data));
  } catch (err) {
    if (err instanceof GenerationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[generate-sketch] unexpected", err);
    res.status(500).json({ error: "Sketch generation failed unexpectedly." });
  }
});
