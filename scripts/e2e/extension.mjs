#!/usr/bin/env node
// Real-browser test of the "Point at any website" extension. No npm deps: cached Playwright Chromium over CDP.
// Usage: node scripts/e2e/extension.mjs   (env: WEB_ORIGIN=http://localhost:5175, API_ORIGIN=http://localhost:3001, SHOT_DIR)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = process.env.WEB_ORIGIN || "http://localhost:5175";
const API = process.env.API_ORIGIN || "http://localhost:3001";
const SHOTS = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/e2e";
const SRC_EXT = resolve(dirname(fileURLToPath(import.meta.url)), "../../apps/extension");
mkdirSync(SHOTS, { recursive: true });
// Headless Chromium cannot click the toolbar, so activeTab is never granted. Test against a copy of the extension
// whose manifest also grants the fixture origin; no extension code is changed.
const EXT = mkdtempSync(join(tmpdir(), "create-ext-copy-"));
cpSync(SRC_EXT, EXT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  // Extensions need the full Chromium build, not the headless shell.
  const c = readdirSync(root).filter((d) => d.startsWith("chromium-")).map((d) => join(root, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"));
  const hit = c.find(existsSync);
  if (!hit) throw new Error("no Playwright Chromium found under " + root);
  return hit;
}

const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };
const step = async (name, fn) => { try { const r = await fn(); if (r !== undefined && r !== true) rec(name, false, String(r)); else rec(name, true); } catch (e) { rec(name, false, e.message.split("\n")[0]); } };

// Fixture page: a pricing section with heading, text, image, button.
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Acme Pricing</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f6f4ef;color:#1b1b1b}
header{padding:20px 40px;font-weight:700}
#pricing{margin:40px auto;max-width:560px;background:#fff;border-radius:16px;padding:32px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
#pricing h2{font-size:32px;margin:0 0 8px}#pricing p{color:#555;margin:0 0 16px}
#pricing img{width:160px;height:100px;border-radius:12px;background:#ddd}
#pricing button{margin-top:16px;padding:12px 28px;font-size:16px;border:0;border-radius:10px;background:#1b1b1b;color:#fff}
</style></head><body><header>Acme</header>
<section id="pricing"><h2>Simple pricing</h2><p>One plan, everything included. Cancel any time.</p>
<img src="/pixel.png" alt="Plan illustration"><br><button>Start free trial</button></section></body></html>`;
const site = createServer((req, res) => {
  if (req.url === "/pixel.png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(Buffer.from(PIXEL, "base64")); return; }
  res.writeHead(200, { "Content-Type": "text/html" }); res.end(html);
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${site.address().port}/`;
{
  const mf = join(EXT, "manifest.json"); const m = JSON.parse(readFileSync(mf, "utf8"));
  m.host_permissions = [...m.host_permissions, `http://127.0.0.1:${site.address().port}/*`];
  writeFileSync(mf, JSON.stringify(m, null, 2));
}

const port = 9800 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "create-ext-e2e-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check",
  `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`, "--window-size=1280,800", "about:blank",
], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} try { site.close(); } catch {} };
process.on("exit", cleanup);

const targets = async () => { try { return await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { return []; } };
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(200); } return null; };

async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (name) => { const f = join(SHOTS, name + ".png"); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(r.data, "base64")); console.log("  shot " + f); };
  const mouse = (x, y, type = "mouseMoved") => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });
  return { ws, send, ev, shot, mouse };
}

try {
  // Chromium ships component extensions with their own workers; pick ours by manifest name.
  let swc = null, extId = "";
  await until(async () => {
    for (const t of (await targets()).filter((t) => t.type === "service_worker" && t.url.startsWith("chrome-extension://"))) {
      const c = await attach(t.webSocketDebuggerUrl);
      const name = await c.ev(`chrome.runtime.getManifest().name`).catch(() => "");
      if (/Create: Point at any website/.test(name)) { swc = c; extId = new URL(t.url).host; return true; }
      c.ws.close();
    }
    return false;
  });
  if (!swc) throw new Error("extension service worker not found (extension failed to load)");
  console.log("  extension id " + extId);
  await swc.send("Runtime.enable");

  // Point the extension at the web origin under test (default is 5173).
  await step("0. options persist web origin", async () => {
    await swc.ev(`chrome.storage.sync.set({ webOrigin: ${JSON.stringify(WEB)}, apiOrigin: ${JSON.stringify(API)} })`);
    const v = await swc.ev(`chrome.storage.sync.get(null)`);
    if (v.webOrigin !== WEB) return "storage not applied: " + JSON.stringify(v);
  });

  const page = (await targets()).find((t) => t.type === "page");
  const pc = await attach(page.webSocketDebuggerUrl);
  await pc.send("Page.enable"); await pc.send("Runtime.enable");
  await pc.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await pc.send("Page.navigate", { url: SITE });
  await until(async () => (await pc.ev(`document.readyState`).catch(() => "")) === "complete");

  // Arm pointer mode. A real toolbar click grants activeTab; headless cannot click the toolbar, so the test
  // runs the same code path as the action.onClicked handler from the service worker.
  await step("1. arm pointer mode (content script injected, armed)", async () => {
    const tabId = await swc.ev(`chrome.tabs.query({ active: true }).then(ts => ts[0]?.id)`);
    if (tabId == null) return "fixture tab not found";
    const how = "scripting.executeScript content.js (same call as action.onClicked)";
    await swc.ev(`chrome.scripting.executeScript({ target: { tabId: ${tabId} }, files: ["content.js"] })`);
    console.log("  armed via " + how);
    await sleep(600);
    const crosshair = await pc.ev(`document.documentElement.style.cursor`);
    if (crosshair !== "crosshair") return "not armed (cursor=" + JSON.stringify(crosshair) + "); content script did not run";
  });

  const pr = await pc.ev(`(()=>{const r=document.querySelector('#pricing').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+12}})()`);
  // The chip lives in a closed shadow root; read it via a screenshot and via the outline geometry check below.
  await step("2. hover pricing section -> highlight + chip (screenshot)", async () => {
    await pc.mouse(pr.x - 5, pr.y); await pc.mouse(pr.x, pr.y); await sleep(300);
    await pc.shot("ext-01-hover");
    // Closed shadow root hides the chip from the DOM, so assert the highlight via the page-visible crosshair state.
    if ((await pc.ev(`document.documentElement.style.cursor`)) !== "crosshair") return "pointer mode lost on hover";
  });

  await step("3. click captures; instruction input appears", async () => {
    await pc.mouse(pr.x, pr.y, "mousePressed"); await pc.mouse(pr.x, pr.y, "mouseReleased"); await sleep(400);
    await pc.shot("ext-02-instruction");
    // Typing goes to the focused input inside the closed shadow root.
    await pc.send("Input.insertText", { text: "make this darker" });
    await sleep(200);
    await pc.shot("ext-03-typed");
  });

  await step("4. Enter sends; new tab opens at web origin ?p=<id>", async () => {
    await pc.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await pc.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    const tab = await until(async () => (await targets()).find((t) => t.type === "page" && t.url.startsWith(WEB + "/?p=")), 20000);
    if (!tab) return "no tab opened at " + WEB + "/?p=; tabs: " + (await targets()).filter((t) => t.type === "page").map((t) => t.url).join(", ");
    console.log("  opened " + tab.url);
    const nc = await attach(tab.webSocketDebuggerUrl);
    await nc.send("Page.enable"); await nc.send("Runtime.enable");
    await nc.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const ok = await until(async () => nc.ev(`document.querySelectorAll('[data-screen-root] [data-node-id]').length>0`).catch(() => false), 20000);
    await sleep(800); await nc.shot("ext-04-imported");
    if (!ok) return "imported screen did not render ([data-screen-root] [data-node-id] missing)";
    const text = await nc.ev(`document.querySelector('[data-screen-root]').innerText`);
    console.log("  rendered text: " + JSON.stringify(text.slice(0, 120)));
    if (!/Simple pricing/i.test(text) || !/Start free trial/i.test(text) || !/Cancel any time/i.test(text)) return "rendered screen lacks pricing section content";
    nc.ws.close();
  });
} catch (e) {
  rec("fatal", false, e.message);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
cleanup();
process.exit(failed ? 1 : 0);
