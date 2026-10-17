import {
  GenerateResponseSchema,
  TranscribeResponseSchema,
  type GenerateRequest,
  type GenerateResponse,
  type Screen,
} from "@create/shared";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export async function generate(
  prompt: string,
  screen: Screen | null,
  history: string[],
  selectedId: string | null = null,
): Promise<GenerateResponse> {
  const body: GenerateRequest = { prompt, screen, history: history.slice(-10), selectedId };
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `Generation failed (${res.status})`));
  return GenerateResponseSchema.parse(await res.json());
}

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `recording.${ext}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, `Transcription failed (${res.status})`));
  return TranscribeResponseSchema.parse(await res.json()).text;
}
