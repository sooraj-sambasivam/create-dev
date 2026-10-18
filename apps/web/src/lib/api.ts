import {
  EditNodeResponseSchema,
  GenerateResponseSchema,
  ScreenSchema,
  TranscribeResponseSchema,
  UploadResponseSchema,
  type AskRequest,
  type AskResponse,
  type Asset,
  type ExtractResponse,
  type LiftResponse,
  type ModelChoice,
  type EditNodeRequest,
  type EditNodeResponse,
  type GenerateRequest,
  type FormSubmission,
  type GenerateResponse,
  type Screen,
  type StoredSubmission,
} from "@create/shared";

import { currentRequestPrefs } from "../store/composerPrefs";
import { handleAuthFailure } from "../auth/limits";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; bucket?: string; resetAt?: string; code?: string };
    return handleAuthFailure(res.status, data) ?? (data.error || fallback);
  } catch {
    return fallback;
  }
}

async function postJson<T>(url: string, body: unknown, parse: (data: unknown) => T, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `${fallback} (${res.status})`));
  return parse(await res.json());
}

export function generate(prompt: string, screen: Screen | null, history: string[], assets: Asset[]): Promise<GenerateResponse> {
  const body: GenerateRequest = { prompt, screen, history: history.slice(-10), assets, ...currentRequestPrefs() };
  return postJson("/api/generate", body, (d) => GenerateResponseSchema.parse(d), "Generation failed");
}

/** Ask the model to change one element (and its children) only. */
export function editNode(screen: Screen, nodeId: string, prompt: string, assets: Asset[]): Promise<EditNodeResponse> {
  const body: EditNodeRequest = { screen, nodeId, prompt, assets, ...currentRequestPrefs() };
  return postJson("/api/edit-node", body, (d) => EditNodeResponseSchema.parse(d), "Edit failed");
}

/** Chat mode: answer a question about the page or the pointed-at element. Never edits. */
export function ask(req: Pick<AskRequest, "question" | "screen" | "pointer" | "history">): Promise<AskResponse> {
  return postJson("/api/ask", { ...currentRequestPrefs(), ...req }, parseAskResponse, "Couldn't answer");
}

export function parseAskResponse(data: unknown): AskResponse {
  const d = (data ?? {}) as Partial<AskResponse>;
  if (typeof d.answer !== "string" || !d.answer.trim()) throw new Error("The answer came back empty.");
  const provider = d.provider === "claude" || d.provider === "perceptron+claude" || d.provider === "inkling" || d.provider === "gemini" ? d.provider : "mock";
  return { answer: d.answer, provider, ...(d.suggestCode ? { suggestCode: true } : {}) };
}

/** Store a submission from a form on a user's page. */
export function submitForm(appId: string, submission: FormSubmission): Promise<StoredSubmission> {
  return postJson(`/api/forms/${encodeURIComponent(appId)}`, submission, (d) => d as StoredSubmission, "Couldn't submit the form");
}

/** Submissions a user's page has collected (the Backend tab's data view). */
export async function listSubmissions(appId: string): Promise<StoredSubmission[]> {
  const tokenRes = await fetch(`/api/forms/${encodeURIComponent(appId)}/token`, { method: "POST" });
  if (!tokenRes.ok) throw new Error(await readError(tokenRes, `Couldn't load submissions (${tokenRes.status})`));
  const { token } = (await tokenRes.json()) as { token?: string };
  const res = await fetch(`/api/forms/${encodeURIComponent(appId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await readError(res, `Couldn't load submissions (${res.status})`));
  const data = (await res.json()) as unknown;
  const rows = Array.isArray(data) ? data : (data as { submissions?: unknown })?.submissions;
  return Array.isArray(rows) ? (rows as StoredSubmission[]) : [];
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

// ---- streaming generation (NDJSON) ----

/**
 * Read a byte stream as newline-delimited text and call `onLine` for each non-empty line.
 * Handles lines (and multi-byte characters) split across chunks, CRLF, and a last line
 * without a trailing newline.
 */
export async function readNdjsonLines(body: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (final: boolean) => {
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onLine(line);
    }
    if (final) {
      const rest = buffer.trim();
      buffer = "";
      if (rest) onLine(rest);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flush(false);
  }
  buffer += decoder.decode();
  flush(true);
}

/**
 * Generate a page while streaming. `onPartial` receives the page as each section finishes;
 * resolves with the final response (the `done` frame). Rejects on an `error` frame, a dropped
 * connection, or abort. If the server (or a replayed recording) answers with plain JSON
 * instead of NDJSON, that is treated as an immediate `done`.
 */
export async function generateStream(
  req: GenerateRequest,
  onPartial: (screen: Screen) => void,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  const res = await fetch("/api/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...currentRequestPrefs(), ...req, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, `Generation failed (${res.status})`));
  if (!/ndjson/i.test(res.headers.get("content-type") ?? "") || !res.body) {
    return GenerateResponseSchema.parse(await res.json());
  }

  let result: GenerateResponse | null = null;
  await readNdjsonLines(res.body, (line) => {
    let frame: { type?: string; screen?: unknown; summary?: unknown; message?: unknown };
    try {
      frame = JSON.parse(line);
    } catch {
      return; // ignore a garbled line rather than failing the whole page
    }
    if (frame.type === "partial") {
      const screen = ScreenSchema.safeParse(frame.screen);
      if (screen.success && !result) onPartial(screen.data);
    } else if (frame.type === "done") {
      result = GenerateResponseSchema.parse({ summary: frame.summary, screen: frame.screen });
    } else if (frame.type === "error") {
      throw new Error(typeof frame.message === "string" && frame.message ? frame.message : "Generation failed.");
    }
  });
  if (!result) throw new Error("The connection closed before the page finished. Try again.");
  return result;
}

// ---- composer: models, health, lift from screen ----

export interface ModelInfo {
  id: ModelChoice;
  label: string;
  available: boolean;
}

export interface Health {
  mock?: boolean;
  hasAnthropic?: boolean;
  hasTypesafe?: boolean;
  hasMongo?: boolean;
  hasPerceptron?: boolean;
  hasGemini?: boolean;
  hasInkling?: boolean;
  hasTinker?: boolean;
  hasOpenRouter?: boolean;
}

const MODEL_IDS: readonly string[] = ["sonnet", "haiku", "inkling", "gemini"];

/** Accepts `{models:[...]}` or a bare array; drops rows that are not a known model id. */
export function parseModels(data: unknown): ModelInfo[] {
  const rows = Array.isArray(data) ? data : (data as { models?: unknown } | null)?.models;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const m = (r ?? {}) as Partial<ModelInfo>;
    if (typeof m.id !== "string" || !MODEL_IDS.includes(m.id)) return [];
    return [{ id: m.id as ModelChoice, label: typeof m.label === "string" && m.label ? m.label : m.id, available: m.available === true }];
  });
}

/** GET /api/models: which models have a key on the server. */
export async function models(): Promise<ModelInfo[]> {
  const res = await fetch("/api/models");
  if (!res.ok) throw new Error(await readError(res, `Couldn't load models (${res.status})`));
  return parseModels(await res.json());
}

/** GET /api/health: which providers are connected. */
export async function health(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return (await res.json()) as Health;
}

/** A pixel crop becomes a typed entity (Perceptron or Claude vision). */
export function extractEntity(image: string, hint?: string): Promise<ExtractResponse> {
  return postJson("/api/extract", { image, ...(hint ? { hint } : {}) }, (d) => d as ExtractResponse, "Couldn't read that region");
}

/** An entity becomes a live app with a share link. */
export function liftEntity(entity: ExtractResponse["entity"], instruction?: string): Promise<LiftResponse> {
  return postJson("/api/lift", { entity, ...(instruction ? { instruction } : {}) }, (d) => d as LiftResponse, "Couldn't build the app");
}
