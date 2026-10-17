import { Router } from "express";
import type { VoiceTokenResult } from "@create/shared";
import { createRateLimiter } from "../middleware/rateLimit";

/** GET /api/voice-token: a short-lived ElevenLabs realtime Scribe token, or a fallback signal. */
export const voiceRouter = Router();

/** Each token mint costs an upstream call, so cap it per client IP. */
export const voiceTokenLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

const TOKEN_URL = "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe";
const TOKEN_TIMEOUT_MS = 8_000;
const EXPIRES_IN_SEC = 900;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Mint a single-use realtime token. The API key is only sent upstream and never returned.
 * Any failure becomes { provider: "batch" } so the client can use the recorded-audio path.
 */
export async function fetchVoiceToken(apiKey: string | undefined, fetchImpl: FetchLike = fetch): Promise<VoiceTokenResult> {
  if (!apiKey) return { provider: "batch", reason: "ELEVENLABS_API_KEY is not set. Using recorded transcription." };
  try {
    const upstream = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      return { provider: "batch", reason: `ElevenLabs token request failed (HTTP ${upstream.status}). Using recorded transcription.` };
    }
    const body = (await upstream.json().catch(() => null)) as { token?: unknown } | null;
    if (!body || typeof body.token !== "string" || body.token.length === 0) {
      return { provider: "batch", reason: "ElevenLabs returned no token. Using recorded transcription." };
    }
    return { provider: "elevenlabs", token: body.token, model: "scribe_v2_realtime", expiresInSec: EXPIRES_IN_SEC };
  } catch {
    return { provider: "batch", reason: "ElevenLabs token request failed. Using recorded transcription." };
  }
}

voiceRouter.get("/voice-token", voiceTokenLimiter, async (_req, res) => {
  const result = await fetchVoiceToken(process.env.ELEVENLABS_API_KEY);
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
});
