import { ghostController, prefersReducedMotion, type GhostCursorApi } from "./controller";
import type { Point } from "./path";

export type Target = string | Element | Point;

export type GhostStep =
  | { moveTo: Target }
  | { click: Target }
  | { type: { selector: Target; text: string; cps?: number } }
  | { say: string }
  | { wait: number };

export interface RunOptions {
  cursor?: GhostCursorApi;
  doc?: Document;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  /** Hide the cursor when the script ends (default true). */
  hideAfter?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DEFAULT_CPS = 14;

function isPoint(t: Target): t is Point {
  return typeof t === "object" && t !== null && "x" in t && "y" in t && !("nodeType" in t);
}

export function resolveElement(t: Target, doc: Document): Element {
  if (typeof t === "string") {
    const el = doc.querySelector(t);
    if (!el) throw new Error(`ghost: no element matches "${t}"`);
    return el;
  }
  if (isPoint(t)) {
    const el = doc.elementFromPoint?.(t.x, t.y);
    if (!el) throw new Error(`ghost: nothing at (${t.x}, ${t.y})`);
    return el;
  }
  return t;
}

export function targetPoint(t: Target, doc: Document): Point {
  if (isPoint(t)) return t;
  const el = resolveElement(t, doc);
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

type Win = Window & typeof globalThis;
const winOf = (doc: Document): Win => (doc.defaultView ?? globalThis) as Win;

function mouse(doc: Document, el: Element, type: string, p: Point): void {
  const w = winOf(doc);
  const init = { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, button: 0, view: doc.defaultView };
  if (type.startsWith("pointer") && typeof w.PointerEvent === "function") {
    el.dispatchEvent(new w.PointerEvent(type, { ...init, pointerType: "mouse", isPrimary: true }));
  } else {
    el.dispatchEvent(new w.MouseEvent(type, init));
  }
}

/** Set a value the way React sees it: native setter, then a bubbling input event. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const w = winOf(el.ownerDocument);
  const proto = el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}

export function isTextField(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const t = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "file", "hidden", "image", "range", "color"].includes(t);
}

async function pace(ms: number, sleep: (ms: number) => Promise<void>, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("ghost aborted", "AbortError");
  if (ms > 0) await sleep(ms);
  if (signal?.aborted) throw new DOMException("ghost aborted", "AbortError");
}

export async function runGhost(steps: GhostStep[], opts: RunOptions = {}): Promise<void> {
  const cursor = opts.cursor ?? ghostController;
  const doc = opts.doc ?? document;
  const sleep = opts.sleep ?? defaultSleep;
  const { signal } = opts;
  const instant = prefersReducedMotion();

  try {
    for (const step of steps) {
      await pace(0, sleep, signal);
      if ("wait" in step) {
        await pace(step.wait, sleep, signal);
      } else if ("say" in step) {
        cursor.say(step.say);
      } else if ("moveTo" in step) {
        await cursor.moveTo(targetPoint(step.moveTo, doc), { instant });
      } else if ("click" in step) {
        const el = resolveElement(step.click, doc);
        el.scrollIntoView?.({ block: "center", inline: "nearest" });
        const p = targetPoint(el, doc);
        await cursor.moveTo(p, { instant });
        await pace(instant ? 0 : 120, sleep, signal);
        cursor.ripple();
        mouse(doc, el, "pointerdown", p);
        mouse(doc, el, "mousedown", p);
        (el as HTMLElement).focus?.();
        mouse(doc, el, "pointerup", p);
        mouse(doc, el, "mouseup", p);
        mouse(doc, el, "click", p);
        await pace(instant ? 0 : 160, sleep, signal);
      } else if ("type" in step) {
        const { selector, text, cps = DEFAULT_CPS } = step.type;
        const el = resolveElement(selector, doc);
        if (!isTextField(el)) throw new Error("ghost: type target is not a text field");
        // Bring it into view first, or the cursor would glide to a spot off screen.
        el.scrollIntoView?.({ block: "center", inline: "nearest" });
        const p = targetPoint(el, doc);
        await cursor.moveTo(p, { instant });
        cursor.ripple();
        mouse(doc, el, "mousedown", p);
        el.focus();
        mouse(doc, el, "click", p);
        const per = cps > 0 ? 1000 / cps : 0;
        let acc = el.value;
        for (const ch of Array.from(text)) {
          acc += ch;
          el.dispatchEvent(new (winOf(doc).KeyboardEvent)("keydown", { key: ch, bubbles: true }));
          setNativeValue(el, acc);
          el.dispatchEvent(new (winOf(doc).KeyboardEvent)("keyup", { key: ch, bubbles: true }));
          await pace(per, sleep, signal);
        }
        el.dispatchEvent(new (winOf(doc).Event)("change", { bubbles: true }));
      }
    }
  } finally {
    if (opts.hideAfter !== false) {
      cursor.say(null);
      cursor.hide();
    }
  }
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function fieldKeys(el: HTMLInputElement | HTMLTextAreaElement, root: Element): string[] {
  const keys = [el.getAttribute("aria-label"), el.placeholder, el.name, el.id];
  const labelled = el.getAttribute("aria-labelledby");
  if (labelled) for (const id of labelled.split(/\s+/)) keys.push(root.ownerDocument.getElementById(id)?.textContent ?? null);
  for (const l of Array.from(el.labels ?? [])) keys.push(l.textContent);
  const wrap = el.closest("label");
  if (wrap) keys.push(wrap.textContent);
  return keys.map(norm).filter(Boolean);
}

export function findTextFields(root: Element): Array<HTMLInputElement | HTMLTextAreaElement> {
  return Array.from(root.querySelectorAll("input, textarea")).filter(isTextField);
}

export function findSubmit(root: Element): HTMLElement | null {
  const explicit = root.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]');
  if (explicit) return explicit;
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'));
  return buttons.find((b) => /add|save|submit|create/i.test(b.textContent ?? "")) ?? buttons[buttons.length - 1] ?? null;
}

/** Steps that fill every textbox in `formRoot` and click its submit button. */
export function buildAddRowSteps(
  formRoot: Element,
  values: string[] | Record<string, string>,
  opts: { caption?: string; cps?: number } = {},
): GhostStep[] {
  const fields = findTextFields(formRoot);
  const submit = findSubmit(formRoot);
  if (fields.length === 0) throw new Error("ghost: no textboxes in form");
  if (!submit) throw new Error("ghost: no submit button in form");
  const steps: GhostStep[] = [];
  if (opts.caption) steps.push({ say: opts.caption });
  fields.forEach((f, i) => {
    let v: string | undefined;
    if (Array.isArray(values)) v = values[i];
    else {
      const keys = fieldKeys(f, formRoot);
      const hit = Object.keys(values).find((k) => keys.includes(norm(k)));
      v = hit !== undefined ? values[hit] : undefined;
    }
    if (v === undefined || v === "") return;
    steps.push({ type: { selector: f, text: v, cps: opts.cps } });
    steps.push({ wait: 120 });
  });
  steps.push({ click: submit });
  return steps;
}

/** Preset: find the "Add a row" form's textboxes, fill them, press submit. */
export function ghostAddRow(
  formRoot: Element,
  values: string[] | Record<string, string>,
  opts: RunOptions & { caption?: string; cps?: number } = {},
): Promise<void> {
  const { caption, cps, ...run } = opts;
  return runGhost(buildAddRowSteps(formRoot, values, { caption, cps }), run);
}

/** Locate a lifted app's add-row form: the container holding an "Add a row" heading. */
export function findAddRowForm(doc: Document = document): Element | null {
  const form = doc.querySelector("form");
  if (form && findTextFields(form).length) return form;
  const heads = Array.from(doc.querySelectorAll("h1,h2,h3,h4,[role=heading]")).filter((h) => /add a row/i.test(h.textContent ?? ""));
  for (const h of heads) {
    let n: Element | null = h.parentElement;
    while (n && n !== doc.body) {
      if (findTextFields(n).length && findSubmit(n)) return n;
      n = n.parentElement;
    }
  }
  return null;
}
