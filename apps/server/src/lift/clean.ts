import type { Entity } from "@create/shared";

type Column = Entity["columns"][number];

/** Strips OCR scaffolding such as "(row 1)", "(column 2, Name)" from a header. */
export function cleanLabel(label: string): string {
  return label
    .replace(/\s*\((?:row|column|col)\b[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUM_CELL = /^\(?-?[$€£]?\s?-?\d[\d,]*(\.\d+)?\s?%?\)?$/;
const MONEY_CELL = /^\(?-?[$€£]\s?\d/;
const PCT_CELL = /%$/;
const TIME_CELL = /^\d{1,2}:\d{2}(\s?[ap]m)?$/i;

/** Total, tax and similar summary lines that must not be plotted as data. */
const SUMMARY_LABEL = /^(sub\s?-?total|grand total|total( due| amount)?|balance( due)?|amount due|(sales )?tax|vat|gst|discount|shipping|tip)\b/i;
export function isSummaryRow(row: Record<string, string>): boolean {
  return Object.values(row).some((v) => SUMMARY_LABEL.test(v.trim()));
}

/** Types a column from its values when the extractor left it as text. */
export function inferType(values: string[], declared: Column["type"]): Column["type"] {
  const vals = values.map((v) => v.trim()).filter(Boolean);
  // A declared number/money/percent column that holds words ("Unlimited", "$12 / month") is text.
  if (declared === "number" || declared === "money" || declared === "percent") {
    return vals.length && vals.every((v) => NUM_CELL.test(v)) ? declared : vals.length ? "text" : declared;
  }
  if (declared !== "text") return declared;
  if (vals.length < 2) return declared;
  if (vals.every((v) => PCT_CELL.test(v) && NUM_CELL.test(v))) return "percent";
  if (vals.every((v) => NUM_CELL.test(v))) return vals.some((v) => MONEY_CELL.test(v)) ? "money" : "number";
  if (vals.every((v) => TIME_CELL.test(v))) return "time";
  return declared;
}

/** Cleans headers, fills blank ones and types columns from values. Row values are never altered. */
/** When the extractor left every header blank and read the header as a data row, promote it (dropping title lines above it). */
export function promoteHeader(e: Entity): Entity {
  if (e.columns.some((c) => c.label.trim()) || e.rows.length < 2) return e;
  const filled = (r: Record<string, string>) => e.columns.filter((c) => (r[c.key] ?? "").trim()).length;
  const widest = Math.max(...e.rows.map(filled));
  const hasNum = (r: Record<string, string>) => e.columns.some((c) => NUM_CELL.test((r[c.key] ?? "").trim()));
  const at = e.rows.slice(0, 5).findIndex((r, i) => filled(r) === widest && !hasNum(r) && e.rows[i + 1] && hasNum(e.rows[i + 1]!));
  if (at < 0) return e;
  const head = e.rows[at]!;
  return { ...e, columns: e.columns.map((c) => ({ ...c, label: (head[c.key] ?? "").trim() })), rows: e.rows.slice(at + 1) };
}

export function cleanEntity(raw: Entity): Entity {
  const input = promoteHeader(raw);
  // Drop columns that are only placeholders (blank header, cells like ":"), which come from clipped crops.
  const junk = input.columns.filter((c) => /^[\s:;.\-]*$/.test(c.label) && input.rows.every((r) => /^[\s:;.\-]*$/.test(r[c.key] ?? "")));
  const entity: Entity = junk.length && junk.length < input.columns.length ? { ...input, columns: input.columns.filter((c) => !junk.includes(c)) } : input;
  const dataRows = entity.rows.filter((r) => !isSummaryRow(r));
  const columns = entity.columns.map((c, i): Column => {
    const label = cleanLabel(c.label) || `Column ${i + 1}`;
    const vals = dataRows.map((r) => r[c.key] ?? "");
    return { ...c, label, type: inferType(vals, c.type) };
  });
  return { ...entity, columns };
}

/** True when the title just repeats what the user typed or is generic filler. */
export function isEchoTitle(title: string, instruction: string | undefined): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (/^(untitled|extracted data|table|chart|list|schedule)$/.test(t)) return true;
  if (/^(track|turn|make|lift|build|save|create|add)\b/.test(t)) return true;
  const i = (instruction ?? "").trim().toLowerCase();
  // Every word of the title comes from the request ("this invoice", "the train"): it is an echo, not a name.
  const words = (x: string) => x.split(/[^a-z0-9]+/).filter((w) => w && !/^(the|this|that|a|an|my|of|it|into|app)$/.test(w));
  const tw = words(t);
  const iw = new Set(words(i));
  if (tw.length > 0 && iw.size > 0 && tw.every((w) => iw.has(w))) return true;
  return !!i && (t === i || i.includes(t) && t.split(/\s+/).length <= 3 && /^(track|turn|make)/.test(i));
}

/** A plain title built from the data when no model copy is available. */
export function fallbackTitle(entity: Entity): string {
  const cap = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  const named = entity.columns.filter((c) => !/^Column \d+$/.test(c.label));
  const label = named.find((c) => c.type === "text" || c.type === "date" || c.type === "time");
  const nums = named.filter((c) => (c.type === "number" || c.type === "money") && !SHARE.test(c.label));
  const num = nums.filter((c) => PREFER.test(c.label)).at(-1) ?? nums[0];
  if (num && label) return cap(`${num.label.toLowerCase()} by ${label.label.toLowerCase()}`).slice(0, 60);
  if (label) return cap(`${label.label.toLowerCase()} list`).slice(0, 60);
  return "Tracker";
}

export type ChartPlan = { kind: "bar" | "line"; title: string; labels: string[]; series: { name: string; key: string }[]; rowIdx: number[] } | { transposed: true; kind: "bar"; title: string; labels: string[]; values: string[]; seriesName: string } | null;

const YEARISH = /^(1[5-9]|20)\d{2}(\b|$)/;
const PREFER = /(amount|total|sales|revenue|price|cost|world|count|qty|quantity|orders|signups)/i;
const SHARE = /(%|share|percent|pct)/i;

/** Picks what to plot: one meaningful series, never summary rows; or a numeric row across plan columns. */
export function planChart(entity: Entity): ChartPlan {
  const numeric = entity.columns.filter((c) => c.type === "number" || c.type === "money" || c.type === "percent");
  // Plot only real data rows: not totals or tax lines, and not rows with no number (a stray "Date created" line).
  const rowIdx = entity.rows
    .map((r, i) => (!isSummaryRow(r) && (numeric.length === 0 || numeric.some((c) => /\d/.test(r[c.key] ?? ""))) ? i : -1))
    .filter((i) => i >= 0);
  const rows = rowIdx.map((i) => entity.rows[i]!);
  if (rows.length === 0) return null;
  const filled = (c: Column) => rows.filter((r) => (r[c.key] ?? "").trim()).length;
  const labelCol = entity.columns.filter((c) => !numeric.includes(c)).sort((a, b) => filled(b) - filled(a))[0];
  if (labelCol && filled(labelCol) === 0) return planNoLabel(entity, numeric, rows, rowIdx);
  if (numeric.length > 0) {
    const nonShare = numeric.filter((c) => !SHARE.test(c.label) && c.type !== "percent");
    const pool = nonShare.length ? nonShare : numeric;
    const yearAxis = !!labelCol && rows.every((r) => YEARISH.test((r[labelCol.key] ?? "").trim()));
    let picked: Column[];
    if (yearAxis && pool.length > 1) {
      const world = pool.find((c) => /world/i.test(c.label));
      picked = [...(world ? [world] : []), ...pool.filter((c) => c !== world)].slice(0, 3);
    } else {
      const favored = pool.filter((c) => PREFER.test(c.label));
      // Prefer the last favored column (Amount over Unit price, Total over Qty); money beats plain counts.
      const money = pool.filter((c) => c.type === "money");
      picked = [favored.at(-1) ?? money.at(-1) ?? pool[0]!];
    }
    const label = labelCol;
    return {
      kind: yearAxis ? "line" : label && (label.type === "date" || label.type === "time") ? "line" : "bar",
      title: picked.map((c) => c.label).join(", "),
      labels: rows.map((r, i) => (label ? (r[label.key] ?? "") : String(i + 1))),
      series: picked.map((c) => ({ name: c.label, key: c.key })),
      rowIdx,
    };
  }
  // No numeric column: look for a row of numbers across the columns (a price per plan).
  const [first, ...others] = entity.columns;
  if (first && others.length >= 2) {
    const lead = /^[$€£]?\s?\d[\d,]*(\.\d+)?(\s?\/\s?\w+)?$/;
    const cand = rows.filter((r) => others.every((c) => lead.test((r[c.key] ?? "").trim())));
    const row = cand.find((r) => /(price|cost|fee|rate)/i.test(r[first.key] ?? "")) ?? cand[0];
    if (row) {
      return {
        transposed: true,
        kind: "bar",
        title: (row[first.key] ?? "").trim() || "Values",
        labels: others.map((c) => c.label),
        values: others.map((c) => row[c.key] ?? ""),
        seriesName: (row[first.key] ?? "").trim() || "Value",
      };
    }
  }
  return null;
}

function planNoLabel(entity: Entity, numeric: Column[], rows: Record<string, string>[], rowIdx: number[]): ChartPlan {
  if (numeric.length === 0) return null;
  const c = numeric.find((x) => x.type !== "percent") ?? numeric[0]!;
  return { kind: "bar", title: c.label, labels: rows.map((_, i) => String(i + 1)), series: [{ name: c.label, key: c.key }], rowIdx };
}
