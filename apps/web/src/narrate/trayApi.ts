/** The tray as the in-page pill sees it. The server keeps the heavy parts (thumbnail, markup) behind URLs. */
export type TrayCard = {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
  url?: string;
  thumbnailUrl?: string;
  hasSnippet?: boolean;
  source?: { app?: string; url?: string; title?: string };
};

/** Server order is oldest first; cards read newest first, left to right. */
export const newestFirst = (items: readonly TrayCard[]): TrayCard[] => [...items].reverse();

export async function fetchTray(signal?: AbortSignal): Promise<TrayCard[] | null> {
  try {
    const r = await fetch("/api/tray", { signal, cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { items?: TrayCard[] };
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return null;
  }
}

export async function deleteTrayItem(id: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/tray/${encodeURIComponent(id)}`, { method: "DELETE" });
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

/** Opens a card in Create: a lifted app by its link, a snippet as a new page. Resolves to the URL, or null. */
export async function openTrayItem(item: TrayCard): Promise<string | null> {
  if (item.url) return item.url;
  try {
    const r = await fetch(`/api/tray/${encodeURIComponent(item.id)}/open`, { method: "POST" });
    if (!r.ok) return null;
    const j = (await r.json()) as { url?: string };
    return j.url ?? null;
  } catch {
    return null;
  }
}

export async function fetchSnippet(id: string): Promise<{ html: string; title: string } | null> {
  try {
    const r = await fetch(`/api/tray/${encodeURIComponent(id)}/snippet`);
    return r.ok ? ((await r.json()) as { html: string; title: string }) : null;
  } catch {
    return null;
  }
}

/** Drag-out data for a card: the markup (text/html), a plain-text fallback, and the link when there is one. */
export function dragPayload(card: TrayCard, html: string | null): Record<string, string> {
  const out: Record<string, string> = { "text/plain": html ? html : card.title };
  if (html) out["text/html"] = html;
  if (card.url) out["text/uri-list"] = card.url;
  return out;
}
