import "dotenv/config";
import express from "express";
import cors from "cors";
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
import { DEFAULT_MODEL } from "./ai/claude";

const LOCAL_ORIGINS = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string, path: string): boolean {
  if (LOCAL_ORIGINS.some((re) => re.test(origin))) return true;
  if (allowedOrigins().includes(origin)) return true;
  return origin.startsWith("chrome-extension://") && path.startsWith("/api/import-element");
}

export function createApp(): express.Express {
  const app = express();

  app.use(
    cors((req, cb) => {
      const origin = req.headers.origin;
      // No Origin header (same-origin, curl): cors adds nothing either way.
      cb(null, { origin: origin ? isAllowedOrigin(origin, req.originalUrl ?? req.url ?? "") : false });
    }),
  );
  // Routers that parse their own (larger) bodies mount before the global 3mb parser.
  app.use("/api", sketchRouter);
  app.use("/api", demoRouter);
  app.use("/api", shareRouter);
  app.use("/api", canvasOpsRouter); // own 10mb JSON parser
  app.use("/api", importElementRouter);
  app.use("/api", formsRouter); // own 64kb JSON parser
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
      hasPerceptron: Boolean(process.env.PERCEPTRON_API_KEY?.trim()),
      hasYoutube: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    });
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
