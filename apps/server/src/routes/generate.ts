import { Router, type Response } from "express";
import { EditNodeRequestSchema, GenerateRequestSchema, findNode, mockGenerate } from "@create/shared";
import { GenerationError, editNodeWithClaude, generateWithClaude } from "../ai/claude";

export const generateRouter = Router();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sendError(res: Response, err: unknown, label: string) {
  if (err instanceof GenerationError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(`[${label}] unexpected`, err);
  res.status(500).json({ error: "Generation failed unexpectedly." });
}

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
    sendError(res, err, "generate");
  }
});

generateRouter.post("/edit-node", async (req, res) => {
  const parsed = EditNodeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid request: ${parsed.error.issues[0]?.message ?? "bad body"}` });
    return;
  }

  if (process.env.MOCK_AI === "1") {
    await sleep(400);
    const node = findNode(parsed.data.screen, parsed.data.nodeId);
    res.json({ summary: "Mock mode: element left unchanged.", nodes: node ? [node] : [] });
    return;
  }

  try {
    res.json(await editNodeWithClaude(parsed.data));
  } catch (err) {
    sendError(res, err, "edit-node");
  }
});
