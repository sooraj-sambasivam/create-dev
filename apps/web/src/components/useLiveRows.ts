import { useEffect, useRef, useState } from "react";
import type { StoredSubmission } from "@create/shared";
import { listSubmissions } from "../lib/api";
import { resolveAppId } from "./forms";
import { submissionsForForm } from "./liveRows";

const POLL_MS = 3000;
const FRESH_MS = 4000;

// One in-flight/recent request per app, so several live blocks on a page share a single poll.
const recent = new Map<string, { at: number; p: Promise<StoredSubmission[]> }>();
function fetchApp(appId: string): Promise<StoredSubmission[]> {
  const hit = recent.get(appId);
  if (hit && Date.now() - hit.at < 1500) return hit.p;
  const p = listSubmissions(appId);
  recent.set(appId, { at: Date.now(), p });
  p.catch(() => recent.delete(appId));
  return p;
}

/** Submissions for a form, refreshed every 3s. `fresh` holds ids that arrived after the first load. */
export function useLiveRows(appId: string | null | undefined, formId: string | null | undefined) {
  const [subs, setSubs] = useState<StoredSubmission[]>([]);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    seen.current = null;
    setSubs([]);
    setFresh(new Set());
    if (!formId) return;
    const id = appId || resolveAppId();
    let alive = true;
    const timers: number[] = [];
    const tick = async () => {
      if (document.hidden) return;
      try {
        const rows = submissionsForForm(await fetchApp(id), formId);
        if (!alive) return;
        const known = seen.current;
        const added = known ? rows.filter((r) => !known.has(r.id)).map((r) => r.id) : [];
        seen.current = new Set(rows.map((r) => r.id));
        setSubs((prev) => (prev.length === rows.length && prev.every((p, i) => p.id === rows[i]?.id) ? prev : rows));
        if (added.length) {
          setFresh((f) => new Set([...f, ...added]));
          timers.push(
            window.setTimeout(() => alive && setFresh((f) => new Set([...f].filter((x) => !added.includes(x)))), FRESH_MS),
          );
        }
      } catch {
        // Keep showing what we have; the next tick retries.
      }
    };
    void tick();
    const iv = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(iv);
      timers.forEach(window.clearTimeout);
    };
  }, [appId, formId]);

  return { subs, fresh };
}
