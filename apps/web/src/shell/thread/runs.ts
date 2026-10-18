/**
 * Pure helpers for the thread's run line, step log and result cards: durations, the steps derived
 * from streamed partial pages, and the "what changed" rows of a result card. No React, no stores.
 */
import { walkNodes, type Node, type Screen } from "@create/shared";

export type RunKind = "build" | "ask" | "edit" | "lift";

/** One line of the step log. `at` is milliseconds since the run started. */
export interface StepRecord {
  label: string;
  at: number;
}

/** The run in flight, shown live in the thread. */
export interface LiveRun {
  kind: RunKind;
  startedAt: number;
  steps: StepRecord[];
}

export interface ResultRow {
  label: string;
  /** Small right-aligned stat ("4 elements", "added"). */
  stat?: string;
}

/** Everything a result card draws. Stored with the history entry so it survives a reload. */
export interface ResultData {
  title: string;
  meta: string;
  rows: ResultRow[];
}

/** A region lifted into a live app. Lives only for the session (see liftLog). */
export interface LiftEntry {
  id: string;
  /** history.length when the lift finished, so the card sits after the turns that came before it. */
  afterCount: number;
  title: string;
  url: string;
  rows: number;
  columns: { label: string; type: string }[];
  sourceTitle: string | null;
  ms: number;
  steps: StepRecord[];
}

export const RUN_VERB: Record<RunKind, string> = { build: "Built", ask: "Answered", edit: "Edited", lift: "Lifted" };
export const RUN_VERB_ING: Record<RunKind, string> = { build: "Building", ask: "Thinking", edit: "Editing", lift: "Lifting" };

/** "12s", "1m 4s". Never "0s": a finished run took at least a second to show. */
export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** "Built in 12s". */
export function runLabel(kind: RunKind, ms: number): string {
  return `${RUN_VERB[kind]} in ${formatDuration(ms)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface ScreenStats {
  sections: number;
  elements: number;
  images: number;
  data: number;
  inputs: number;
}

export function analyzeScreen(screen: Screen | null | undefined): ScreenStats {
  const out: ScreenStats = { sections: 0, elements: 0, images: 0, data: 0, inputs: 0 };
  if (!screen) return out;
  out.sections = screen.children.length;
  walkNodes(screen.children, (n) => {
    out.elements++;
    if (n.type === "image") out.images++;
    else if (n.type === "data") out.data++;
    else if (n.type === "textbox" || n.type === "checkbox" || n.type === "select") out.inputs++;
  });
  return out;
}

export const countElements = (screen: Screen | null | undefined): number => analyzeScreen(screen).elements;

function subtreeSize(node: Node): number {
  let n = 0;
  walkNodes([node], () => n++);
  return n;
}

/**
 * Turns streamed partial pages into a short step log. Feed it each partial; it adds a step when
 * something new shows up (more sections, photos, live data, a form) and updates "Writing N sections"
 * in place instead of repeating it.
 */
export class StepTracker {
  readonly steps: StepRecord[] = [];
  private sections = 0;
  private seen = new Set<string>();

  constructor(
    private readonly startedAt: number,
    hasPage: boolean,
  ) {
    this.steps.push({ label: hasPage ? "Reading your page" : "Planning layout", at: 0 });
  }

  /** Returns true when the step list changed. */
  frame(screen: Screen, now: number): boolean {
    const at = Math.max(0, now - this.startedAt);
    const s = analyzeScreen(screen);
    let changed = false;
    if (s.sections > this.sections) {
      this.sections = s.sections;
      const label = `Writing ${plural(s.sections, "section")}`;
      const last = this.steps[this.steps.length - 1];
      if (last && last.label.startsWith("Writing ")) last.label = label;
      else this.steps.push({ label, at });
      changed = true;
    }
    const once = (key: string, label: string, on: boolean) => {
      if (!on || this.seen.has(key)) return;
      this.seen.add(key);
      this.steps.push({ label, at });
      changed = true;
    };
    once("images", "Picking photos", s.images > 0);
    once("data", "Connecting live data", s.data > 0);
    once("inputs", "Adding a form", s.inputs > 0);
    return changed;
  }

  /** Closes the log. Returns the elapsed time and a copy of the steps. */
  finish(now: number): { ms: number; steps: StepRecord[] } {
    const ms = Math.max(0, now - this.startedAt);
    this.steps.push({ label: "Finishing up", at: ms });
    return { ms, steps: this.steps.map((x) => ({ ...x })) };
  }
}

/** Steps for a question: there is no stream, so the log is the two things that happen. */
export function askSteps(ms: number, hasPage: boolean, hasTarget: boolean): StepRecord[] {
  const read = hasTarget ? "Reading the element" : hasPage ? "Reading your page" : "Reading your question";
  return [
    { label: read, at: 0 },
    { label: "Writing the answer", at: Math.round(ms * 0.4) },
  ];
}

/** Steps for an AI element edit. */
export function editSteps(ms: number, label: string): StepRecord[] {
  return [
    { label: `Reading ${label}`, at: 0 },
    { label: "Rewriting it", at: Math.round(ms * 0.4) },
    { label: "Finishing up", at: ms },
  ];
}

/** Steps for a lift. `readMs` is when the region had been read and the app build began. */
export function liftSteps(ms: number, readMs: number): StepRecord[] {
  return [
    { label: "Reading the region", at: 0 },
    { label: "Building the app", at: Math.min(readMs, ms) },
    { label: "Finishing up", at: ms },
  ];
}

type Labeler = (n: Node) => string;

function connectionRows(screen: Screen): ResultRow[] {
  const rows: ResultRow[] = [];
  walkNodes(screen.children, (n) => {
    if (n.type === "data") {
      const id = n.source.route.replace(/^\/+/, "").split("/")[0] || n.source.route;
      rows.push({ label: `Live data · ${n.label || id}`, stat: "source" });
    }
  });
  return rows;
}

/** What a page build or refinement changed, as a result card. `before` null means a first build. */
export function buildResult(before: Screen | null, after: Screen, label: Labeler): ResultData {
  const stats = analyzeScreen(after);
  if (!before || before.children.length === 0) {
    const rows: ResultRow[] = after.children.map((n) => ({ label: label(n), stat: plural(subtreeSize(n), "element") }));
    rows.push(...connectionRows(after));
    return { title: "Built page", meta: plural(stats.elements, "element"), rows };
  }
  const beforeById = new Map(before.children.map((n) => [n.id, n]));
  const afterIds = new Set(after.children.map((n) => n.id));
  const rows: ResultRow[] = [];
  let added = 0;
  let changed = 0;
  for (const n of after.children) {
    const prev = beforeById.get(n.id);
    if (!prev) {
      added++;
      rows.push({ label: label(n), stat: "added" });
    } else if (JSON.stringify(prev) !== JSON.stringify(n)) {
      changed++;
      rows.push({ label: label(n), stat: "changed" });
    }
  }
  let removed = 0;
  for (const n of before.children) {
    if (!afterIds.has(n.id)) {
      removed++;
      rows.push({ label: label(n), stat: "removed" });
    }
  }
  const prevData = analyzeScreen(before).data;
  const dataDelta = stats.data - prevData;
  if (dataDelta !== 0) rows.push({ label: "Live data sources", stat: `${dataDelta > 0 ? "+" : ""}${dataDelta}` });
  const parts = [
    added ? `${added} added` : "",
    changed ? `${changed} changed` : "",
    removed ? `${removed} removed` : "",
    dataDelta > 0 ? `+${plural(dataDelta, "data source")}` : "",
  ].filter(Boolean);
  return { title: "Updated page", meta: parts.length ? parts.join(" · ") : "No visible changes", rows };
}

/** An element edit as a result card: "Edited Heading · Ember" with the one change as its row. */
export function editResult(label: string, summary: string): ResultData {
  const change = summary.replace(/[.!\s]+$/, "");
  return { title: `Edited ${label}`, meta: "1 element", rows: change ? [{ label, stat: change }] : [] };
}

/** A lifted region as a result card: "Lifted Route 44 schedule · 12 rows · 4 columns". */
export function liftResult(entry: Pick<LiftEntry, "title" | "rows" | "columns" | "sourceTitle">): ResultData {
  const rows: ResultRow[] = entry.columns.map((c) => ({ label: c.label, stat: c.type }));
  if (entry.sourceTitle) rows.push({ label: `Imported from ${entry.sourceTitle}` });
  return {
    title: `Lifted ${entry.title}`,
    meta: `${plural(entry.rows, "row")} · ${plural(entry.columns.length, "column")}`,
    rows,
  };
}
