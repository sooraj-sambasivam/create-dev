import { ScreenOpsSchema, type CanvasOpsRequest, type CanvasOpsResponse } from "@create/shared";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

/** POST /api/canvas-ops. Rejects with an Error whose message is safe to show. */
export async function requestCanvasOps(req: CanvasOpsRequest, signal?: AbortSignal): Promise<CanvasOpsResponse> {
  const res = await fetch("/api/canvas-ops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, `Canvas edit failed (${res.status})`));
  const data = (await res.json()) as CanvasOpsResponse;
  // The ops are model output: validate them again before they touch the page.
  const ops = ScreenOpsSchema.parse(data.ops ?? []);
  return { ...data, ops };
}
