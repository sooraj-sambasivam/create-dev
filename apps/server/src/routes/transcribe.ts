import { Router } from "express";
import multer from "multer";
import type { TranscribeResponse } from "@create/shared";

export const transcribeRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text";

transcribeRouter.post("/transcribe", upload.single("audio"), async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "ELEVENLABS_API_KEY is not set. Type your prompt instead." });
    return;
  }
  const file = req.file;
  if (!file || file.size === 0) {
    res.status(400).json({ error: "No audio received. Send a multipart field named 'audio'." });
    return;
  }

  const form = new FormData();
  const ext = file.mimetype.includes("ogg") ? "ogg" : file.mimetype.includes("mp4") ? "m4a" : file.mimetype.includes("wav") ? "wav" : "webm";
  form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), `audio.${ext}`);
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");

  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(ELEVENLABS_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("[transcribe] network", err);
    res.status(502).json({ error: "Could not reach ElevenLabs." });
    return;
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("[transcribe] upstream", upstream.status, detail.slice(0, 300));
    res.status(502).json({ error: `ElevenLabs error ${upstream.status}.` });
    return;
  }

  let data: { text?: unknown };
  try {
    data = (await upstream.json()) as { text?: unknown };
  } catch {
    console.error("[transcribe] upstream returned non-JSON");
    res.status(502).json({ error: "ElevenLabs returned invalid data." });
    return;
  }
  const text = typeof data.text === "string" ? data.text.trim() : "";
  console.log(`[transcribe] ${Date.now() - started}ms ${file.size}B -> "${text.slice(0, 60)}"`);
  const body: TranscribeResponse = { text };
  res.json(body);
});
