import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GhostController } from "./controller";
import { buildAddRowSteps, findAddRowForm, runGhost, ghostAddRow, type GhostStep } from "./script";

// The project has no DOM env dependency installed. Use jsdom, then happy-dom,
// or the module named by GHOST_DOM_MODULE; skip the suite when none resolves.
async function loadWindow(): Promise<Window | null> {
  const names = [process.env.GHOST_DOM_MODULE, "jsdom", "happy-dom"].filter(Boolean) as string[];
  for (const n of names) {
    try {
      const m = (await import(/* @vite-ignore */ n)) as Record<string, any>;
      if (m.JSDOM) return new m.JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true }).window;
      if (m.Window) return new m.Window();
    } catch {
      /* try next */
    }
  }
  return null;
}

const win = await loadWindow();
const FORM = `
<div id="app"><h2>Add a row</h2>
<form id="f">
  <label>Name <input name="name" placeholder="Name"></label>
  <input placeholder="Price" aria-label="Price">
  <button type="submit">Add row</button>
</form></div>`;

describe.skipIf(!win)("ghost step runner (dom)", () => {
  const saved: Record<string, unknown> = {};
  beforeAll(() => {
    for (const k of ["window", "document", "matchMedia"]) saved[k] = (globalThis as any)[k];
    (globalThis as any).window = win;
    (globalThis as any).document = win!.document;
    (win as any).matchMedia = () => ({ matches: false });
    (globalThis as any).matchMedia = (win as any).matchMedia;
  });
  afterAll(() => {
    for (const k of Object.keys(saved)) (globalThis as any)[k] = saved[k];
  });

  function setup() {
    win!.document.body.innerHTML = FORM;
    const doc = win!.document as unknown as Document;
    const calls: string[] = [];
    const cursor = {
      moveTo: vi.fn(async () => void calls.push("move")),
      ripple: vi.fn(() => void calls.push("ripple")),
      say: vi.fn((t: string | null) => void calls.push(`say:${t}`)),
      show: vi.fn(),
      hide: vi.fn(() => void calls.push("hide")),
      getPos: () => ({ x: 0, y: 0 }),
    };
    const sleeps: number[] = [];
    const sleep = async (ms: number) => void sleeps.push(ms);
    return { doc, cursor, calls, sleeps, sleep };
  }

  it("types char by char at cps, firing input events", async () => {
    const { doc, cursor, sleeps, sleep } = setup();
    const seen: string[] = [];
    doc.querySelector("input")!.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    await runGhost([{ type: { selector: "input", text: "abc", cps: 10 } }], { doc, cursor, sleep });
    expect(seen).toEqual(["a", "ab", "abc"]);
    expect(sleeps.filter((s) => s === 100)).toHaveLength(3);
    expect(doc.activeElement).toBe(doc.querySelector("input"));
  });

  it("click dispatches a real click and hides the cursor after", async () => {
    const { doc, cursor, sleep, calls } = setup();
    const onClick = vi.fn();
    doc.querySelector("button")!.addEventListener("click", onClick);
    await runGhost([{ say: "hi" }, { click: "button" }, { wait: 5 }], { doc, cursor, sleep });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe("say:hi");
    expect(calls.at(-1)).toBe("hide");
  });

  it("moveTo accepts {x,y}", async () => {
    const { doc, cursor, sleep } = setup();
    await runGhost([{ moveTo: { x: 5, y: 9 } }], { doc, cursor, sleep });
    expect(cursor.moveTo).toHaveBeenCalledWith({ x: 5, y: 9 }, { instant: false });
  });

  it("ghostAddRow fills textboxes by label and submits the form", async () => {
    const { doc, cursor, sleep } = setup();
    const submitted: Record<string, string> = {};
    doc.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const [a, b] = Array.from(doc.querySelectorAll("input")) as HTMLInputElement[];
      submitted.name = a.value;
      submitted.price = b.value;
    });
    const root = findAddRowForm(doc)!;
    await ghostAddRow(root, { Price: "4.50", Name: "Latte" }, { doc, cursor, sleep });
    expect(submitted).toEqual({ name: "Latte", price: "4.50" });
  });

  it("buildAddRowSteps orders type steps then click; arrays are positional", () => {
    setup();
    const steps = buildAddRowSteps(win!.document.querySelector("form") as unknown as Element, ["A", "B"]);
    const kinds = steps.map((s: GhostStep) => Object.keys(s)[0]);
    expect(kinds).toEqual(["type", "wait", "type", "wait", "click"]);
  });

  it("aborts via signal", async () => {
    const { doc, cursor, sleep } = setup();
    const ac = new AbortController();
    ac.abort();
    await expect(runGhost([{ wait: 1 }], { doc, cursor, sleep, signal: ac.signal })).rejects.toThrow();
    expect(cursor.hide).toHaveBeenCalled();
  });

  it("reduced motion jumps without gliding", async () => {
    const mm = (globalThis as any).matchMedia;
    (globalThis as any).matchMedia = () => ({ matches: true });
    try {
      const c = new GhostController();
      await c.moveTo({ x: 300, y: 300 });
      expect(c.getPos()).toEqual({ x: 300, y: 300 });
    } finally {
      (globalThis as any).matchMedia = mm;
    }
  });
});

describe("GhostController (node)", () => {
  it("glides to the target and ends exactly there", async () => {
    const c = new GhostController();
    const seen: number[] = [];
    c.subscribe(() => seen.push(c.getPos().x));
    await c.moveTo({ x: 200, y: 100 });
    expect(c.getPos()).toEqual({ x: 200, y: 100 });
    expect(seen.length).toBeGreaterThan(3);
    expect(c.getState().visible).toBe(true);
  });
  it("instant jumps in one update", async () => {
    const c = new GhostController();
    let n = 0;
    c.subscribe(() => n++);
    await c.moveTo({ x: 50, y: 60 }, { instant: true });
    expect(c.getPos()).toEqual({ x: 50, y: 60 });
    expect(n).toBeLessThanOrEqual(2);
  });
  it("say and hide update state", () => {
    const c = new GhostController();
    c.say("hello");
    expect(c.getState().caption).toBe("hello");
    c.hide();
    expect(c.getState().caption).toBeNull();
  });
});
