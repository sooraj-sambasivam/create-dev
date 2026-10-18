import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AudioWaveform, Database, Feather, Image as ImageIcon, MessageSquare, Mic, PanelsTopLeft, Server, Shapes, Share, Sparkles, Zap } from "lucide-react";
import type { Health } from "../routes";
import { EDGES, NODES, neighbours, nodeStatus, routesFor, statusLabel, type IconName, type Status, type SvcNode } from "./model";

const ICONS: Record<IconName, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  message: MessageSquare, canvas: PanelsTopLeft, narrate: AudioWaveform, share: Share, server: Server, database: Database,
  sonnet: Sparkles, haiku: Feather, jev: Zap, scribe: Mic, photos: ImageIcon, icons: Shapes,
};
const DOT: Record<Status, string> = { connected: "bg-ok", fallback: "bg-warn", unused: "bg-ink-3", unknown: "bg-ink-3" };
const WIDE = 520;

type Pt = { x: number; y: number };
type Geo = { w: number; h: number; box: Record<string, { x: number; y: number; w: number; h: number }> };

function curve(a: Pt, b: Pt, vertical: boolean): string {
  if (vertical) {
    const my = (a.y + b.y) / 2;
    return `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
  }
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
}

export function ServiceDiagram({ health }: { health: Health | null }) {
  const root = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const [geo, setGeo] = useState<Geo | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const wide = (geo?.w ?? WIDE) >= WIDE;

  const measure = useCallback(() => {
    const r = root.current;
    if (!r) return;
    const rb = r.getBoundingClientRect();
    const box: Geo["box"] = {};
    for (const [id, el] of Object.entries(refs.current)) {
      if (!el) continue;
      const b = el.getBoundingClientRect();
      box[id] = { x: b.left - rb.left, y: b.top - rb.top, w: b.width, h: b.height };
    }
    setGeo((p) => (p && p.w === rb.width && p.h === rb.height && JSON.stringify(p.box) === JSON.stringify(box) ? p : { w: rb.width, h: rb.height, box }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const r = root.current;
    if (!r || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(r);
    return () => ro.disconnect();
  }, [measure, wide, health]);

  const lit = useMemo(() => (active ? neighbours(active) : null), [active]);
  const cols = [0, 1, 2].map((c) => NODES.filter((n) => n.col === c));

  const edges = useMemo(() => {
    if (!geo || !wide) return [];
    return EDGES.flatMap((e) => {
      const f = geo.box[e.from], t = geo.box[e.to];
      if (!f || !t) return [];
      const vertical = Math.abs(f.x - t.x) < 8;
      const a = vertical ? { x: f.x + f.w / 2, y: f.y + f.h } : { x: f.x + f.w, y: f.y + f.h / 2 };
      const b = vertical ? { x: t.x + t.w / 2, y: t.y } : { x: t.x - 2, y: t.y + t.h / 2 };
      return [{ ...e, d: curve(a, b, vertical), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }];
    });
  }, [geo, wide]);

  const tip = active && geo?.box[active] ? { node: NODES.find((n) => n.id === active)!, box: geo.box[active] } : null;
  const tipRoutes = tip ? routesFor(tip.node.id) : [];

  return (
    <div ref={root} className="relative" onMouseLeave={() => setActive(null)}>
      {geo && wide && (
        <svg className="pointer-events-none absolute inset-0 text-ink-3" width={geo.w} height={geo.h} aria-hidden>
          {edges.map((e) => {
            const on = !!active && (e.from === active || e.to === active);
            return (
              <g key={e.from + e.to} className="transition-opacity duration-150 motion-reduce:transition-none" opacity={active ? (on ? 1 : 0.15) : 0.6}>
                <path d={e.d} fill="none" stroke={on ? "var(--color-accent)" : "currentColor"} strokeWidth={on ? 1.75 : 1} />
                {on && (
                  <text x={e.mid.x} y={e.mid.y - 6} textAnchor="middle" fontSize="12" fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="relative grid gap-3" style={{ gridTemplateColumns: wide ? "repeat(3, minmax(0, 1fr))" : "minmax(0, 1fr)", columnGap: wide ? 40 : undefined }}>
        {cols.map((list, c) => (
          <div key={c} className="flex flex-col justify-center gap-3" style={{ gridColumn: wide ? c + 1 : undefined }}>
            {list.map((n) => (
              <NodeCard key={n.id} node={n} status={nodeStatus(n.id, health)} health={health} dim={!!lit && !lit.has(n.id)} on={active === n.id} setRef={(el) => (refs.current[n.id] = el)} onActive={(v) => setActive(v ? n.id : null)} />
            ))}
          </div>
        ))}
      </div>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-60 max-w-full rounded-xl border border-line bg-surface p-2 shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
          style={{ top: tip.box.y + tip.box.h + 4, left: Math.max(0, Math.min(tip.box.x, (geo?.w ?? 0) - 240)) }}
        >
          <p className="text-[12px] text-ink-2">{tipRoutes.length ? "Routes" : "No routes"}</p>
          {tipRoutes.slice(0, 8).map((r) => (
            <p key={r.method + r.path} className="truncate font-mono text-[12px] text-ink">
              <span className="text-ink-2">{r.method}</span> {r.path}
            </p>
          ))}
          {tipRoutes.length > 8 && <p className="text-[12px] text-ink-2">+{tipRoutes.length - 8} more</p>}
        </div>
      )}
    </div>
  );
}

function NodeCard({ node, status, health, dim, on, setRef, onActive }: { node: SvcNode; status: Status; health: Health | null; dim: boolean; on: boolean; setRef: (el: HTMLElement | null) => void; onActive: (v: boolean) => void }) {
  const Icon = ICONS[node.icon];
  const label = statusLabel(status, node.id, health);
  return (
    <div
      ref={setRef}
      tabIndex={0}
      role="group"
      aria-label={`${node.name}. ${node.role}. ${label}`}
      onMouseEnter={() => onActive(true)}
      onFocus={() => onActive(true)}
      onBlur={() => onActive(false)}
      className={`flex flex-col gap-1 rounded-xl border bg-surface p-3 outline-none transition-[opacity,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${on ? "border-accent" : "border-line"} ${dim ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{node.name}</span>
        <span className={`size-2 shrink-0 rounded-full ${DOT[status]}`} aria-hidden />
      </div>
      <p className="text-[12px] text-ink-2">{node.role}</p>
      <p className="text-[12px] text-ink-2">{label}</p>
    </div>
  );
}
