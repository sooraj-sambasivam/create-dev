import { randomUUID } from "node:crypto";

export const TRAY_MAX = 50;
export type TrayItem = { id: string; title: string; kind: string; url: string; createdAt: string };

/** In-memory tray, oldest first, capped at TRAY_MAX (the oldest item drops when full). Process-local. */
export function createTrayStore(max = TRAY_MAX, now: () => number = Date.now) {
  let items: TrayItem[] = [];
  return {
    list: (): TrayItem[] => items.map((i) => ({ ...i })),
    push(input: { title: string; kind: string; url: string }): TrayItem {
      const item: TrayItem = { id: randomUUID(), ...input, createdAt: new Date(now()).toISOString() };
      items.push(item);
      if (items.length > max) items = items.slice(items.length - max);
      return { ...item };
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
