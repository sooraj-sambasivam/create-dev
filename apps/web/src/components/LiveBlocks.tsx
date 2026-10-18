import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import type { Leaf } from "@create/shared";
import { useLiveRows } from "./useLiveRows";
import { mapRows, mergeChart, parseNumber, type ChartData } from "./liveRows";
import { duration, ease, spring, staggerDelay, useReducedMotionSafe } from "../ui/motion";

/** Smallest text the chart may paint, in screen pixels (the canvas scales pages down to fit). */
const MIN_LABEL_PX = 12.5;
/** Axis and legend text: the page's text colour eased toward its background, always >= 4.5:1. */
const AXIS_INK = "color-mix(in srgb, var(--fg) 74%, var(--bg))";

/** Layout px that paint as MIN_LABEL_PX on screen, even when an ancestor scales the page down. */
function useScreenMinPx(ref: React.RefObject<Element | null>): { px: number; width: number } {
  const [m, setM] = useState({ px: 12.5, width: 640 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = (el as HTMLElement).clientWidth || (el as SVGSVGElement).getBoundingClientRect().width;
      const scale = w ? el.getBoundingClientRect().width / w : 1;
      const px = Math.round((MIN_LABEL_PX / Math.min(1, scale || 1)) * 10) / 10;
      const width = Math.round(w) || 640;
      setM((p) => (p.px === px && p.width === width ? p : { px, width }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    // An ancestor transform (the canvas scale) does not fire ResizeObserver, so re-check lightly.
    const iv = window.setInterval(measure, 500);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.clearInterval(iv);
    };
  }, [ref]);
  return m;
}

type TableNode = Extract<Leaf, { type: "table" }>;
type ChartNode = Extract<Leaf, { type: "chart" }>;

const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** New-row wash: a light accent tint that fades out. Light enough for any page theme. */
const FRESH_TINT = "color-mix(in srgb, var(--color-accent) 14%, transparent)";

/** "via phone" mark on a row that just arrived: a small accent chip. Self-contained colours so it reads on any page theme. */
function ViaPhoneStamp({ reduce }: { reduce: boolean }) {
  return (
    <motion.span
      data-via-phone=""
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: duration.fast } : spring.bouncy}
      className="mr-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-accent px-1.5 align-middle text-[12px] font-semibold leading-5 text-accent"
      style={{ background: "var(--color-surface)" }}
    >
      via phone
    </motion.span>
  );
}

export function TableBlock({ node, style }: { node: TableNode; style: CSSProperties }) {
  const { subs, fresh } = useLiveRows(null, node.liveFormId);
  const live = useMemo(() => mapRows(node.columns, subs), [node.columns, subs]);
  const rows = [...node.rows.map((cells, i) => ({ id: `s${i}`, cells })), ...live];
  const { reduce } = useReducedMotionSafe();
  // Rows present at first paint stagger in (24ms apart); rows that arrive later spring in on their own.
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <div className="w-full overflow-x-auto rounded-xl" style={{ boxShadow: "0 0 0 1px var(--border)", ...style }}>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr style={{ background: "var(--muted)" }}>
            {node.columns.map((c, i) => (
              <th key={i} className={`px-4 py-2.5 font-semibold ${i === node.columns.length - 1 && node.columns.length > 1 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <motion.tr
              key={row.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduce
                  ? { duration: duration.fast }
                  : { ...spring.gentle, opacity: { duration: duration.base, ease: ease.standard }, delay: first.current ? staggerDelay(rows.indexOf(row)) : 0 }
              }
              data-new={fresh.has(row.id) ? "true" : undefined}
              style={{
                borderTop: "1px solid var(--border)",
                background: fresh.has(row.id) ? FRESH_TINT : "transparent",
                boxShadow: fresh.has(row.id) ? "inset 3px 0 0 var(--color-accent)" : "none",
                // Paint-only tint that fades out; the row's own entrance is transform and opacity.
                transition: reduceMotion() ? "none" : "background-color 1.5s ease-out, box-shadow 1.5s ease-out",
              }}
            >
              {row.cells.map((cell, c) => (
                <td key={c} className={`px-4 py-2.5 ${c === row.cells.length - 1 && row.cells.length > 1 ? "text-right tabular-nums" : ""}`}>
                  {c === 0 && fresh.has(row.id) && <ViaPhoneStamp reduce={reduce} />}
                  {cell}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const DEFAULT_SERIES_COLORS = ["var(--accent)", "var(--fg-muted)", "var(--color-ok)", "var(--color-warn)"];
const W = 640;
const H = 280;
const PAD = { l: 44, r: 12, t: 12, b: 32 };

/** Round axis ceiling: 1, 2, 2.5, 5 x 10^n. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}
const fmt = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function ChartBlock({ node, style }: { node: ChartNode; style: CSSProperties }) {
  const { subs } = useLiveRows(null, node.liveFormId);
  const data: ChartData = useMemo(
    () => mergeChart({ labels: node.labels, series: node.series }, subs),
    [node.labels, node.series, subs],
  );
  const { labels, series } = data;
  // A color set on the chart (e.g. "make this blue") recolors the first series; the others keep their defaults.
  const custom = node.style?.color || (typeof style.color === "string" ? style.color : undefined);
  const SERIES_COLORS = custom ? [custom, ...DEFAULT_SERIES_COLORS.slice(1)] : DEFAULT_SERIES_COLORS;
  const { reduce } = useReducedMotionSafe();
  const svgRef = useRef<SVGSVGElement>(null);
  const { px: labelPx, width: svgWidth } = useScreenMinPx(svgRef);
  // Font size in viewBox units that paints at labelPx layout px, never under 12.
  const fs = Math.min(26, Math.max(12, (labelPx * W) / Math.max(svgWidth, 1)));
  const all = series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const top = niceMax(Math.max(0, ...all));
  const span = top - min || 1;
  const maxTick = Math.max(...[0, 1, 2, 3, 4].map((t) => fmt(min + (span * t) / 4).length));
  const padL = Math.max(PAD.l, Math.ceil(10 + fs * 0.62 * maxTick));
  const padB = Math.max(PAD.b, Math.ceil(fs + 14));
  const iw = W - padL - PAD.r;
  const ih = H - PAD.t - padB;
  const y = (v: number) => PAD.t + ih - ((v - min) / span) * ih;
  const n = Math.max(labels.length, 1);
  const band = iw / n;
  const x = (i: number) => padL + band * (i + 0.5);
  const ticks = [0, 1, 2, 3, 4].map((t) => min + (span * t) / 4);
  const every = Math.max(Math.ceil(n / 8), Math.ceil((n * (fs * 6 + 6)) / Math.max(iw, 1)));
  const barW = Math.min(36, (band * 0.7) / series.length);
  const summary = `${node.kind === "line" ? "Line" : "Bar"} chart${node.title ? `: ${node.title}` : ""}. ${series
    .map((s) => `${s.name} from ${fmt(Math.min(...s.values, 0))} to ${fmt(Math.max(...s.values, 0))}`)
    .join("; ")} across ${labels.length} points.`;
  return (
    <figure className="w-full" style={style}>
      {node.title && <figcaption className="mb-2 text-base font-semibold">{node.title}</figcaption>}
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full max-w-[720px]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={fs} fill={AXIS_INK}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={fs} fill={AXIS_INK}>
              {l.length > 10 ? `${l.slice(0, 9)}…` : l}
            </text>
          ) : null,
        )}
        {node.kind === "line"
          ? series.map((s, si) => (
              <g key={si} stroke={SERIES_COLORS[si]} fill={SERIES_COLORS[si]}>
                <motion.polyline
                  fill="none"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  initial={reduce ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={reduce ? { duration: duration.fast } : { pathLength: { duration: 0.9, ease: ease.standard, delay: si * 0.12 }, opacity: { duration: duration.fast } }}
                />
                {s.values.map((v, i) => (
                  <motion.circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={3}
                    stroke="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={reduce ? { duration: duration.fast } : { duration: duration.base, delay: 0.5 + si * 0.12 + staggerDelay(i, 0.03) }}
                  />
                ))}
              </g>
            ))
          : series.map((s, si) =>
              s.values.map((v, i) => {
                const bx = x(i) - (barW * series.length) / 2 + barW * si;
                const y0 = y(Math.max(v, 0));
                const h = Math.max(Math.abs(y(v) - y(0)), 1);
                return (
                  // Bars grow from the baseline on a spring (scaleY from the bar's own base); later data changes glide.
                  <motion.rect
                    key={`${si}-${i}`}
                    x={bx}
                    width={barW - 2}
                    rx={3}
                    fill={SERIES_COLORS[si]}
                    opacity={si === 0 ? 1 : 0.7}
                    style={{ originY: v >= 0 ? 1 : 0 }}
                    initial={reduce ? { y: y0, height: h, opacity: 0 } : { y: y0, height: h, scaleY: 0 }}
                    animate={{ y: y0, height: h, scaleY: 1, opacity: si === 0 ? 1 : 0.7 }}
                    transition={reduce ? { duration: duration.fast } : { ...spring.bouncy, delay: staggerDelay(i) + si * 0.04 }}
                  />
                );
              }),
            )}
      </svg>
      {series.length > 1 && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1" style={{ color: AXIS_INK, fontSize: Math.max(12, labelPx) }}>
          {series.map((s, i) => (
            <li key={i} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>{node.title ?? "Chart data"}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            {series.map((s, i) => (
              <th key={i} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={i}>
              <th scope="row">{l}</th>
              {series.map((s, j) => (
                <td key={j}>{parseNumber(s.values[i]) ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
