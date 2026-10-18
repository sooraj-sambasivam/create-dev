export type LiveSourceId = "weather" | "github-stars" | "crypto-price" | "hn-top" | "time" | "youtube-views";

export type LiveSource = { id: LiveSourceId; params: Record<string, string> };

export type LiveCatalogEntry = { id: LiveSourceId; label: string; params: { name: string; example: string }[] };

export type LiveValue = { value: string | number; display: string; updatedAt: string; source: string };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchLiveCatalog(signal?: AbortSignal): Promise<LiveCatalogEntry[]> {
  const res = await fetch("/api/live", { signal });
  if (!res.ok) throw new Error(await readError(res, `Could not load live sources (${res.status}).`));
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("Live source list was unreadable.");
  return data as LiveCatalogEntry[];
}

export function liveUrl(source: LiveSource): string {
  const qs = new URLSearchParams(source.params).toString();
  return `/api/live/${encodeURIComponent(source.id)}${qs ? `?${qs}` : ""}`;
}

export async function fetchLive(source: LiveSource, signal?: AbortSignal): Promise<LiveValue> {
  const res = await fetch(liveUrl(source), { signal });
  if (!res.ok) throw new Error(await readError(res, `Live data failed (${res.status}).`));
  const d = (await res.json()) as Partial<LiveValue>;
  if ((typeof d.value !== "string" && typeof d.value !== "number") || typeof d.display !== "string") {
    throw new Error("Live data was unreadable.");
  }
  return {
    value: d.value,
    display: d.display,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
    source: typeof d.source === "string" ? d.source : "",
  };
}
