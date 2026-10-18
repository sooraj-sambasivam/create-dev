import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { motion } from "motion/react";
import type { Leaf } from "@create/shared";
import { useLiveRows } from "./useLiveRows";
import { mapRows, mergeChart, parseNumber, type ChartData } from "./liveRows";
import { duration, ease, spring, staggerDelay, useReducedMotionSafe } from "../ui/motion";

type TableNode = Extract<Leaf, { type: "table" }>;
type ChartNode = Extract<Leaf, { type: "chart" }>;

const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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
                background: fresh.has(row.id) ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                // Paint-only tint that fades out; the row's own entrance is transform and opacity.
                transition: reduceMotion() ? "none" : "background-color 1.5s ease-out",
              }}
            >
              {row.cells.map((cell, c) => (
                <td key={c} className={`px-4 py-2.5 ${c === row.cells.length - 1 && row.cells.length > 1 ? "text-right tabular-nums" : ""}`}>
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

const SERIES_COLORS = ["var(--accent)", "var(--fg-muted)", "var(--color-ok)", "var(--color-warn)"];
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
  const { reduce } = useReducedMotionSafe();
  const all = series.flatMap((s) => s.values);
  const min = Math.min(0, ...all);
  const top = niceMax(Math.max(0, ...all));
  const span = top - min || 1;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + ih - ((v - min) / span) * ih;
  const n = Math.max(labels.length, 1);
  const band = iw / n;
  const x = (i: number) => PAD.l + band * (i + 0.5);
  const ticks = [0, 1, 2, 3, 4].map((t) => min + (span * t) / 4);
  const every = Math.ceil(n / 8);
  const barW = Math.min(36, (band * 0.7) / series.length);
  const summary = `${node.kind === "line" ? "Line" : "Bar"} chart${node.title ? `: ${node.title}` : ""}. ${series
    .map((s) => `${s.name} from ${fmt(Math.min(...s.values, 0))} to ${fmt(Math.max(...s.values, 0))}`)
    .join("; ")} across ${labels.length} points.`;
  return (
    <figure className="w-full" style={style}>
      {node.title && <figcaption className="mb-2 text-base font-semibold">{node.title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full max-w-[720px]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--fg-muted)">
              {fmt(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={12} fill="var(--fg-muted)">
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
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--fg-muted)" }}>
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
