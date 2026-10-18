// Lift: the toolbar / Alt+Shift+P arms pointer mode; content.js (also auto-injected) does the pointing.
// Network calls and tab capture run here so page CSP and CORS never apply.
const DEFAULTS = { apiOrigin: "http://localhost:3001", webOrigin: "http://localhost:5173" };

async function settings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
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
  for (const [maxSide, type, quality] of [[1600, "image/png"], [1280, "image/jpeg", 0.85], [800, "image/jpeg", 0.75]]) {
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
    extract: async () => {
      const r = await post("/api/extract", { image: msg.image, ...(msg.hint ? { hint: msg.hint } : {}) });
      return { ok: true, entity: r.entity, provider: r.provider };
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
