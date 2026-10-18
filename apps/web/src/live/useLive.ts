import { useEffect, useState } from "react";
import { fetchLive, type LiveSource, type LiveValue } from "./liveApi";

export type LiveState = "loading" | "ready" | "error";

export type UseLive = {
  state: LiveState;
  value: string | number | null;
  display: string;
  error: string | null;
  data: LiveValue | null;
};

/** Poll a live source. refreshSec <= 0 fetches once. Keeps the last good value if a refresh fails. */
export function useLive(source: LiveSource | null, refreshSec = 60): UseLive {
  const [data, setData] = useState<LiveValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LiveState>("loading");
  const key = source ? `${source.id}|${JSON.stringify(Object.entries(source.params).sort())}` : "";

  useEffect(() => {
    if (!source) return;
    let alive = true;
    let controller = new AbortController();
    setState("loading");
    setData(null);
    setError(null);

    const run = async () => {
      controller = new AbortController();
      try {
        const next = await fetchLive(source, controller.signal);
        if (!alive) return;
        setData(next);
        setError(null);
        setState("ready");
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Live data failed.");
        setState("error");
      }
    };

    void run();
    const timer = refreshSec > 0 ? setInterval(() => void run(), Math.max(15, refreshSec) * 1000) : undefined;
    return () => {
      alive = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
    // `key` stands in for the source object so inline literals do not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshSec]);

  return { state, value: data?.value ?? null, display: data?.display ?? "", error, data };
}
