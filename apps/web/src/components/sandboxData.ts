import type { DataNode } from "@create/shared";

/**
 * Bridge to the live-data hook owned by the logic/ lane (apps/web/src/logic/useSandboxData.ts).
 *
 * Expected contract of that file's `useSandboxData` export:
 *
 *   useSandboxData(source: { route: string; params?: Record<string, string> }, refreshSec?: number)
 *     => { status: "loading" | "ready" | "error"; data?: unknown }
 *
 * `data` is the parsed JSON response of the route. It must be a real React hook (it is called
 * unconditionally from the renderer).
 *
 * That file may not exist yet, so it is picked up with import.meta.glob instead of a static
 * import: if absent, the fallback hook reports "error" and elements show their fallback text.
 * If the real signature differs, adapt it here (one file).
 */
export type SandboxSource = DataNode["source"];
export type SandboxResult = { status: "loading" | "ready" | "error"; data?: unknown };
type Hook = (source: SandboxSource, refreshSec?: number) => SandboxResult;

const mods = import.meta.glob<{ useSandboxData?: Hook }>("../logic/useSandboxData.ts", { eager: true });
const real = Object.values(mods)[0]?.useSandboxData;

const unavailable: Hook = () => ({ status: "error" });

export const useSandboxData: Hook = real ?? unavailable;
