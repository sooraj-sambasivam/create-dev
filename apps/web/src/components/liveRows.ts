import type { StoredSubmission } from "@create/shared";

/** Pure helpers that turn form submissions into table rows and chart points. */

export const slugKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

/** Parses "$1,234.50", "12%", "(40)", "3.2k", "1.5M" into a number; null when it is not numeric. */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$€£¥\s,%]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  const m = /^(\d+(?:\.\d+)?|\.\d+)([kmb])?$/i.exec(s);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  const n = Number(m[1]) * mult;
  return negative ? -n : n;
}

/** Submissions for one form, oldest first. */
export function submissionsForForm(all: StoredSubmission[], formId: string): StoredSubmission[] {
  return all
    .filter((s) => s.formId === formId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Looks a column up in a submission's fields: exact label, then slug of the label, then case-insensitive. */
export function fieldForColumn(fields: Record<string, string>, column: string): string | undefined {
  if (column in fields) return fields[column];
  const slug = slugKey(column);
  if (slug in fields) return fields[slug];
  const lower = column.trim().toLowerCase();
  for (const [k, v] of Object.entries(fields)) if (k.trim().toLowerCase() === lower || slugKey(k) === slug) return v;
  return undefined;
}

/** One table row per submission, cells by column. Submissions that match no column are dropped. */
export function mapRows(columns: string[], subs: StoredSubmission[]): { id: string; cells: string[] }[] {
  const out: { id: string; cells: string[] }[] = [];
  for (const s of subs) {
    let hit = false;
    const cells = columns.map((c) => {
      const v = fieldForColumn(s.fields, c);
      if (v !== undefined) hit = true;
      return v ?? "";
    });
    if (hit) out.push({ id: s.id, cells });
  }
  return out;
}

export type ChartData = { labels: string[]; series: { name: string; values: number[] }[] };

/**
 * Appends one point per submission. The label is the field matching the first series' sibling
 * "label"/"name"/"date"/"week" style keys, else the first non-numeric field; each series reads the field
 * named like it, else the next unused numeric field.
 */
export function mergeChart(base: ChartData, subs: StoredSubmission[]): ChartData {
  const labels = [...base.labels];
  const series = base.series.map((s) => ({ name: s.name, values: [...s.values] }));
  for (const sub of subs) {
    const entries = Object.entries(sub.fields);
    if (!entries.length) continue;
    const used = new Set<string>();
    const named = series.map((s) => entries.find(([k]) => slugKey(k) === slugKey(s.name)));
    named.forEach((e) => e && used.add(e[0]));
    const labelEntry = entries.find(([k, v]) => !used.has(k) && parseNumber(v) === null) ?? entries.find(([k]) => !used.has(k));
    if (labelEntry) used.add(labelEntry[0]);
    const spare = entries.filter(([k, v]) => !used.has(k) && parseNumber(v) !== null);
    let next = 0;
    let any = false;
    series.forEach((s, i) => {
      const e = named[i] ?? spare[next++];
      const n = e ? parseNumber(e[1]) : null;
      if (n !== null) any = true;
      s.values.push(n ?? 0);
    });
    if (!any) {
      series.forEach((s) => s.values.pop());
      continue;
    }
    labels.push(labelEntry?.[1] || String(labels.length + 1));
  }
  return { labels, series };
}
