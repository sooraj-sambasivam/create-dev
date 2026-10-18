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
import { DEFAULT_MODEL } from "./ai/claude";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
// Routers that parse their own (larger) bodies mount before the global 3mb parser.
app.use("/api", sketchRouter);
app.use("/api", demoRouter);
app.use("/api", shareRouter);
app.use(express.json({ limit: "3mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mock: process.env.MOCK_AI === "1",
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    hasPerceptron: Boolean(process.env.PERCEPTRON_API_KEY?.trim()),
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY?.trim()),
    hasGrok: Boolean(process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim()),
    hasElevenLabs: Boolean(process.env.ELEVENLABS_API_KEY),
    hasTypesafe: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
    hasMongo: Boolean(process.env.MONGODB_URI?.trim()),
  });
});
app.use("/api", generateRouter);
app.use("/api", transcribeRouter);
app.use("/api", imageRouter);
app.use("/api", assetsRouter);
app.use("/api", voiceRouter);
app.use("/api", intentRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  const status =
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : message.includes("File too large")
        ? 413
        : 500;
  if (status >= 500) console.error("[server]", err);
  res.status(status).json({ error: status === 404 ? "Not found." : message });
});

app.listen(port, () => {
  console.log(`[server] http://localhost:${port}  mock=${process.env.MOCK_AI === "1"}`);
});
