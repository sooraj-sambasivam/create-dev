/** Plausible values for a new row, derived from the rows already on the page. Pure; no DOM. */

const TIERS = ["free", "starter", "basic", "plus", "team", "pro", "business", "premium", "enterprise"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function parseClock(s: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?\s*$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

function fmtClock(total: number, like: string): string {
  const t = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, "0");
  const ap = /([ap])\.?m\.?\s*$/i.exec(like);
  if (!ap) return `${String(h24).padStart(/^\d{2}:/.test(like.trim()) ? 2 : 1, "0")}:${mm}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = ap[1] === ap[1].toUpperCase() ? (h24 >= 12 ? "PM" : "AM") : h24 >= 12 ? "pm" : "am";
  const space = /\s[ap]/i.test(like) ? " " : "";
  return `${h12}:${mm}${space}${suffix}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Most common step between consecutive values, else the median step, else `fallback`. */
function stepOf(xs: number[], fallback: number): number {
  const diffs = xs.slice(1).map((v, i) => v - xs[i]).filter((d) => d !== 0);
  if (!diffs.length) return fallback;
  const counts = new Map<number, number>();
  for (const d of diffs) counts.set(d, (counts.get(d) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 1 ? best[0] : median(diffs);
}

const NUM = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/;

function nextNumeric(cells: string[]): string | null {
  const parts = cells.map((c) => NUM.exec(c.trim()));
  if (parts.some((p) => !p)) return null;
  const last = parts[parts.length - 1]!;
  const prefix = last[1];
  const suffix = last[3];
  // Mixed units ("$9/mo" next to "Free") are not a series.
  if (parts.some((p) => p![1] !== prefix || p![3] !== suffix)) return null;
  const nums = parts.map((p) => Number(p![2].replace(/,/g, "")));
  const dec = Math.max(...parts.map((p) => (p![2].split(".")[1] ?? "").length));
  const step = stepOf(nums, nums.length > 1 ? 0 : 1) || Math.max(1, Math.round(Math.abs(nums[nums.length - 1]) * 0.25));
  const v = nums[nums.length - 1] + step;
  const body = dec ? v.toFixed(dec) : String(Math.round(v));
  const withCommas = /,/.test(last[2]) ? Number(body).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : body;
  return `${prefix}${withCommas}${suffix}`;
}

function nextLabeled(cells: string[]): string | null {
  const m = /^(.*?)(\d+)\s*$/.exec(cells[cells.length - 1].trim());
  if (!m || !m[1].trim()) return null;
  return `${m[1]}${Number(m[2]) + 1}`;
}

function nextTier(cells: string[]): string | null {
  const idx = cells.map((c) => TIERS.indexOf(norm(c))).filter((i) => i >= 0);
  if (idx.length < 2 || idx.length !== cells.length) return null;
  const hi = Math.max(...idx);
  const next = TIERS[hi + 1];
  return next ? next[0].toUpperCase() + next.slice(1) : null;
}

/** Emails: a fresh local part on the same domain, numbered past the ones already there. */
function nextEmail(cells: string[]): string | null {
  if (!cells.every((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c))) return null;
  const domain = cells[cells.length - 1].split("@")[1];
  const used = new Set(cells.map((c) => c.toLowerCase()));
  let n = cells.length + 1;
  while (used.has(`guest${n}@${domain}`.toLowerCase())) n++;
  return `guest${n}@${domain}`;
}

/** The next value for one column given its existing cells (oldest first). */
export function nextCell(header: string, cells: string[]): string {
  const vals = cells.map((c) => c.trim()).filter(Boolean);
  const h = norm(header);
  if (vals.length === 0) return /name|title|item/.test(h) ? "New entry" : "1";

  const clocks = vals.map(parseClock);
  if (clocks.every((c): c is number => c !== null)) {
    const step = stepOf(clocks as number[], 30);
    return fmtClock((clocks[clocks.length - 1] as number) + (step > 0 ? step : 30), vals[vals.length - 1]);
  }
  const email = nextEmail(vals);
  if (email) return email;
  const tier = nextTier(vals);
  if (tier) return tier;
  const num = nextNumeric(vals);
  if (num !== null) return num;
  const labeled = nextLabeled(vals);
  if (labeled) return labeled;

  // A category column repeats itself: keep the most common value.
  const counts = new Map<string, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (vals.length >= 3 && n >= 2 && n >= vals.length / 2) return top;
  // Short free text (a feature list, a note): borrow the shape of the last cell.
  if (/;/.test(vals[vals.length - 1])) return vals[vals.length - 1].split(";").slice(0, 2).map((s) => s.trim()).join("; ");
  return /name|title|item|stop|who/.test(h) ? "New entry" : vals[vals.length - 1];
}

/**
 * One value per form field. A field takes the column with the same label; otherwise the column at the same
 * position. Fields with no matching column get a short placeholder so the form still submits.
 */
export function deriveRowValues(columns: string[], rows: string[][], fieldLabels: string[]): string[] {
  const byName = new Map(columns.map((c, i) => [norm(c), i]));
  return fieldLabels.map((label, i) => {
    const col = byName.get(norm(label)) ?? (i < columns.length ? i : -1);
    if (col < 0) return "New";
    return nextCell(columns[col] ?? label, rows.map((r) => r[col] ?? "").filter((c) => c !== ""));
  });
}
