import { Router, type Response } from "express";
import {
  EditNodeRequestSchema,
  GenerateRequestSchema,
  findNode,
  mockGenerate,
  type GenerateRequest,
  type GenerateResponse,
  type Screen,
} from "@create/shared";
import { GenerationError, editNodeWithFallback, generateWithClaude } from "../ai/claude";

export const generateRouter = Router();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Delay between mock sections when streaming (a little jitter makes the demo feel real). */
export const MOCK_STREAM_DELAY_MS = { min: 150, max: 300 };

/** MOCK_AI streaming: the mock page's top-level sections, one at a time, then done. */
async function mockStream(
  req: GenerateRequest,
  emit: (screen: Screen) => void,
  aborted: () => boolean,
): Promise<GenerateResponse> {
  const result = mockGenerate(req.prompt);
  const { children } = result.screen;
  if (!req.screen) {
    for (let i = 1; i < children.length; i++) {
      const { min, max } = MOCK_STREAM_DELAY_MS;
      await sleep(min + Math.random() * (max - min));
      if (aborted()) break;
      emit({ ...result.screen, children: children.slice(0, i) });
    }
  } else {
    await sleep(MOCK_STREAM_DELAY_MS.max);
  }
  return result;
}

/** Answer a stream:true request with NDJSON frames. Errors before the first frame stay JSON. */
async function streamGenerate(req: GenerateRequest, res: Response): Promise<void> {
  const abort = new AbortController();
  // `res` closing before we finished means the client went away: stop the model call.
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });
  let started = false;
  const send = (frame: unknown) => {
    if (abort.signal.aborted || res.writableEnded || res.destroyed) return;
    if (!started) {
      started = true;
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
    }
    res.write(`${JSON.stringify(frame)}\n`);
  };

  try {
    const onPartial = (screen: Screen) => send({ type: "partial", screen });
    const result =
      process.env.MOCK_AI === "1"
        ? await mockStream(req, onPartial, () => abort.signal.aborted)
        : await generateWithClaude(req, { onPartial, signal: abort.signal });
    send({ type: "done", summary: result.summary, screen: result.screen });
  } catch (err) {
    if (abort.signal.aborted) return void res.end();
    if (!started) return sendError(res, err, "generate");
    const message = err instanceof GenerationError ? err.message : "Generation failed unexpectedly.";
    if (!(err instanceof GenerationError)) console.error("[generate] unexpected", err);
    send({ type: "error", message });
  }
  res.end();
}

function sendError(res: Response, err: unknown, label: string) {
  const status = (err as { status?: unknown })?.status;
  if (!(err instanceof GenerationError) && status === 404 && err instanceof Error) {
    res.status(404).json({ error: err.message });
    return;
  }
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

  if (parsed.data.stream) {
    await streamGenerate(parsed.data, res);
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

  try {
    if (process.env.MOCK_AI === "1") await sleep(400);
    res.json(await editNodeWithFallback(parsed.data));
  } catch (err) {
    sendError(res, err, "edit-node");
  }
});
