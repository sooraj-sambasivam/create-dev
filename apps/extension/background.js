// Lift: the toolbar / Alt+Shift+P arms pointer mode; content.js (also auto-injected) does the pointing.
// Network calls and tab capture run here so page CSP and CORS never apply.
const DEFAULTS = { apiOrigin: "http://localhost:3002", webOrigin: "http://localhost:5176", voice: false };

async function settings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["timeline.js", "content.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "arm" });
  } catch (err) {
    console.warn("Create: cannot point on this page", err);
  }
});

async function post(path, body) {
  const { apiOrigin } = await settings();
  let res;
  try {
    res = await fetch(`${apiOrigin.replace(/\/+$/, "")}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Cannot reach Create. Is it running?");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Create said ${res.status}`);
  return json;
}

async function getJson(path) {
  const { apiOrigin } = await settings();
  let res;
  try {
    res = await fetch(`${apiOrigin.replace(/\/+$/, "")}${path}`, { cache: "no-store" });
  } catch {
    throw new Error("Cannot reach Create. Is it running?");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Create said ${res.status}`);
  return json;
}

/** Recent pointer traces (client stages and /api/locate traces). Kept in memory for the e2e test and the demo. */
globalThis.__createTraces = [];
function keepTrace(t) { globalThis.__createTraces.push(t); if (globalThis.__createTraces.length > 100) globalThis.__createTraces.shift(); }

const toBase64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Visible tab -> PNG/JPEG data URL of one rect (CSS px), scaled by the real capture ratio and capped at 4MB. */
async function captureCrop(tab, rect, viewport) {
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const bmp = await createImageBitmap(await (await fetch(shot)).blob());
  const k = bmp.width / viewport.w; // devicePixelRatio, measured instead of assumed
  const sx = Math.round(rect.x * k), sy = Math.round(rect.y * k);
  const sw = Math.max(1, Math.min(bmp.width - sx, Math.round(rect.w * k)));
  const sh = Math.max(1, Math.min(bmp.height - sy, Math.round(rect.h * k)));
  for (const [maxSide, type, quality] of [[1568, "image/png"], [1280, "image/jpeg", 0.85], [800, "image/jpeg", 0.75]]) {
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    const blob = await canvas.convertToBlob(quality ? { type, quality } : { type });
    const url = `data:${type};base64,${toBase64(await blob.arrayBuffer())}`;
    if (url.length <= 3_900_000) return url;
  }
  throw new Error("That chart is too large to read");
}

/** Visible tab -> JPEG data URL of one rect (CSS px), at most 60 KB: width steps down, then quality. */
async function captureThumb(tab, rect, viewport) {
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const bmp = await createImageBitmap(await (await fetch(shot)).blob());
  const k = bmp.width / viewport.w;
  const sx = Math.round(rect.x * k), sy = Math.round(rect.y * k);
  const sw = Math.max(1, Math.min(bmp.width - sx, Math.round(rect.w * k)));
  const sh = Math.max(1, Math.min(bmp.height - sy, Math.round(rect.h * k)));
  for (const maxW of [420, 320, 240, 160]) {
    const scale = Math.min(1, maxW / sw, (maxW * 0.7) / sh);
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
    for (const quality of [0.82, 0.66, 0.5]) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (blob.size <= 60_000) return `data:image/jpeg;base64,${toBase64(await blob.arrayBuffer())}`;
    }
  }
  throw new Error("Thumbnail too large");
}

/** The lift response url, pointed at the configured web origin when the server answered with a localhost one. */
function openUrl(url, webOrigin) {
  const base = webOrigin.replace(/\/+$/, "");
  try {
    const u = new URL(url, base);
    return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? `${base}${u.pathname}${u.search}${u.hash}` : u.href;
  } catch {
    return `${base}/`;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = {
    capture: async () => ({ ok: true, image: await captureCrop(sender.tab, msg.rect, msg.viewport) }),
    // Tray: a small JPEG of the circled region (<= 60 KB), then the item itself. Older servers answer 404; that is fine.
    trayShot: async () => ({ ok: true, image: await captureThumb(sender.tab, msg.rect, msg.viewport) }),
    tray: async () => {
      const p = msg.payload || {};
      const r = await post("/api/tray", {
        title: String(p.title || "Snippet").slice(0, 200), kind: String(p.kind || "snippet").slice(0, 40),
        ...(p.thumbnail ? { thumbnail: p.thumbnail } : {}), ...(p.snippetHtml ? { snippetHtml: p.snippetHtml, styles: p.styles || {} } : {}), source: p.source || { app: "extension" },
      });
      return { ok: true, item: r.item };
    },
    extract: async () => {
      const r = await post("/api/extract", { image: msg.image, ...(msg.hint ? { hint: msg.hint } : {}) });
      return { ok: true, entity: r.entity, provider: r.provider };
    },
    // Cloud locate for targets the DOM cannot decide (images, charts, free-hand loops). Never throws past this point.
    locate: async () => {
      const t0 = Date.now();
      try {
        const input = { source: "extension", image: msg.image, ...(msg.imageSize ? { imageSize: msg.imageSize } : {}), ...(msg.cursor ? { cursor: msg.cursor } : {}), ...(msg.dom ? { dom: msg.dom } : {}), ...(msg.hint ? { hint: msg.hint } : {}), ...(msg.utterance ? { utterance: msg.utterance } : {}) };
        const r = await post("/api/locate", { input, mode: msg.mode === "hover" ? "hover" : "commit" });
        keepTrace({ kind: "locate", ms: Date.now() - t0, ok: true, id: r.trace?.id, stages: r.trace?.stages?.length ?? 0, ask: r.ask || null });
        return { ok: true, result: r.result ?? null, ask: r.ask, traceId: r.trace?.id };
      } catch (err) {
        const error = err instanceof Error ? err.message : "Locate failed";
        keepTrace({ kind: "locate", ms: Date.now() - t0, ok: false, error });
        return { ok: false, error };
      }
    },
    // Client-side stage timings (hover to label, command to done).
    trace: async () => {
      const stage = { stage: msg.stage, provider: msg.provider, ms: Math.max(0, Math.round(msg.ms)), ok: msg.ok !== false, ...(msg.error ? { error: String(msg.error).slice(0, 500) } : {}) };
      keepTrace({ kind: "client", ...stage });
      post("/api/traces", { source: "extension", traceId: msg.traceId, stages: [stage] }).catch((e) => console.info("Create: trace not posted (" + (e?.message || e) + ")"));
      return { ok: true };
    },
    traces: async () => ({ ok: true, traces: globalThis.__createTraces }),
    // Single-use ElevenLabs realtime token (the API key stays on the server). A batch answer means no realtime voice.
    "voice-token": async () => {
      const r = await getJson("/api/voice-token");
      return r.provider === "elevenlabs" && r.token ? { ok: true, token: r.token } : { ok: false, error: r.reason || "No realtime voice" };
    },
    lift: async () => {
      const snap = msg.snapshot && JSON.stringify(msg.snapshot).length <= 150_000 ? { snapshot: msg.snapshot } : {};
      const r = await post("/api/lift", { entity: msg.entity, ...(msg.instruction ? { instruction: msg.instruction } : {}), ...snap });
      const { webOrigin } = await settings();
      const url = openUrl(r.url, webOrigin);
      await chrome.tabs.create({ url });
      // Tell the tray app about the new app. Older servers answer 404; that is fine.
      post("/api/tray", { title: String(msg.entity?.title || "Untitled").slice(0, 200), kind: String(msg.entity?.kind || "table").slice(0, 40), url }).catch(() => {});
      return { ok: true, url, id: r.id, formId: r.formId, provider: r.provider };
    },
  }[msg?.type];
  if (!run) return false;
  run().then(sendResponse, (err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : "Failed" }));
  return true;
});

/**
 * Scribe realtime for the content script. The socket lives here (page CSP never applies); the content script captures the mic,
 * stamps the first sample on its own performance.now clock and streams 16 kHz PCM over a port. Server messages go back unchanged:
 * word times arrive as seconds from the first sample sent, so the content script can place them on the page timeline.
 * VAD commit after 0.5 s of silence, word timestamps on.
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "scribe") return;
  let ws = null;
  let closed = false;
  const queue = [];
  const send = (obj) => {
    const data = JSON.stringify(obj);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    else if (!closed) queue.push(data);
  };
  const safePost = (m) => { try { port.postMessage(m); } catch { /* tab went away */ } };
  port.onMessage.addListener((m) => {
    if (m?.type === "open" && !ws && typeof m.token === "string") {
      const q = new URLSearchParams({
        model_id: "scribe_v2_realtime", audio_format: "pcm_16000", commit_strategy: "vad", vad_silence_threshold_secs: "0.5",
        include_timestamps: "true", token: m.token,
      });
      ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${q}`);
      ws.onopen = () => { for (const d of queue.splice(0)) ws.send(d); };
      ws.onmessage = (e) => { try { safePost({ type: "msg", msg: JSON.parse(e.data) }); } catch { /* not JSON */ } };
      ws.onerror = () => safePost({ type: "closed", error: "socket error" });
      ws.onclose = () => { if (!closed) safePost({ type: "closed" }); };
    } else if (m?.type === "audio" && typeof m.b64 === "string") {
      send({ message_type: "input_audio_chunk", audio_base_64: m.b64, sample_rate: 16000, commit: false });
    } else if (m?.type === "commit") {
      send({ message_type: "input_audio_chunk", audio_base_64: "", sample_rate: 16000, commit: true });
    }
  });
  port.onDisconnect.addListener(() => { closed = true; queue.length = 0; try { ws?.close(); } catch { /* not open */ } });
});
