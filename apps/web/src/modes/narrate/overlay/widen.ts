/**
 * Dwell-to-widen. Rest the pointer on a table cell and the target widens step by step:
 * cell, then row, then table, then the section around it, one step per WIDEN_STEP_MS of dwell.
 * Pure logic only (no React, no layout reads beyond the boxes it is handed), so it is unit tested.
 */

export const WIDEN_STEP_MS = 450;
/** The pointer may drift this many px and still count as dwelling in one place. */
export const DWELL_JITTER_PX = 8;

export type WidenKind = "cell" | "row" | "table" | "node" | "section";
export type Box = { left: number; top: number; width: number; height: number };

/** The slice of an Element the chain builder reads. */
export type WidenEl = {
  tagName: string;
  textContent: string | null;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): Box;
  closest?(selector: string): WidenEl | null;
  parentElement?: WidenEl | null;
  querySelectorAll?(selector: string): ArrayLike<WidenEl>;
};

export type WidenLevel = {
  kind: WidenKind;
  /** The page node the level acts on. A cell or row acts on its table. */
  nodeId: string;
  el: WidenEl;
  /** "Cell · 7:42 AM", "Row 3 of 12", "Table · 12 rows × 4 cols" */
  label: string;
  /** What the margin note says: "12 rows, 4 columns". */
  note: string;
};

/**
 * The table cell at a point, found by geometry. Edit mode keeps page content out of hit-testing
 * (pointer-events), so elementsFromPoint never returns the cell; rows are found by binary search on top.
 */
export function cellAt(table: WidenEl, x: number, y: number): { cell: WidenEl; row: WidenEl } | null {
  const rows = Array.from(table.querySelectorAll?.("tr") ?? []);
  let lo = 0;
  let hi = rows.length - 1;
  let row: WidenEl | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = rows[mid].getBoundingClientRect();
    if (y < b.top) hi = mid - 1;
    else if (y > b.top + b.height) lo = mid + 1;
    else {
      row = rows[mid];
      break;
    }
  }
  if (!row) return null;
  for (const cell of Array.from(row.querySelectorAll?.("th,td") ?? [])) {
    const b = cell.getBoundingClientRect();
    if (x >= b.left && x <= b.left + b.width) return { cell, row };
  }
  return null;
}

const snip = (s: string | null | undefined, max = 24) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

/** Rows (body rows when there is a header) and columns of a table element. */
export function tableShape(table: WidenEl): { rows: number; cols: number } {
  const all = Array.from(table.querySelectorAll?.("tr") ?? []);
  const head = Array.from(table.querySelectorAll?.("thead tr") ?? []);
  const rows = Math.max(0, all.length - head.length);
  const first = all[0];
  const cols = first ? Array.from(first.querySelectorAll?.("th,td") ?? []).length : 0;
  return { rows, cols };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function tableNote(shape: { rows: number; cols: number }): string {
  return `${plural(shape.rows, "row")}, ${plural(shape.cols, "column")}`;
}

/**
 * The widen chain for what is under the pointer, narrowest first. `under` is the top element at the
 * pointer; `hit` is the page node found there (its element and id) and `hitLabel` its human label.
 * Cell and row levels exist only inside a table. Containers around the hit add "section" levels (at most 2).
 */
export function buildWidenChain(
  under: WidenEl | null,
  hit: { id: string; el: WidenEl } | null,
  hitLabel: string,
  root?: { contains(n: never): boolean } | null,
  /** The node type for an id when the DOM carries no data-node-type (the Screen tree knows it). */
  typeOf?: (id: string) => string | null,
  /** The pointer, for finding a cell by geometry when hit-testing cannot reach it. */
  point?: { x: number; y: number } | null,
): WidenLevel[] {
  if (!hit) return [];
  const out: WidenLevel[] = [];
  const typeFor = (el: WidenEl, id: string | null) => el.getAttribute("data-node-type") ?? (id && typeOf ? typeOf(id) : null);
  const hitType = typeFor(hit.el, hit.id);
  const inTable = hitType === "table" || !!under?.closest?.("table");
  const tableEl = hitType === "table" ? hit.el : (under?.closest?.("table") ?? null);

  if ((under || point) && inTable && tableEl) {
    let cell = under?.closest?.("td,th") ?? null;
    let row = under?.closest?.("tr") ?? null;
    if (!cell && point) {
      const found = cellAt(tableEl, point.x, point.y);
      if (found) ({ cell, row } = found);
    }
    const shape = tableShape(tableEl);
    if (cell) out.push({ kind: "cell", nodeId: hit.id, el: cell, label: `Cell · ${snip(cell.textContent) || "empty"}`, note: snip(cell.textContent, 30) || "empty cell" });
    if (row) {
      const rows = Array.from(tableEl.querySelectorAll?.("tr") ?? []);
      const head = Array.from(tableEl.querySelectorAll?.("thead tr") ?? []).length;
      const at = rows.indexOf(row) - head;
      const label = at >= 0 ? `Row ${at + 1} of ${shape.rows}` : "Header row";
      out.push({ kind: "row", nodeId: hit.id, el: row, label, note: at >= 0 ? `row ${at + 1} of ${shape.rows}` : `${plural(shape.cols, "column")}` });
    }
    out.push({ kind: "table", nodeId: hit.id, el: hit.el, label: `Table · ${shape.rows} rows × ${shape.cols} cols`, note: tableNote(shape) });
  } else {
    out.push({ kind: hitType === "container" ? "section" : "node", nodeId: hit.id, el: hit.el, label: hitLabel, note: hitLabel.split(" · ")[1] ?? hitLabel });
  }

  let p = hit.el.parentElement ?? null;
  let sections = 0;
  while (p && sections < 2) {
    if (root && !root.contains(p as never)) break;
    const id = p.getAttribute("data-node-id");
    if (id && typeFor(p, id) === "container" && !out.some((l) => l.nodeId === id)) {
      out.push({ kind: "section", nodeId: id, el: p, label: "Section", note: "the whole section" });
      sections++;
    }
    p = p.parentElement ?? null;
  }
  return out;
}

export type DwellState = { x: number; y: number; key: string; since: number };

/** Folds a pointer sample into the dwell: moving past the jitter, or onto another thing, restarts it. */
export function stepDwell(prev: DwellState | null, s: { t: number; x: number; y: number; key: string }, jitter = DWELL_JITTER_PX): DwellState {
  if (prev && prev.key === s.key && Math.hypot(s.x - prev.x, s.y - prev.y) <= jitter) return prev;
  return { x: s.x, y: s.y, key: s.key, since: s.t };
}

/** Which chain level a dwell has reached: 0 at rest, +1 per step, capped at the last level. */
export function dwellLevel(state: DwellState | null, now: number, chainLength: number, stepMs = WIDEN_STEP_MS): number {
  if (!state || chainLength <= 0) return 0;
  return Math.max(0, Math.min(chainLength - 1, Math.floor((now - state.since) / stepMs)));
}

/** 0..1 progress toward the next widen step (drives the progress ring); 1 once at the last level. */
export function dwellProgress(state: DwellState | null, now: number, chainLength: number, stepMs = WIDEN_STEP_MS): number {
  if (!state || chainLength <= 1) return 0;
  const elapsed = now - state.since;
  if (elapsed >= (chainLength - 1) * stepMs) return 1;
  return (elapsed % stepMs) / stepMs;
}

const BASE_CONFIDENCE: Record<WidenKind, number> = { cell: 0.58, row: 0.74, table: 0.93, node: 0.82, section: 0.66 };

/** How sure the pointer is that this level is what the user means, 0..1. A wider dwell is a firmer signal. */
export function confidence(kind: WidenKind, dwelled: boolean): number {
  return Math.min(1, BASE_CONFIDENCE[kind] + (dwelled ? 0.04 : 0));
}

/** Filled steps of a 5-step meter. */
export const meterSteps = (c: number): number => Math.max(1, Math.min(5, Math.round(c * 5)));

/** "612 × 240" for the measurement ticks. */
export const sizeLabel = (b: { width: number; height: number }): string => `${Math.round(b.width)} × ${Math.round(b.height)}`;
