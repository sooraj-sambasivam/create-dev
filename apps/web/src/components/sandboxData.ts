import { useMemo } from "react";
import type { DataNode } from "@create/shared";
import { useLive } from "../live/useLive";
import type { LiveSourceId } from "../live/liveApi";

/**
 * Adapter between the `data` element and the live-data client (apps/web/src/live, GET /api/live/<id>).
 * No sandbox or model-written code runs here: the node's route only names a server-side live source.
 *
 * `data` is the live value, shaped so a field path like "value" or "display" resolves against it.
 */
export type SandboxSource = DataNode["source"];
export type SandboxResult = { status: "loading" | "ready" | "error"; data?: unknown };

/** "/github-stars" or "github-stars" -> "github-stars" (first path segment). */
function liveId(route: string): LiveSourceId {
  return (route.replace(/^\/+/, "").split("/")[0] ?? "") as LiveSourceId;
}

export function useSandboxData(source: SandboxSource, refreshSec?: number | null): SandboxResult {
  const params = JSON.stringify(source.params ?? {});
  const live = useMemo(
    () => ({ id: liveId(source.route), params: JSON.parse(params) as Record<string, string> }),
    [source.route, params],
  );
  const result = useLive(live, refreshSec ?? 0);
  if (result.state === "ready" && result.data) return { status: "ready", data: result.data };
  // Keep showing the last good value if a refresh fails.
  return { status: result.state === "error" ? "error" : "loading" };
}
