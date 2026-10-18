import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_TOAST_TEXT,
  MODE_STORAGE_KEY,
  createMemoryStore,
  hashBody,
  installReplay,
  requestKey,
  responseFromRecording,
  type Recording,
  type ReplayStore,
} from "./index";

describe("key hashing", () => {
  it("ignores JSON key order and whitespace", () => {
    expect(hashBody('{"a":1,"b":{"x":1,"y":2}}')).toBe(hashBody('{ "b": {"y":2, "x":1}, "a": 1 }'));
  });
  it("differs on content and is 8 hex chars", () => {
    expect(hashBody('{"a":1}')).not.toBe(hashBody('{"a":2}'));
    expect(hashBody("x")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("includes method and path", () => {
    expect(requestKey("post", "/api/generate", "{}")).toMatch(/^POST \/api\/generate [0-9a-f]{8}$/);
  });
});

const rec = (over: Partial<Recording>): Recording => ({
  key: "k", method: "POST", path: "/api/generate", bodyHash: "h", createdAt: 1, status: 200, statusText: "OK",
  headers: [["content-type", "application/x-ndjson"]], latency: 100, kind: "ndjson", chunks: [], body: "", ...over,
});

describe("NDJSON timing reconstruction", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits chunks at original relative times after latency", async () => {
    const r = await responseFromRecording(
      rec({ chunks: [{ t: 0, text: '{"a":1}\n' }, { t: 500, text: '{"b":2}\n' }] }),
    );
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    const seen: [number, string][] = [];
    const t0 = Date.now();
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        seen.push([Date.now() - t0, dec.decode(value)]);
      }
    })();
    await vi.advanceTimersByTimeAsync(99);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([[100, '{"a":1}\n']]);
    await vi.advanceTimersByTimeAsync(500);
    await pump;
    expect(seen[1]).toEqual([600, '{"b":2}\n']);
  });

  it("delays JSON by original latency", async () => {
    let done = false;
    const p = responseFromRecording(rec({ kind: "body", body: '{"ok":true}', latency: 300, headers: [] })).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await (await p).json()).toEqual({ ok: true });
  });
});

/** Minimal DOM double: enough for the replay dot and toast (createElement, body, remove, isConnected). */
interface FakeEl {
  textContent: string;
  innerHTML: string;
  style: { cssText: string };
  attrs: Record<string, string>;
  children: FakeEl[];
  isConnected: boolean;
  setAttribute(k: string, v: string): void;
  appendChild(el: FakeEl): FakeEl;
  remove(): void;
}
function fakeDoc() {
  const body = {
    children: [] as FakeEl[],
    appendChild(el: FakeEl) {
      el.isConnected = true;
      this.children.push(el);
      return el;
    },
  };
  const doc = {
    body,
    createElement(): FakeEl {
      const el: FakeEl = {
        textContent: "",
        innerHTML: "",
        style: { cssText: "" },
        attrs: {},
        children: [],
        isConnected: false,
        setAttribute(k, v) {
          this.attrs[k] = v;
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        remove() {
          this.isConnected = false;
          body.children = body.children.filter((c) => c !== el);
        },
      };
      return el;
    },
  };
  const toasts = () => body.children.filter((c) => c.attrs.role === "status");
  return { doc: doc as unknown as Document, body, toasts };
}

const JSON_HEADERS: [string, string][] = [["content-type", "application/json"]];

function jsonRecording(bodyText: string, path: string, method: string, payload: string): Recording {
  return rec({
    key: requestKey(method, path, payload),
    method,
    path,
    kind: "body",
    headers: JSON_HEADERS,
    latency: 0,
    body: bodyText,
    createdAt: 1,
  });
}

function mk(opts: { doc?: Document; store?: ReplayStore; mode?: "record" | "replay" } = {}) {
  const listeners: Record<string, (e: any) => void> = {};
  const data: Record<string, string> = {};
  if (opts.mode) data[MODE_STORAGE_KEY] = opts.mode;
  const real = vi.fn(async (_i: any, _init?: any) =>
    new Response('{"n":1}', { status: 200, headers: { "content-type": "application/json" } }),
  );
  const win: any = {
    fetch: real,
    location: { href: "http://localhost/" },
    addEventListener: (t: string, f: any) => (listeners[t] = f),
    removeEventListener: () => {},
  };
  const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
  const store = opts.store ?? createMemoryStore();
  const ctl = installReplay({ win, storage, store, doc: opts.doc });
  return { win, real, ctl, store, listeners, data };
}

describe("mode toggling and record/replay", () => {
  it("defaults to record, toggles with Ctrl+Shift+R and persists", () => {
    const { ctl, listeners, data } = mk();
    expect(ctl.getMode()).toBe("record");
    const preventDefault = vi.fn();
    listeners.keydown({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: "R", preventDefault });
    expect(ctl.getMode()).toBe("replay");
    expect(preventDefault).toHaveBeenCalled();
    expect(data[MODE_STORAGE_KEY]).toBe("replay");
    listeners.keydown({ ctrlKey: true, shiftKey: false, key: "r", preventDefault });
    expect(ctl.getMode()).toBe("replay");
    listeners.keydown({ ctrlKey: true, shiftKey: true, key: "r", preventDefault });
    expect(ctl.getMode()).toBe("record");
  });

  it("records, then replays without hitting the network on a fallback", async () => {
    const { win, real, ctl } = mk();
    const body = JSON.stringify({ prompt: "hi" });
    const res = await win.fetch("/api/generate", { method: "POST", body });
    expect(await res.json()).toEqual({ n: 1 });
    await new Promise((r) => setTimeout(r, 10));
    ctl.setMode("replay");
    real.mockClear();
    const r2 = await win.fetch("/api/generate", { method: "POST", body: JSON.stringify({ prompt: "other" }) });
    expect(await r2.json()).toEqual({ n: 1 });
    expect(real).not.toHaveBeenCalled();
    await win.fetch("/api/other", {});
    expect(real).toHaveBeenCalledTimes(1);
  });
});

describe("replay safety: exact match vs fallback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Let the replay path reach its timer (the store lookup is async) before the fake clock advances. */
  const flush = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
  };

  const generateBody = JSON.stringify({ prompt: "a bakery" });
  const otherBody = JSON.stringify({ prompt: "a gym" });

  it("serves an exact body match with no toast", async () => {
    const store = createMemoryStore();
    await store.put(jsonRecording('{"from":"bakery"}', "/api/generate", "POST", generateBody));
    const { doc, toasts } = fakeDoc();
    const { win, real } = mk({ doc, store, mode: "replay" });

    const p = win.fetch("/api/generate", { method: "POST", body: generateBody });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    const res = await p;
    expect(await res.json()).toEqual({ from: "bakery" });
    expect(real).not.toHaveBeenCalled();
    expect(toasts()).toHaveLength(0);
  });

  it("serves the latest run for the path only with a visible toast when no exact match exists", async () => {
    const store = createMemoryStore();
    await store.put(jsonRecording('{"from":"bakery"}', "/api/generate", "POST", generateBody));
    const { doc, toasts } = fakeDoc();
    const { win, real } = mk({ doc, store, mode: "replay" });

    const p = win.fetch("/api/generate", { method: "POST", body: otherBody });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    const res = await p;
    expect(await res.json()).toEqual({ from: "bakery" });
    expect(real).not.toHaveBeenCalled();

    const shown = toasts();
    expect(shown).toHaveLength(1);
    // Children are [icon, label]; the label carries the text.
    const [icon, label] = shown[0].children;
    expect(label.textContent).toBe("Replay mode: no exact match — showing the last recorded run");
    expect(label.textContent).toBe(FALLBACK_TOAST_TEXT);
    expect(icon.innerHTML).toContain("<svg");
    expect(icon.attrs["aria-hidden"]).toBe("true");
    expect(shown[0].attrs["aria-live"]).toBe("polite");
    expect(shown[0].style.cssText).toContain("var(--color-surface)");
    expect(shown[0].style.cssText).toContain("color:var(--color-ink-2)");
    expect(shown[0].style.cssText).toContain("height:32px");
    expect(shown[0].style.cssText).toContain("bottom:96px");
    expect(shown[0].style.cssText).not.toContain("top:56px");
  });

  it.each(["/api/route-intent", "/api/canvas-ops"])("never falls back to the latest run for %s", async (path) => {
    const store = createMemoryStore();
    await store.put(jsonRecording('{"stale":true}', path, "POST", generateBody));
    const { doc, toasts } = fakeDoc();
    const { win, real } = mk({ doc, store, mode: "replay" });

    const p = win.fetch(path, { method: "POST", body: otherBody });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(real).toHaveBeenCalledTimes(1);
    expect(toasts()).toHaveLength(0);

    const q = win.fetch(path, { method: "POST", body: generateBody });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(await (await q).json()).toEqual({ stale: true });
    expect(real).toHaveBeenCalledTimes(1);
  });

  it("keeps the toast up until replay is switched off", async () => {
    const store = createMemoryStore();
    await store.put(jsonRecording('{"from":"bakery"}', "/api/generate", "POST", generateBody));
    const { doc, toasts } = fakeDoc();
    const { win, ctl } = mk({ doc, store, mode: "replay" });

    const p = win.fetch("/api/generate", { method: "POST", body: otherBody });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(toasts()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(toasts()).toHaveLength(1);
    ctl.setMode("record");
    expect(toasts()).toHaveLength(0);
  });

  it.each(["/api/canvas-ops", "/api/route-intent", "/api/edit-node"])("replays %s from a recording", async (path) => {
    const store = createMemoryStore();
    const body = JSON.stringify({ x: 1 });
    await store.put(jsonRecording('{"from":"rec"}', path, "POST", body));
    const { win, real } = mk({ store, mode: "replay" });
    const p = win.fetch(path, { method: "POST", body });
    await flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(await (await p).json()).toEqual({ from: "rec" });
    expect(real).not.toHaveBeenCalled();
  });

  it("records a stream:true NDJSON response chunk by chunk and replays it", async () => {
    const store = createMemoryStore();
    const body = JSON.stringify({ prompt: "p", stream: true });
    const enc = new TextEncoder();
    const live = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(enc.encode('{"a":1}\n{"a'));
            c.enqueue(enc.encode('":2}\n'));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/x-ndjson" } },
      );
    const rec = mk({ store });
    rec.real.mockImplementation(async () => live());
    const res = await rec.win.fetch("/api/generate", { method: "POST", body });
    expect(await res.text()).toBe('{"a":1}\n{"a":2}\n');
    for (let i = 0; i < 50; i++) await Promise.resolve();
    const saved = await store.getByKey(requestKey("POST", "/api/generate", body));
    expect(saved?.kind).toBe("ndjson");
    expect(saved?.chunks.map((c) => c.text).join("")).toBe('{"a":1}\n{"a":2}\n');

    rec.ctl.setMode("replay");
    const p = rec.win.fetch("/api/generate", { method: "POST", body });
    await flush();
    await vi.advanceTimersByTimeAsync(10);
    expect(await (await p).text()).toBe('{"a":1}\n{"a":2}\n');
  });

  it("passes through to the network when no recording exists for the path, with no toast", async () => {
    const { doc, toasts } = fakeDoc();
    const { win, real } = mk({ doc, mode: "replay" });

    const res = await win.fetch("/api/generate", { method: "POST", body: generateBody });
    expect(await res.json()).toEqual({ n: 1 });
    expect(real).toHaveBeenCalledTimes(1);
    expect(toasts()).toHaveLength(0);
  });

  it("does not show a toast in record mode", async () => {
    const { doc, toasts } = fakeDoc();
    const { win, real } = mk({ doc, mode: "record" });

    const p = win.fetch("/api/generate", { method: "POST", body: generateBody });
    await p;
    expect(real).toHaveBeenCalledTimes(1);
    expect(toasts()).toHaveLength(0);
  });
});

describe("ask / locate / extract / lift replay", () => {
  const paths = ["/api/ask", "/api/locate", "/api/extract", "/api/lift"];
  const setup = (mode: "record" | "replay") => {
    const store = createMemoryStore();
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ echo: init?.body }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const win = { addEventListener: vi.fn(), removeEventListener: vi.fn(), fetch: fetchMock as unknown as typeof fetch, location: { href: "http://localhost/" } };
    const c = installReplay({ store, win, storage: { getItem: () => mode, setItem: () => {} } });
    return { store, calls, win, c };
  };

  it.each(paths)("records %s and replays an exact match with no network call", async (p) => {
    const rec = setup("record");
    const body = JSON.stringify({ q: "a", n: 1 });
    await rec.win.fetch(p, { method: "POST", body });
    await new Promise((r) => setTimeout(r, 20));
    expect(rec.calls).toHaveLength(1);
    rec.c.setMode("replay");
    const res = await rec.win.fetch(p, { method: "POST", body: JSON.stringify({ n: 1, q: "a" }) });
    expect(await res.json()).toEqual({ echo: body });
    expect(rec.calls).toHaveLength(1);
    rec.c.uninstall();
  });

  it.each(paths)("does not fall back to the latest run for %s on a different body", async (p) => {
    const rec = setup("record");
    await rec.win.fetch(p, { method: "POST", body: JSON.stringify({ t: "one" }) });
    await new Promise((r) => setTimeout(r, 20));
    rec.c.setMode("replay");
    const res = await rec.win.fetch(p, { method: "POST", body: JSON.stringify({ t: "two" }) });
    expect(await res.json()).toEqual({ echo: JSON.stringify({ t: "two" }) });
    expect(rec.calls).toHaveLength(2);
    rec.c.uninstall();
  });
});
