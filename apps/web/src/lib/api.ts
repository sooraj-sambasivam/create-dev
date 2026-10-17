import {
  EditNodeResponseSchema,
  GenerateResponseSchema,
  TranscribeResponseSchema,
  UploadResponseSchema,
  type Asset,
  type EditNodeRequest,
  type EditNodeResponse,
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

async function postJson<T>(url: string, body: unknown, parse: (data: unknown) => T, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `${fallback} (${res.status})`));
  return parse(await res.json());
}

export function generate(prompt: string, screen: Screen | null, history: string[], assets: Asset[]): Promise<GenerateResponse> {
  const body: GenerateRequest = { prompt, screen, history: history.slice(-10), assets };
  return postJson("/api/generate", body, (d) => GenerateResponseSchema.parse(d), "Generation failed");
}

/** Ask the model to change one element (and its children) only. */
export function editNode(screen: Screen, nodeId: string, prompt: string, assets: Asset[]): Promise<EditNodeResponse> {
  const body: EditNodeRequest = { screen, nodeId, prompt, assets };
  return postJson("/api/edit-node", body, (d) => EditNodeResponseSchema.parse(d), "Edit failed");
}

export async function uploadImage(file: File): Promise<Asset> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, `Upload failed (${res.status})`));
  return UploadResponseSchema.parse(await res.json());
}

export async function transcribe(audio: Blob): Promise<string> {
  const form = new FormData();
  const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `recording.${ext}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res, `Transcription failed (${res.status})`));
  return TranscribeResponseSchema.parse(await res.json()).text;
}
