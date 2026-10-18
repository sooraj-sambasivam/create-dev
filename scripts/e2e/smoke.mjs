#!/usr/bin/env node
// Real-browser smoke test. No npm deps: launches the cached Playwright Chromium and drives it over CDP.
// Usage: node scripts/e2e/smoke.mjs   (env: BASE_URL, SHOT_DIR, HEADED=1)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5175";
const SHOTS = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/e2e";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const c = [];
  for (const d of readdirSync(root)) {
    if (d.startsWith("chromium_headless_shell-")) c.push(join(root, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"));
    else if (d.startsWith("chromium-")) c.push(join(root, d, "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"));
  }
  const hit = c.find(existsSync);
  if (!hit) throw new Error("no Playwright Chromium found under " + root);
  return hit;
}

const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };
const consoleErrors = [], failedReqs = [], bugs = [];

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "create-e2e-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} };
process.on("exit", cleanup);

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("chrome did not expose CDP");
}

const ws = new WebSocket(await connect());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
  else listeners.forEach((l) => l(d));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
listeners.push((d) => {
  if (d.method === "Runtime.exceptionThrown") consoleErrors.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  if (d.method === "Network.loadingFailed" && !d.params.canceled) failedReqs.push(`${d.params.errorText} ${d.params.requestId}`);
  if (d.method === "Network.responseReceived" && d.params.response.status >= 400) failedReqs.push(`${d.params.response.status} ${d.params.response.url}`);
});

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 15000, step = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(step); } return false; };
const shot = async (name) => { const f = join(SHOTS, name + ".png"); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(r.data, "base64")); console.log("  shot " + f); return f; };
const mouse = (x, y, type = "mouseMoved") => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });
const clickAt = async (x, y) => { await mouse(x, y); await mouse(x, y, "mousePressed"); await mouse(x, y, "mouseReleased"); };
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
const maxFs = (id) => `(()=>{const e=document.querySelector('[data-right-panel] [data-screen-root] [data-node-id="${id}"]');if(!e)return 0;return Math.max(...[e,...e.querySelectorAll('*')].map(x=>parseFloat(getComputedStyle(x).fontSize)||0))})()`;
let skipped = false;
const step = async (name, fn) => { skipped = false; try { const r = await fn(); if (r !== undefined && r !== true) rec(name, false, String(r)); else if (skipped) rec(name, true, "SKIP: hook not present"); else rec(name, true); } catch (e) { rec(name, false, e.message.split("\n")[0]); } };

try {
  const apiUp = await fetch(BASE + "/api/health").then((r) => r.status < 500).catch(() => false);
  if (!apiUp) console.log("  WARN: " + BASE + "/api/* unreachable (api server down?)");
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // (1) load + themes
  for (const scheme of ["light", "dark"]) {
    await step(`1. load + screenshot (${scheme})`, async () => {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      await send("Page.navigate", { url: BASE });
      if (!(await waitFor(`!!document.querySelector('[data-testid="message-input"]')`))) return "composer not found";
      await sleep(600); await shot(`01-load-${scheme}`);
      const bg = await ev(`getComputedStyle(document.body).backgroundColor`);
      const lum = bg.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
      if (scheme === "dark" && lum > 100) return `dark scheme but body bg ${bg}`;
      if (scheme === "light" && lum < 150) return `light scheme but body bg ${bg}`;
    });
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[data-testid="message-input"]')`);

  // (2) prompt -> rendered page
  await step("2. prompt renders a page in right panel", async () => {
    const c = await center('[data-testid="message-input"]');
    await clickAt(c.x, c.y);
    await send("Input.insertText", { text: "A landing page for a coffee shop called Ember" });
    await sleep(150);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    const ok = await waitFor(`document.querySelectorAll('[data-screen-root] [data-node-id]').length>0`, 30000);
    await sleep(800); await shot("02-rendered");
    if (!ok) return "no [data-screen-root] [data-node-id] after 30s";
    const n = await ev(`document.querySelectorAll('[data-screen-root] [data-node-id]').length`);
    console.log("  nodes: " + n);
  });

  // (3) narrate mode + hover bubble
  let target = null;
  await step("3a. open narrate via Go fan", async () => {
    const go = await center('[data-testid="go"]');
    await mouse(go.x, go.y); await sleep(500);
    let nb = await center('[data-testid="narrate-button"]');
    if (!nb) { await ev(`document.querySelector('[data-testid="go"]').focus()`); await sleep(500); nb = await center('[data-testid="narrate-button"]'); }
    if (!nb) { await shot("03-fan-missing"); return "narrate-button not visible after hovering Go"; }
    await sleep(400); nb = await center('[data-testid="narrate-button"]');
    const topEl = await ev(`(()=>{const e=document.elementFromPoint(${nb.x},${nb.y});return e?(e.closest('[data-testid]')?.getAttribute('data-testid')||e.tagName):null})()`);
    await shot("03a-fan-open");
    console.log(`  narrate-button at ${Math.round(nb.x)},${Math.round(nb.y)} topmost=${topEl}`);
    if (topEl !== "narrate-button") { bugs.push("Go fan: narrate-button covered by " + topEl); console.log("  BUG: fan item covered by " + topEl + "; falling back to DOM click"); await ev(`document.querySelector('[data-testid="narrate-button"]').click()`); }
    else await clickAt(nb.x, nb.y);
    await sleep(1200);
    await shot("03a-narrate-open");
    const st = await ev(`document.querySelector('[data-narrate-ignore]')!==null`);
    if (!st) return "no [data-narrate-ignore] overlay element after clicking Narrate";
  });
  await step("3b. hover heading -> pointer bubble label", async () => {
    target = await ev(`(()=>{const els=[...document.querySelectorAll('[data-right-panel] [data-screen-root] [data-node-id]')];
      const vis=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.top>=0&&r.bottom<=innerHeight});
      const leaf=vis.filter(e=>e.textContent.trim().length>3&&![...e.children].some(c=>c.hasAttribute('data-node-id')));const h=leaf.sort((a,b)=>parseFloat(getComputedStyle(b).fontSize)-parseFloat(getComputedStyle(a).fontSize))[0];
      if(!h)return null;const r=h.getBoundingClientRect();return {id:h.getAttribute('data-node-id'),tag:h.tagName,x:r.left+Math.min(r.width/2,60),y:r.top+r.height/2,fs:Math.max(...[h,...h.querySelectorAll('*')].map(x=>parseFloat(getComputedStyle(x).fontSize)||0))}})()`);
    if (!target) return "no visible node in right panel";
    for (let i = 0; i < 4; i++) { await mouse(target.x - 30 + i * 10, target.y); await sleep(60); }
    await mouse(target.x, target.y); await sleep(500);
    const label = await ev(`(()=>{const c=document.querySelector('[data-narrate-ignore] [class*="max-w-[320px]"]');return c&&getComputedStyle(c).opacity==='1'?c.textContent.trim():null})()`);
    await shot("03b-hover-bubble");
    console.log(`  target ${target.tag}#${target.id} fs=${target.fs} label=${JSON.stringify(label)}`);
    if (!label) return "bubble chip not visible/empty while hovering " + target.id;
  });

  // (4) say() hook
  await step("4. window.__createNarrate.say('make this bigger') edits hovered node", async () => {
    const has = await ev(`typeof window.__createNarrate?.say`);
    if (has !== "function") { skipped = true; return true; }
    if (!target) return "no hover target";
    await mouse(target.x, target.y); await sleep(200);
    await ev(`Promise.resolve(window.__createNarrate.say("make this bigger", true)).then(()=>1)`).catch((e) => console.log("  say threw: " + e.message));
    const grew = await waitFor(`${maxFs(target.id)}>${target.fs}`, 8000);
    const done = await ev(`/·\\s*Done/.test(document.querySelector('[data-narrate-ignore] [class*="max-w-[320px]"]')?.textContent||'')`);
    await shot("04-after-say");
    const fs2 = await ev(maxFs(target.id));
    console.log(`  font-size ${target.fs} -> ${fs2}, doneText=${done}`);
    if (!grew && !done) return `font-size unchanged (${target.fs}) and no Done state`;
  });
  await sleep(500);
} catch (e) {
  rec("harness", false, e.stack.split("\n").slice(0, 3).join(" | "));
}

// (5) errors
const noisy = (s) => /favicon|ERR_ABORTED|net::ERR_BLOCKED|Download the React DevTools/i.test(s);
const ce = [...new Set(consoleErrors.filter((s) => !noisy(s)))], fr = [...new Set(failedReqs.filter((s) => !noisy(s)))];
rec("5a. no console errors/exceptions", ce.length === 0, ce.slice(0, 5).join(" || "));
rec("5b. no failed requests (>=400 / net error)", fr.length === 0, fr.slice(0, 5).join(" || "));

console.log("\n| Check | Result | Detail |\n|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "/")} |`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
try { ws.close(); } catch {}
cleanup();
process.exit(failed ? 1 : 0);
