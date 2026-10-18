#!/usr/bin/env node
// Real-browser test of the "Point at any website" extension. No npm deps: cached Playwright Chromium over CDP.
// Usage: node scripts/e2e/extension.mjs   (env: WEB_ORIGIN=http://localhost:5175, API_ORIGIN=http://localhost:3001, SHOT_DIR)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, dirname, extname } from "node:path";
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

// Fixture pages: the real demo pages in apps/extension/demo, served over http.
const DEMO = join(SRC_EXT, "demo");
const MIME = { ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png" };
const site = createServer((req, res) => {
  const name = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "") || "route-44-schedule.html";
  const file = join(DEMO, name.replace(/\.\.+/g, ""));
  if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" }); res.end(readFileSync(file));
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${site.address().port}/`;

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
  const open = async (file) => {
    await pc.send("Page.navigate", { url: SITE + file });
    await until(async () => (await pc.ev(`location.pathname`).catch(() => "")) === "/" + file && (await pc.ev(`document.readyState`).catch(() => "")) === "complete");
    await sleep(500); // content script (document_idle) attaches
  };
  // The overlay host is a light-DOM div whose data-state / data-chip mirror the closed shadow root.
  const lift = (k) => pc.ev(`(() => { const h = [...document.documentElement.children].find((e) => e.dataset && e.dataset.state); return h ? h.dataset[${JSON.stringify(k)}] || "" : "<no overlay>"; })()`);
  const center = (sel) => pc.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const key = (type, k, code, vk, modifiers = 0) => pc.send("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, modifiers });
  const move = (x, y, modifiers = 0) => pc.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", modifiers });
  const pages = async () => (await targets()).filter((t) => t.type === "page");
  const closeTab = (id) => fetch(`http://127.0.0.1:${port}/json/close/${id}`).catch(() => {});

  /** Hold Option over `sel`, expect the chip, release, send with Enter, then inspect the app that opens. */
  async function liftFlow(tag, file, sel, chipRx, expectRows, expectChart, typed) {
    await step(`${tag}. hold Option over ${file}: highlight + chip`, async () => {
      await open(file);
      const before = new Set((await pages()).map((t) => t.id));
      pc.__before = before;
      const p = await center(sel);
      await key("keyDown", "Alt", "AltLeft", 18, 1);
      await move(p.x - 4, p.y, 1); await move(p.x, p.y, 1);
      await sleep(400);
      await pc.shot(`ext-lift-${tag}-1-hover`);
      const chip = await lift("chip");
      if (!chipRx.test(chip)) return `chip was ${JSON.stringify(chip)}, wanted ${chipRx}`;
      console.log("  chip: " + chip);
    });
    await step(`${tag}. release Option: "Turn this into…" pill`, async () => {
      await sleep(100);
      await key("keyUp", "Alt", "AltLeft", 18);
      await sleep(300);
      if ((await lift("state")) !== "asking") return "state was " + (await lift("state"));
      if (typed) { await pc.send("Input.insertText", { text: typed }); await sleep(150); }
      await pc.shot(`ext-lift-${tag}-2-pill`);
    });
    await step(`${tag}. Enter: progress, then the app opens`, async () => {
      await key("keyDown", "Enter", "Enter", 13); await key("keyUp", "Enter", "Enter", 13);
      const tab = await until(async () => (await pages()).find((t) => !pc.__before.has(t.id) && t.url.startsWith(WEB + "/?p=")), 30000);
      if (!tab) return "no tab opened at " + WEB + "/?p=; tabs: " + (await pages()).map((t) => t.url).join(", ") + "; chip: " + (await lift("chip"));
      console.log("  opened " + tab.url);
      const nc = await attach(tab.webSocketDebuggerUrl);
      await nc.send("Page.enable"); await nc.send("Runtime.enable");
      await nc.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      const rowsJs = `document.querySelectorAll('[data-screen-root] table:not(.sr-only) tbody tr').length`;
      const ok = await until(async () => (await nc.ev(rowsJs).catch(() => 0)) > 0, 30000);
      await sleep(800); await nc.shot(`ext-lift-${tag}-3-app`);
      const rows = ok ? await nc.ev(rowsJs) : 0;
      const charts = await nc.ev(`document.querySelectorAll('[data-screen-root] figure svg[role="img"]').length`);
      const form = await nc.ev(`!!document.querySelector('[data-screen-root] input, [data-screen-root] textarea')`);
      nc.ws.close(); await closeTab(tab.id);
      if (expectRows == null ? rows < 1 : rows !== expectRows) return `app table has ${rows} rows, wanted ${expectRows}`;
      if (expectChart && charts < 1) return "app has no chart";
      if (!form) return "app has no add-row form";
      console.log(`  app: ${rows} rows, ${charts} chart(s), add-row form present`);
    });
  }

  await liftFlow("route44", "route-44-schedule.html", "#timetable tbody tr:nth-child(5)", /^Schedule · 12 rows × 4 cols$/, 12, false);
  await liftFlow("pricing", "pricing.html", ".plans .card:nth-child(2) h3", /^Cards · 3 plans$/, 3, true, "a pricing tracker");

  await step("dining list detected as List · 7 items", async () => {
    await open("dining-hours.html");
    const p = await center("ul.hours li:nth-child(3)");
    await key("keyDown", "Alt", "AltLeft", 18, 1); await move(p.x - 3, p.y, 1); await move(p.x, p.y, 1); await sleep(350);
    const chip = await lift("chip"); await pc.shot("ext-lift-dining-1-hover");
    await key("keyUp", "Alt", "AltLeft", 18); await sleep(200); await key("keyDown", "Escape", "Escape", 27); await key("keyUp", "Escape", "Escape", 27);
    if (chip !== "List · 7 items") return "chip was " + JSON.stringify(chip);
  });

  // Chart image: cropped from a tab screenshot, read by /api/extract (mock when no vision keys), then lifted.
  await liftFlow("chart", "chart.html", "img", /^Chart image$/, null, false);

  await step("toolbar/Alt+Shift+P path: arm, click selects, Esc cancels", async () => {
    await open("dubhacks-schedule.html");
    const tabId = await swc.ev(`chrome.tabs.query({}).then(ts => ts.find(t => t.url.includes("dubhacks-schedule"))?.id)`);
    if (tabId == null) return "fixture tab not found";
    await swc.ev(`chrome.scripting.executeScript({ target: { tabId: ${tabId} }, files: ["content.js"] }).then(() => chrome.tabs.sendMessage(${tabId}, { type: "arm" }))`);
    await sleep(300);
    const p = await center("#schedule tbody tr:nth-child(4)");
    await move(p.x, p.y); await sleep(300);
    const chip = await lift("chip"); await pc.shot("ext-lift-dubhacks-1-armed");
    await pc.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await pc.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
    await sleep(300);
    const st = await lift("state");
    await key("keyDown", "Escape", "Escape", 27); await key("keyUp", "Escape", "Escape", 27); await sleep(200);
    const after = await lift("state");
    if (chip !== "Schedule · 13 rows × 3 cols") return "chip was " + JSON.stringify(chip);
    if (st !== "asking") return "click did not open the pill (state " + st + ")";
    if (after !== "idle") return "Esc did not cancel (state " + after + ")";
  });

} catch (e) {
  rec("fatal", false, e.message);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
cleanup();
process.exit(failed ? 1 : 0);
