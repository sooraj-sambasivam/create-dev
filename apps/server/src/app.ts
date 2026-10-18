import "dotenv/config";
import express from "express";
import cors from "cors";
import { listModels } from "./providers/models";
import { generateRouter } from "./routes/generate";
import { transcribeRouter } from "./routes/transcribe";
import { imageRouter } from "./routes/image";
import { assetsRouter } from "./routes/assets";
import { sketchRouter } from "./routes/sketch";
import { demoRouter } from "./routes/demo";
import { voiceRouter } from "./routes/voice";
import { intentRouter } from "./routes/intent";
import { shareRouter } from "./routes/share";
import { canvasOpsRouter } from "./routes/canvasOps";
import { liveRouter } from "./routes/live";
import { importElementRouter } from "./importElement/route";
import { askRouter } from "./ask/route";
import { formsRouter } from "./forms/route";
import { liftRouter } from "./lift/route";
import { extractRouter } from "./extract/route";
import { locateRouter } from "./pipeline/route";
import { trayRouter } from "./tray/route";
import { DEFAULT_MODEL } from "./ai/claude";
import { allowedOrigins, isAllowedOrigin } from "./middleware/origins";
import { createRateLimiter } from "./middleware/rateLimit";

/** Per-IP requests per minute on routes that spend vendor money. Each limiter is its own bucket. */
export const COST_LIMITS: Record<string, number> = {
  "/generate": 20,
  "/generate-sketch": 20,
  "/canvas-ops": 30,
  "/demo": 10,
  "/transcribe": 30,
  "/route-intent": 120,
  "/edit-node": 40,
  "/upload": 30,
};

export { allowedOrigins, isAllowedOrigin };

export function createApp(): express.Express {
  const app = express();
  // Behind Vercel's proxy req.ip would be the proxy; trust one hop so the limiter keys on the client.
  if (process.env.VERCEL) app.set("trust proxy", 1);

  app.use(
    cors((req, cb) => {
      const origin = req.headers.origin;
      // No Origin header (same-origin, curl): cors adds nothing either way.
      cb(null, { origin: origin ? isAllowedOrigin(origin, req.originalUrl ?? req.url ?? "") : false, exposedHeaders: ["x-model-fallback"] });
    }),
  );
  // Cost routes: limit before any body parsing so refused requests stay cheap.
  for (const [path, max] of Object.entries(COST_LIMITS)) {
    app.post(`/api${path}`, createRateLimiter({ windowMs: 60_000, max }));
  }
  // Routers that parse their own (larger) bodies mount before the global 3mb parser.
  app.use("/api", sketchRouter);
  app.use("/api", demoRouter);
  app.use("/api", shareRouter);
  app.use("/api", canvasOpsRouter); // own 10mb JSON parser
  app.use("/api", importElementRouter);
  app.use("/api", formsRouter); // own 64kb JSON parser
app.use("/api", liftRouter); // own 1mb JSON parser
app.use("/api", extractRouter); // own big JSON parser
  app.use("/api", locateRouter); // own big JSON parser
  app.use("/api", trayRouter); // own 8kb JSON parser
  app.use(express.json({ limit: "3mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      mock: process.env.MOCK_AI === "1",
      model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
      hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      hasElevenLabs: Boolean(process.env.ELEVENLABS_API_KEY),
      hasTypesafe: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
      hasMongo: Boolean(process.env.MONGODB_URI?.trim()),
      hasOpenRouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      hasTinker: Boolean(process.env.TINKER_API_KEY?.trim()),
      hasGemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      hasPerceptron: Boolean(process.env.PERCEPTRON_API_KEY?.trim()),
      hasYoutube: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    });
  });
  app.get("/api/models", (_req, res) => {
    res.json(listModels());
  });
  app.use("/api", generateRouter);
  app.use("/api", transcribeRouter);
  app.use("/api", imageRouter);
  app.use("/api", assetsRouter);
  app.use("/api", voiceRouter);
  app.use("/api", intentRouter);
  app.use("/api", liveRouter);
  app.use("/api", askRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    const raw = (err as { status?: unknown }).status;
    const isMulter = (err as { name?: unknown } | null)?.name === "MulterError";
    const status = isMulter
      ? message.includes("File too large") ? 413 : 400
      : typeof raw === "number" && raw >= 400 && raw < 600
        ? raw
        : message.includes("File too large")
          ? 413
          : 500;
    if (status >= 500) console.error("[server]", err);
    // Never echo raw messages for server errors; 4xx messages (bad JSON, too large, multer) are safe to show.
    res.status(status).json({ error: status === 404 ? "Not found." : status >= 500 ? "Something went wrong on the server." : message });
  });

  return app;
}
