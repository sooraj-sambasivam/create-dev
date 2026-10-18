import { randomUUID } from "node:crypto";
import type { TraySource } from "@create/shared";

export const TRAY_MAX = 50;

export type TrayInput = {
  title: string;
  kind: string;
  url?: string;
  thumbnail?: string;
  snippetHtml?: string;
  styles?: Record<string, string>;
  source?: TraySource;
};
/** The full record, as stored. */
export type TrayRecord = TrayInput & { id: string; createdAt: string };
/** What GET /api/tray lists: no heavy fields, only pointers to them (kept light for the 1.5 s notch poll). */
export type TrayItem = {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
  url?: string;
  source?: TraySource;
  thumbnailUrl?: string;
  hasSnippet?: boolean;
};

export function toItem(r: TrayRecord): TrayItem {
  const item: TrayItem = { id: r.id, title: r.title, kind: r.kind, createdAt: r.createdAt };
  if (r.url) item.url = r.url;
  if (r.source) item.source = r.source;
  if (r.thumbnail) item.thumbnailUrl = `/api/tray/${r.id}/thumbnail`;
  if (r.snippetHtml) item.hasSnippet = true;
  return item;
}

/** In-memory tray, oldest first, capped at TRAY_MAX (the oldest item drops when full). Process-local. */
export function createTrayStore(max = TRAY_MAX, now: () => number = Date.now) {
  let items: TrayRecord[] = [];
  return {
    list: (): TrayItem[] => items.map(toItem),
    get: (id: string): TrayRecord | undefined => {
      const r = items.find((i) => i.id === id);
      return r ? { ...r } : undefined;
    },
    push(input: TrayInput): TrayItem {
      const rec: TrayRecord = { id: randomUUID(), ...input, createdAt: new Date(now()).toISOString() };
      items.push(rec);
      if (items.length > max) items = items.slice(items.length - max);
      return toItem(rec);
    },
    remove(id: string): boolean {
      const before = items.length;
      items = items.filter((i) => i.id !== id);
      return items.length < before;
    },
    clear(): void {
      items = [];
    },
  };
}
export type TrayStore = ReturnType<typeof createTrayStore>;
export const trayStore: TrayStore = createTrayStore();
