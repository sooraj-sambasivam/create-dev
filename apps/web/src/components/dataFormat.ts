import type { DataFormat } from "@create/shared";

/** Reads `a.b.c` (array indexes allowed: `items.0.name`) from a JSON value; undefined when missing. */
export function getField(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Formats a backend value for display. Returns null when there is nothing sensible to show (renderer uses the fallback). */
export function formatDataValue(value: unknown, format: DataFormat = "text"): string | null {
  if (value === null || value === undefined || typeof value === "object") return null;
  if (format === "text") return String(value);
  if (format === "date") {
    const d =
      typeof value === "number"
        ? new Date(value)
        : typeof value === "string" && value.trim()
          ? new Date(/^\d+$/.test(value.trim()) ? Number(value) : value)
          : null;
    return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
  }
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  if (format === "number") return n.toLocaleString();
  if (format === "compact") return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}
