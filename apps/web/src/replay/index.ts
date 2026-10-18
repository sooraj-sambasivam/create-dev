/**
 * Replay fallback for the live demo (decision B6).
 *
 * RECORD mode (default): successful AI API responses are teed into IndexedDB.
 * REPLAY mode: an exact body-hash match is answered from its recording, with the
 * original NDJSON chunk timing / JSON latency. With no exact match, the latest
 * recording for that path is served and a sticky "Replay mode" toast says so
 * (FALLBACK_TOAST_TEXT); it stays until replay is switched off.
 * With no recording for the path at all, the request goes to the network.
 * Toggle with Ctrl+Shift+R. A small dot (title "Replay on") shows while on.
 */

export type ReplayMode = "record" | "replay";

export const REPLAY_PATHS = [
  "/api/generate",
  "/api/generate-sketch",
  "/api/edit-node",
  "/api/canvas-ops",
  "/api/route-intent",
  "/api/demo",
  "/api/transcribe",
] as const;

export const MODE_STORAGE_KEY = "create.replay.mode";

/** Shown when replay answers from the latest run for a path, not an exact body match. */
export const FALLBACK_TOAST_TEXT = "Replay mode: no exact match — showing the last recorded run";

export interface RecordedChunk {
  /** ms since the response started streaming (first byte of the body). */
  t: number;
  text: string;
}

export interface Recording {
  key: string;
  method: string;
  path: string;
  bodyHash: string;
  createdAt: number;
  status: number;
  statusText: string;
  headers: [string, string][];
  /** ms from request start to response headers. */
  latency: number;
  kind: "ndjson" | "body";
  chunks: RecordedChunk[]; // ndjson
  body: string; // non-ndjson
}

export interface ReplayStore {
  put(rec: Recording): Promise<void>;
  /** Most recent recording with exactly this key. */
  getByKey(key: string): Promise<Recording | undefined>;
  /** Most recent recording for method + path (any body). */
  latestForPath(method: string, path: string): Promise<Recording | undefined>;
}

// ---------- hashing ----------

/** Deterministic JSON with sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 32-bit FNV-1a, hex. */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function normalizeBody(body: string | null | undefined): string {
  if (!body) return "";
  try {
    return stableStringify(JSON.parse(body));
  } catch {
    return body;
  }
}

export function hashBody(body: string | null | undefined): string {
  return shortHash(normalizeBody(body));
}

export function requestKey(method: string, path: string, body: string | null | undefined): string {
  return `${method.toUpperCase()} ${path} ${hashBody(body)}`;
}

// ---------- stores ----------

export function createMemoryStore(): ReplayStore {
  const all: Recording[] = [];
  const newest = (xs: Recording[]) => xs.reduce<Recording | undefined>((a, b) => (!a || b.createdAt >= a.createdAt ? b : a), undefined);
  return {
    async put(rec) {
      all.push(rec);
    },
    async getByKey(key) {
      return newest(all.filter((r) => r.key === key));
    },
    async latestForPath(method, path) {
      return newest(all.filter((r) => r.method === method.toUpperCase() && r.path === path));
    },
  };
}

const DB_NAME = "create-replay";
const STORE = "recordings";

export function createIndexedDbStore(idb: IDBFactory): ReplayStore {
  let dbp: Promise<IDBDatabase> | undefined;
  const open = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        os.createIndex("key", "key");
        os.createIndex("route", "route");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  const newest = async (index: string, query: IDBValidKey): Promise<Recording | undefined> => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).index(index).openCursor(IDBKeyRange.only(query), "prev");
      req.onsuccess = () => resolve((req.result?.value as Recording | undefined) ?? undefined);
      req.onerror = () => reject(req.error);
    });
  };

  return {
    async put(rec) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).add({ ...rec, route: `${rec.method} ${rec.path}` });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    getByKey: (key) => newest("key", key),
    latestForPath: (method, path) => newest("route", `${method.toUpperCase()} ${path}`),
  };
}

// ---------- request helpers ----------

async function describeBody(body: unknown): Promise<string> {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((v, k) => {
      parts.push(typeof v === "string" ? `${k}=${v}` : `${k}=<file ${v.name}|${v.size}|${v.type}>`);
    });
    return parts.join("&");
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) return `<blob ${body.size}|${body.type}>`;
  if (body instanceof ArrayBuffer) return `<buf ${body.byteLength}>`;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body.toString();
  return "";
}

function pathOf(input: RequestInfo | URL, base: string): string | undefined {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, base);
    return u.pathname;
  } catch {
    return undefined;
  }
}

const isReplayPath = (p: string | undefined): p is string => !!p && (REPLAY_PATHS as readonly string[]).includes(p);

/** NDJSON by content type, or a `stream: true` request whose reply is not plain JSON (a proxy may drop the type). */
const isNdjson = (res: Response, streamRequested = false) => {
  const type = res.headers.get("content-type") ?? "";
  return /ndjson/i.test(type) || (streamRequested && !!res.body && !/application\/json/i.test(type));
};

const wantsStream = (bodyText: string) => {
  try {
    return (JSON.parse(bodyText) as { stream?: unknown } | null)?.stream === true;
  } catch {
    return false;
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

// ---------- recording / replaying ----------

async function recordResponse(
  store: ReplayStore,
  res: Response,
  meta: { key: string; method: string; path: string; bodyHash: string; startedAt: number; headersAt: number; stream: boolean; now: () => number },
): Promise<void> {
  const ndjson = isNdjson(res, meta.stream);
  const base = {
    key: meta.key,
    method: meta.method,
    path: meta.path,
    bodyHash: meta.bodyHash,
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()] as [string, string][],
    latency: meta.headersAt - meta.startedAt,
  };
  if (!ndjson) {
    const body = await res.text();
    await store.put({ ...base, createdAt: meta.now(), kind: "body", chunks: [], body });
    return;
  }
  const chunks: RecordedChunk[] = [];
  if (res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let t0: number | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = meta.now();
      t0 ??= now;
      const text = dec.decode(value, { stream: true });
      if (text) chunks.push({ t: now - t0, text });
    }
    const tail = dec.decode();
    if (tail) chunks.push({ t: meta.now() - (t0 ?? meta.now()), text: tail });
  }
  await store.put({ ...base, createdAt: meta.now(), kind: "ndjson", chunks, body: "" });
}

/** Build a Response from a recording, replaying the original timing. */
export async function responseFromRecording(rec: Recording, signal?: AbortSignal | null): Promise<Response> {
  const headers = new Headers(rec.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  const init = { status: rec.status, statusText: rec.statusText, headers };
  if (rec.kind === "body") {
    await sleep(rec.latency);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(rec.body, init);
  }
  const enc = new TextEncoder();
  let timers: ReturnType<typeof setTimeout>[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const abort = () => {
        timers.forEach(clearTimeout);
        try {
          controller.error(new DOMException("Aborted", "AbortError"));
        } catch {
          /* closed */
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (rec.chunks.length === 0) {
        timers.push(setTimeout(() => controller.close(), rec.latency));
        return;
      }
      rec.chunks.forEach((c, i) => {
        timers.push(
          setTimeout(() => {
            controller.enqueue(enc.encode(c.text));
            if (i === rec.chunks.length - 1) controller.close();
          }, rec.latency + c.t),
        );
      });
    },
    cancel() {
      timers.forEach(clearTimeout);
      timers = [];
    },
  });
  return new Response(stream, init);
}

// ---------- install ----------

export interface ReplayController {
  getMode(): ReplayMode;
  setMode(mode: ReplayMode): void;
  toggle(): ReplayMode;
  uninstall(): void;
}

export interface InstallOptions {
  store?: ReplayStore;
  now?: () => number;
  /** Test seam; defaults to globalThis. */
  win?: Pick<Window, "addEventListener" | "removeEventListener"> & { fetch: typeof fetch; location?: { href: string } };
  doc?: Document;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

/** lucide `Info` at 18px, stroke 1.75: the icon the in-app info toast uses. */
const INFO_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

export function readMode(storage?: Pick<Storage, "getItem">): ReplayMode {
  try {
    return storage?.getItem(MODE_STORAGE_KEY) === "replay" ? "replay" : "record";
  } catch {
    return "record";
  }
}

let active: ReplayController | undefined;

export function installReplay(opts: InstallOptions = {}): ReplayController {
  if (active && !opts.win) return active;

  const g = globalThis as unknown as Record<string, any>;
  const win = (opts.win ?? g.window ?? g) as NonNullable<InstallOptions["win"]>;
  const doc: Document | undefined = opts.doc ?? g.document;
  const now = opts.now ?? (() => Date.now());
  let storage = opts.storage;
  if (!storage) {
    try {
      storage = g.localStorage;
    } catch {
      storage = undefined;
    }
  }
  const baseHref = win.location?.href ?? "http://localhost/";
  const store: ReplayStore =
    opts.store ?? (g.indexedDB ? createIndexedDbStore(g.indexedDB as IDBFactory) : createMemoryStore());

  const realFetch: typeof fetch = win.fetch.bind(win);
  let mode = readMode(storage);
  let dot: HTMLElement | undefined;
  let toast: HTMLElement | undefined;
  let toastLabel: HTMLElement | undefined;

  const renderDot = () => {
    if (!doc?.body) return;
    if (mode === "replay") {
      if (dot?.isConnected) return;
      dot = doc.createElement("div");
      dot.title = "Replay on";
      dot.setAttribute("aria-label", "Replay on");
      dot.style.cssText =
        "position:fixed;right:12px;bottom:12px;width:8px;height:8px;border-radius:50%;background:var(--color-warn);z-index:2147483647;pointer-events:none";
      doc.body.appendChild(dot);
    } else {
      dot?.remove();
      dot = undefined;
    }
  };

  /** Small sticky status toast, cleared when replay turns off. Colors come from the theme tokens. */
  const TOAST_FADE_MS = 180;
  const reduceMotion = () => {
    try {
      const mm = (win as { matchMedia?: Window["matchMedia"] }).matchMedia;
      return mm?.call(win, "(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
      return false;
    }
  };
  // Bottom-centre above the composer, like the in-app toasts. It sits clear of the card toolbar and title.
  const setToastVisible = (el: HTMLElement, visible: boolean) => {
    el.style.opacity = visible ? "1" : "0";
    el.style.transform = visible ? "translate(-50%,0)" : "translate(-50%,6px)";
  };
  const showToast = (text: string) => {
    if (!doc?.body) return;
    if (!toast || !toastLabel) {
      toast = doc.createElement("div");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.style.cssText =
        "position:fixed;left:50%;bottom:96px;box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;height:32px;max-width:calc(100vw - 32px);padding:0 12px;border-radius:12px;border:1px solid var(--color-line);background:var(--color-surface);color:var(--color-ink-2);box-shadow:var(--shadow-soft);font:14px/20px var(--font-sans);white-space:nowrap;z-index:2147483647;pointer-events:none;transition:opacity 180ms ease-out,transform 180ms ease-out";
      const icon = doc.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.style.cssText = "display:inline-flex;flex:none;color:var(--color-ink-2)";
      icon.innerHTML = INFO_ICON_SVG;
      toastLabel = doc.createElement("span");
      toastLabel.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis";
      toast.appendChild(icon);
      toast.appendChild(toastLabel);
    }
    const el = toast;
    el.style.transition = reduceMotion() ? "none" : `opacity ${TOAST_FADE_MS}ms ease-out,transform ${TOAST_FADE_MS}ms ease-out`;
    toastLabel.textContent = text;
    setToastVisible(el, false);
    if (!el.isConnected) doc.body.appendChild(el);
    // Read a layout property so the hidden state is committed before fading in.
    void el.offsetHeight;
    setToastVisible(el, true);
  };

  const hideToast = () => {
    toast?.remove();
    toast = undefined;
    toastLabel = undefined;
  };

  const setMode = (m: ReplayMode) => {
    mode = m;
    if (m !== "replay") hideToast();
    try {
      storage?.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    renderDot();
  };

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = pathOf(input, baseHref);
    if (!isReplayPath(path)) return realFetch(input, init);

    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    let bodyText: string;
    if (init?.body !== undefined) bodyText = await describeBody(init.body);
    else if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        bodyText = await input.clone().text();
      } catch {
        bodyText = "";
      }
    } else bodyText = "";
    const key = requestKey(method, path, bodyText);

    if (mode === "replay") {
      // Exact body match first. Otherwise the latest run for this path is shown
      // with a visible toast, so another prompt's recording is never silent.
      // With no recording for the path at all, the request goes to the network.
      try {
        const exact = await store.getByKey(key);
        if (exact) return await responseFromRecording(exact, init?.signal);
        const latest = await store.latestForPath(method, path);
        if (latest) {
          showToast(FALLBACK_TOAST_TEXT);
          return await responseFromRecording(latest, init?.signal);
        }
      } catch {
        /* store failure or abort: fall through to network */
      }
      return realFetch(input, init);
    }

    const startedAt = now();
    const res = await realFetch(input, init);
    if (res.ok) {
      const headersAt = now();
      void recordResponse(store, res.clone(), {
        key,
        method,
        path,
        bodyHash: hashBody(bodyText),
        startedAt,
        headersAt,
        stream: wantsStream(bodyText),
        now,
      }).catch(() => {});
    }
    return res;
  };

  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => wrapped(input, init)) as typeof fetch;

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      controller.toggle();
    }
  };
  win.addEventListener("keydown", onKey as EventListener);

  const controller: ReplayController = {
    getMode: () => mode,
    setMode,
    toggle() {
      setMode(mode === "record" ? "replay" : "record");
      return mode;
    },
    uninstall() {
      win.removeEventListener("keydown", onKey as EventListener);
      win.fetch = realFetch;
      dot?.remove();
      hideToast();
      if (active === controller) active = undefined;
    },
  };
  if (!opts.win) active = controller;

  if (doc && !doc.body) doc.addEventListener("DOMContentLoaded", renderDot, { once: true });
  else renderDot();
  return controller;
}
