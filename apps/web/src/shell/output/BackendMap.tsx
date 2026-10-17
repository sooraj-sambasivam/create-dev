import { useEffect, useMemo, useState } from "react";
import { NODE_H, NODE_W, W, layoutDiagram } from "./diagramLayout";
import { ROUTES, keyRows, nodesForRoute, type Health } from "./routes";
import { fetchHealth } from "./shareApi";

export function BackendMap() {
  const [hover, setHover] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  const layout = useMemo(layoutDiagram, []);
  const active = useMemo(() => (hover ? nodesForRoute(hover) : null), [hover]);

  useEffect(() => {
    const ctl = new AbortController();
    fetchHealth(ctl.signal)
      .then(setHealth)
      .catch((e) => !ctl.signal.aborted && (setFailed(true), void e));
    return () => ctl.abort();
  }, []);

  const rows = health ? keyRows(health) : null;

  return (
    <div className="flex flex-col gap-5 p-4">
      <section aria-label="Keys" className="flex flex-col gap-2">
        <h3 className="text-[12px] text-ink-2">Keys</h3>
        {failed && <p className="rounded-md bg-tray px-3 py-2 text-[14px] text-bad">✕ Server not reachable</p>}
        {!failed && !rows && <p className="rounded-md bg-tray px-3 py-2 text-[12px] text-ink-2">Checking…</p>}
        {rows?.map((r) => (
          <div key={r.label} className="flex items-center justify-between rounded-md bg-tray px-3 py-2 text-[14px]">
            <span className="text-ink">{r.label}</span>
            {r.label === "Mock mode" ? (
              r.ok ? <span className="text-[12px] text-ok">✓ Live models</span> : <span className="text-[12px] text-warn">⚠ Canned responses</span>
            ) : r.ok ? (
              <span className="text-[12px] text-ok">✓ Connected</span>
            ) : (
              <span className="text-[12px] text-warn">⚠ Using fallback</span>
            )}
          </div>
        ))}
      </section>

      <section aria-label="Architecture" className="flex flex-col gap-2">
        <h3 className="text-[12px] text-ink-2">Architecture</h3>
        <div className="grid grid-cols-3 text-[12px] text-ink-2">
          <span>Client</span>
          <span className="text-center">Express API</span>
          <span className="text-right">Providers</span>
        </div>
        <svg viewBox={`0 0 ${W} ${layout.height}`} className="w-full text-ink-2" role="img" aria-label="Architecture diagram: client to Express API to providers">
          <defs>
            <marker id="bm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const on = !!active && active.has(e.from) && active.has(e.to);
            return (
              <path
                key={e.from + e.to}
                d={e.d}
                fill="none"
                stroke={on ? "var(--color-accent)" : "currentColor"}
                strokeWidth={on ? 1.75 : 1}
                opacity={active ? (on ? 1 : 0.12) : 0.45}
                markerEnd="url(#bm-arrow)"
                style={{ transition: "opacity 150ms" }}
              />
            );
          })}
          {layout.nodes.map((n) => {
            const on = !!active && active.has(n.id);
            return (
              <g key={n.id} opacity={active && !on ? 0.25 : 1} style={{ transition: "opacity 150ms" }}>
                <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={6} fill={on ? "var(--color-tray)" : "var(--color-surface)"} stroke={on ? "var(--color-accent)" : "var(--color-line)"} strokeWidth={on ? 1.5 : 1} />
                <text x={n.x + NODE_W / 2} y={n.y + NODE_H / 2 + 3.5} textAnchor="middle" fontSize="10" fill="var(--color-ink)">
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section aria-label="Routes" className="flex flex-col gap-2">
        <h3 className="text-[12px] text-ink-2">Routes</h3>
        <ul className="flex flex-col">
          {ROUTES.map((r) => (
            <li
              key={r.method + r.path}
              tabIndex={0}
              onMouseEnter={() => setHover(r.path)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(r.path)}
              onBlur={() => setHover(null)}
              className="flex flex-col gap-1 rounded-lg border-b border-line px-2 py-2 last:border-b-0 hover:bg-tray focus-visible:bg-tray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-tray px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{r.method}</span>
                <span className="font-mono text-[12px] text-ink">{r.path}</span>
                {r.streams && <span className="rounded-full bg-hover px-2 py-0.5 text-[12px] text-ink-2">streams</span>}
              </div>
              <p className="text-[14px] text-ink">{r.summary}</p>
              <p className="text-[12px] text-ink-2">{r.model}</p>
              <p className="text-[12px] text-ink-2">Without a key: {r.fallback}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
