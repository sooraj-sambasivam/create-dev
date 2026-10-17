import { Router } from "express";
import { GenerateRequestSchema, mockGenerate } from "@create/shared";
import { GenerationError, generateWithClaude } from "../ai/claude";

export const generateRouter = Router();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

generateRouter.post("/generate", async (req, res) => {
  const parsed = GenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }

  if (process.env.MOCK_AI === "1") {
    await sleep(600);
    res.json(mockGenerate(parsed.data.prompt));
    return;
  }

  try {
    res.json(await generateWithClaude(parsed.data));
  } catch (err) {
    if (err instanceof GenerationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[generate] unexpected", err);
    res.status(500).json({ error: "Generation failed unexpectedly." });
  }
});
