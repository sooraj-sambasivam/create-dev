import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { ServiceDiagram } from "./diagram/ServiceDiagram";
import type { Health } from "./routes";
import { fetchHealth } from "./shareApi";

/** Services diagram with live status from GET /api/health. */
export function BackendMap() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetchHealth(ctl.signal)
      .then(setHealth)
      .catch(() => !ctl.signal.aborted && setFailed(true));
    return () => ctl.abort();
  }, []);

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {failed && (
        <p className="flex h-8 items-center gap-2 text-[14px] text-bad">
          <CircleAlert size={16} strokeWidth={1.75} aria-hidden />Server not reachable
        </p>
      )}
      <ServiceDiagram health={failed ? null : health} />
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" aria-hidden />Connected</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warn" aria-hidden />Fallback</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ink-3" aria-hidden />Not used</li>
        <li>Hover or focus a node to see its connections and routes.</li>
      </ul>
    </div>
  );
}
