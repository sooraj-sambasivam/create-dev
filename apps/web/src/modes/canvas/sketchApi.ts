import { GenerateResponseSchema, type GenerateResponse, type SketchRequest } from "@create/shared";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

/** POST /api/generate-sketch. Rejects with an Error whose message is safe to show. */
export async function generateSketch(req: SketchRequest, signal?: AbortSignal): Promise<GenerateResponse> {
  const res = await fetch("/api/generate-sketch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, `Sketch generation failed (${res.status})`));
  return GenerateResponseSchema.parse(await res.json());
}
