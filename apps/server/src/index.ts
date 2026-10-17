import "dotenv/config";
import express from "express";
import cors from "cors";
import { generateRouter } from "./routes/generate";
import { transcribeRouter } from "./routes/transcribe";
import { DEFAULT_MODEL } from "./ai/claude";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mock: process.env.MOCK_AI === "1",
    model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    hasAnthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    hasElevenLabs: Boolean(process.env.ELEVENLABS_API_KEY),
  });
});
app.use("/api", generateRouter);
app.use("/api", transcribeRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(message.includes("File too large") ? 413 : 500).json({ error: message });
});

app.listen(port, () => {
  console.log(`[server] http://localhost:${port}  mock=${process.env.MOCK_AI === "1"}`);
});
