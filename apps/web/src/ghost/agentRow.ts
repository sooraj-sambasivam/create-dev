import { emitCompanion } from "../companion/bus";
import { ghostController } from "./controller";
import { isAgentRowCommand } from "./command";
import { deriveRowValues } from "./rowValues";
import { buildAddRowSteps, fieldKeys, findAddRowForm, findTextFields, runGhost } from "./script";

const FORM_SELECTORS = [
  "[data-right-panel] [data-screen-root] [data-form]",
  "[data-screen-root] [data-form]",
];
/** How long to wait for the new row to show up after the click. */
const LANDED_TIMEOUT_MS = 8000;
const POLL_MS = 120;
/** Let the "done" face play before the celebration so neither is swallowed by the other. */
const CELEBRATE_AFTER_MS = 1250;

const cellText = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** The lifted app's Add-a-row form: the page's own form first, then the generic heading search. */
export function findLiftedForm(doc: Document = document): Element | null {
  for (const sel of FORM_SELECTORS) {
    const forms = Array.from(doc.querySelectorAll(sel)).filter((f) => findTextFields(f).length > 0);
    if (forms.length) return forms.find((f) => /add a row/i.test(f.textContent ?? "")) ?? forms[0];
  }
  return findAddRowForm(doc);
}

export interface TableSnapshot {
  columns: string[];
  rows: string[][];
}

/** The table in the same page as the form (the form's own screen root, else the document's first table). */
export function readTable(form: Element): TableSnapshot | null {
  const root = form.closest("[data-screen-root]") ?? form.ownerDocument;
  const table = root.querySelector("table");
  if (!table) return null;
  const columns = Array.from(table.querySelectorAll("thead th")).map(cellText);
  const rows = Array.from(table.querySelectorAll("tbody tr")).map((tr) => Array.from(tr.querySelectorAll("td")).map(cellText));
  return { columns, rows };
}

export function rowCount(form: Element): number {
  return readTable(form)?.rows.length ?? 0;
}

export type AgentRowResult = { ok: true; values: string[] } | { ok: false; reason: string };

let running: AbortController | null = null;

/** Stop the agent mid-run (Escape). */
export function cancelAgentRow(): void {
  running?.abort();
}

export function agentRowRunning(): boolean {
  return running !== null;
}

function waitFor(test: () => boolean, ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const stop = (v: boolean) => {
        clearInterval(iv);
        resolve(v);
      };
      if (signal.aborted) stop(false);
      else if (test()) stop(true);
      else if (Date.now() - t0 > ms) stop(false);
    }, POLL_MS);
  });
}

/**
 * "Add a row for me": the agent cursor fills the lifted app's form with values that continue the existing
 * rows, and Pip narrates it. Resolves when the row has landed (or why it did not).
 */
export async function runAgentAddRow(doc: Document = document): Promise<AgentRowResult> {
  if (running) return { ok: false, reason: "Already working on it" };
  const ctl = new AbortController();
  running = ctl;
  try {
    emitCompanion({ type: "note", text: "On it…" });
    const form = findLiftedForm(doc);
    if (!form) {
      emitCompanion({ type: "error", text: "I don't see a form to fill" });
      return { ok: false, reason: "No Add a row form on the page" };
    }
    emitCompanion({ type: "thinking" });
    const fields = findTextFields(form);
    const table = readTable(form);
    const values = deriveRowValues(
      table?.columns ?? [],
      table?.rows ?? [],
      fields.map((f) => fieldKeys(f, form)[0] ?? ""),
    );
    const before = rowCount(form);
    const first = fields[0];
    await runGhost(buildAddRowSteps(form, values, { caption: "Adding a row for you" }), { signal: ctl.signal });

    const landed = await waitFor(
      () => rowCount(form) > before || !form.isConnected || (!!first && values[0] !== "" && first.value === ""),
      LANDED_TIMEOUT_MS,
      ctl.signal,
    );
    if (ctl.signal.aborted) throw new DOMException("aborted", "AbortError");
    if (!landed) {
      emitCompanion({ type: "error", text: "The row didn't land" });
      return { ok: false, reason: "Row did not appear" };
    }
    emitCompanion({ type: "done", text: values.filter(Boolean).slice(0, 2).join(" · ") || "Row added", label: "Row added" });
    setTimeout(() => emitCompanion({ type: "celebrate" }), CELEBRATE_AFTER_MS);
    return { ok: true, values };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      ghostController.say(null);
      ghostController.hide();
      emitCompanion({ type: "cancelled" });
      return { ok: false, reason: "Cancelled" };
    }
    const reason = e instanceof Error ? e.message : "Couldn't add the row";
    emitCompanion({ type: "error", text: reason });
    return { ok: false, reason };
  } finally {
    running = null;
  }
}

/** Starts the agent when the line hands the form over ("add a row for me"). Returns true when it took the line. */
export function handleAgentCommand(text: string): boolean {
  if (!isAgentRowCommand(text)) return false;
  void runAgentAddRow();
  return true;
}
