import { useEffect, useState } from "react";
import { health, models, type Health, type ModelInfo } from "../../lib/api";
import { MODELS, MODEL_NAMES } from "../../store/composerPrefs";

export interface ServerInfo {
  health: Health | null;
  models: ModelInfo[];
  loaded: boolean;
}

/** Inkling runs through Tinker (Thinking Machines) or OpenRouter; /api/health reports each flag. */
export function hasInkling(h: Health | null | undefined): boolean {
  const x = h as (Health & { hasTinker?: boolean }) | null | undefined;
  return Boolean(x?.hasTinker || x?.hasOpenRouter);
}

/** Fallback when GET /api/models is missing: availability comes from /api/health key flags. */
export function modelsFromHealth(h: Health | null): ModelInfo[] {
  const ok = (id: (typeof MODELS)[number]): boolean => {
    if (!h) return false;
    if (id === "sonnet" || id === "haiku") return Boolean(h.hasAnthropic || h.mock);
    if (id === "gemini") return Boolean(h.hasGemini);
    return hasInkling(h);
  };
  return MODELS.map((id) => ({ id, label: MODEL_NAMES[id], available: ok(id) }));
}

let cache: Promise<ServerInfo> | null = null;

function load(): Promise<ServerInfo> {
  if (!cache) {
    cache = (async () => {
      const [h, m] = await Promise.allSettled([health(), models()]);
      const hv = h.status === "fulfilled" ? h.value : null;
      const list = m.status === "fulfilled" && m.value.length > 0 ? m.value : modelsFromHealth(hv);
      return { health: hv, models: list, loaded: true };
    })();
  }
  return cache;
}

/** Re-ask the server (after the user adds a key). */
export function resetServerInfo(): void {
  cache = null;
}

/** Server status for the model picker and the Plugins popover. Loads once per page. */
export function useServerInfo(): ServerInfo {
  const [info, setInfo] = useState<ServerInfo>({ health: null, models: modelsFromHealth(null), loaded: false });
  useEffect(() => {
    let live = true;
    void load().then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, []);
  return info;
}
