import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { AudioWaveform, Check, Database, Minus, TriangleAlert, Feather, Image as ImageIcon, MessageSquare, Mic, PanelsTopLeft, Server, Shapes, Share, Sparkles, Zap } from "lucide-react";
import type { Health } from "../routes";
import { EDGES, NODES, neighbours, nodeStatus, routesFor, statusLabel, type IconName, type Status, type SvcNode } from "./model";
import { edgeLabelRect, placeTooltip, type Rect } from "./tooltip";

const ICONS: Record<IconName, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  message: MessageSquare, canvas: PanelsTopLeft, narrate: AudioWaveform, share: Share, server: Server, database: Database,
  sonnet: Sparkles, haiku: Feather, jev: Zap, scribe: Mic, photos: ImageIcon, icons: Shapes,
};
const STATUS_ICON: Record<Status, { Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string; "aria-hidden"?: boolean }>; cls: string }> = {
  connected: { Icon: Check, cls: "text-ok" },
  fallback: { Icon: TriangleAlert, cls: "text-warn" },
  unused: { Icon: Minus, cls: "text-ink-2" },
  unknown: { Icon: Minus, cls: "text-ink-2" },
};
const WIDE = 520;
const TIP_W = 240;
const TIP_PAD = 16;
const TIP_LINE = 18;

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
  const tipShown = Math.min(tipRoutes.length, 8);
  const tipLines = 1 + Math.max(tipShown, 1) + (tipRoutes.length > 8 ? 1 : 0);
  const tipSize = { w: TIP_W, h: TIP_PAD + tipLines * TIP_LINE };

  // Everything the tooltip must not cover: other node cards and the labels of edges lit by the hovered node.
  let tipPos: ReturnType<typeof placeTooltip> | null = null;
  if (tip && geo) {
    const obstacles: Rect[] = Object.entries(geo.box)
      .filter(([id]) => id !== tip.node.id)
      .map(([, b]) => b);
    if (wide) {
      for (const e of edges) {
        if (e.from === tip.node.id || e.to === tip.node.id) obstacles.push(edgeLabelRect(e.mid, e.label));
      }
    }
    tipPos = placeTooltip({ bounds: { w: geo.w, h: geo.h }, anchor: tip.box, size: tipSize, obstacles });
  }

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
          className="pointer-events-none absolute z-10 rounded-xl border border-line bg-surface p-2 shadow-soft"
          data-side={tipPos?.side}
          style={{ top: tipPos?.y ?? 0, left: tipPos?.x ?? 0, width: TIP_W }}
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
        {(() => {
          const { Icon: StatusIcon, cls } = STATUS_ICON[status];
          return <StatusIcon size={14} strokeWidth={2} className={`shrink-0 ${cls}`} aria-hidden />;
        })()}
      </div>
      <p className="text-[12px] text-ink-2">{node.role}</p>
      <p className="text-[12px] text-ink-2">{label}</p>
    </div>
  );
}
