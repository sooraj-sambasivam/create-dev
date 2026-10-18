import type { Screen } from "@create/shared";
import type { SharePrototypeResponse } from "@create/shared";

/** The link made by the latest share in this session, for the Backend tab's Hosting row. */
let lastShareUrl: string | null = null;
export const lastSharedUrl = () => lastShareUrl;

/** POST /api/prototypes. Returns the share id and an absolute-or-relative url. */
export async function sharePrototype(screen: Screen, title?: string): Promise<SharePrototypeResponse> {
  const res = await fetch("/api/prototypes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ screen, title: title ?? screen.title }),
  });
  if (!res.ok) {
    let msg = `Couldn't create a share link (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as Partial<SharePrototypeResponse>;
  if (typeof data.id !== "string" || typeof data.url !== "string") throw new Error("Unexpected share response.");
  lastShareUrl = absoluteUrl(data.url);
  return { id: data.id, url: lastShareUrl };
}

/** The server may return `/?p=id`; make it shareable outside the app. */
export function absoluteUrl(url: string, origin = typeof location !== "undefined" ? location.origin : ""): string {
  if (/^https?:\/\//i.test(url)) return url;
  return origin + (url.startsWith("/") ? url : `/${url}`);
}

export async function fetchHealth(signal?: AbortSignal) {
  const res = await fetch("/api/health", { signal });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as { mock?: boolean };
}
