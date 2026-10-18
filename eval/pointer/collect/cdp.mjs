// Minimal CDP client for the cached Playwright Chromium. No npm deps.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const c = [];
  for (const d of readdirSync(root)) {
    if (d.startsWith("chromium-")) c.push(join(root, d, "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"));
    else if (d.startsWith("chromium_headless_shell-")) c.push(join(root, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"));
  }
  const hit = c.find(existsSync);
  if (!hit) throw new Error("no Playwright Chromium under " + root);
  return hit;
}

/** Launch (or attach to CDP_PORT) and return a page session. */
export async function openBrowser({ port = Number(process.env.CDP_PORT) || 0 } = {}) {
  let chrome = null;
  if (!port) {
    port = 9600 + Math.floor(Math.random() * 300);
    chrome = spawn(findChrome(), [
      `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "ptr-corpus-"))}`,
      "--headless=new", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars=false",
      "--window-size=1440,900", "--lang=en-US", "about:blank",
    ], { stdio: "ignore" });
  }
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error("chrome did not expose CDP");
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else listeners.forEach((l) => l(d));
  };
  const send = (method, params = {}, ms = 45000) => new Promise((res, rej) => {
    const i = ++id; const to = setTimeout(() => { pending.delete(i); rej(new Error("CDP timeout " + method)); }, ms);
    pending.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  listeners.push((d) => { if (d.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); });
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("Accessibility.enable").catch(() => {});
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const close = () => { try { ws.close(); } catch {} if (chrome) try { chrome.kill("SIGKILL"); } catch {} };
  return { send, ev, close, listeners, port };
}

export async function setViewport(b, w = 1440, h = 900) {
  await b.send("Network.enable").catch(() => {});
  await b.send("Network.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36", acceptLanguage: "en-US,en", platform: "MacIntel" }).catch(() => {});
  await b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
}

export async function goto(b, url, { settle = 2500, readyExpr } = {}) {
  await b.send("Page.navigate", { url });
  const t = Date.now();
  while (Date.now() - t < 30000) {
    try { if ((await b.ev("document.readyState")) === "complete") break; } catch {}
    await sleep(200);
  }
  if (readyExpr) { const t2 = Date.now(); while (Date.now() - t2 < 20000) { try { if (await b.ev(readyExpr)) break; } catch {} await sleep(250); } }
  await sleep(settle);
}

export async function screenshot(b, file, opts = {}) {
  const r = await b.send("Page.captureScreenshot", { format: "png", ...opts });
  writeFileSync(file, Buffer.from(r.data, "base64"));
}
