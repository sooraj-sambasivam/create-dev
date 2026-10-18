#!/usr/bin/env node
// Composer e2e: Files, Plugins, Lift, Go, fan (Speak/Sketch/Narrate). No npm deps: launches the cached Playwright Chromium and drives it over CDP.
// Usage: node scripts/e2e/composer.mjs   (env: BASE_URL, SHOT_DIR, HEADED=1)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5175";
const SHOTS = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/e2e-composer";
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
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pending.delete(i); rej(new Error("CDP timeout: " + method)); }, 30000); pending.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
listeners.push((d) => {
  if (d.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
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
let skipped = false;
const step = async (name, fn) => { try { const r = await fn(); if (r !== undefined && r !== true) rec(name, false, String(r)); else rec(name, true); } catch (e) { rec(name, false, e.message.split("\n")[0]); } };
const TID = (t) => `[data-testid="${t}"]`;
const exists = (sel) => `!!document.querySelector(${JSON.stringify(sel)})`;
// A real click on an element's center (falls back to nothing: a covered control is a bug worth failing on).
const click = async (sel) => { const c = await center(sel); if (!c) throw new Error("not found: " + sel); await clickAt(c.x, c.y); };
const clickByLabel = async (label) => { const sel = `[aria-label=${JSON.stringify(label)}]`; await click(sel); };
const hoverGo = async () => { const go = await center(TID("go")); await mouse(go.x + 300, go.y - 300); await sleep(150); await mouse(go.x, go.y); await sleep(700); };
const bodyText = () => ev(`document.body.innerText`);

// Fake screen share (headless has no picker): a 640x400 canvas stream with a table-like drawing.
const SHIM = `(()=>{const gdm=async()=>{const c=document.createElement('canvas');c.width=640;c.height=400;const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,640,400);g.fillStyle='#222';g.font='16px sans-serif';
  for(let r=0;r<6;r++){g.fillText('Row '+r+'   Item '+r+'   '+(r*7+3),30,50+r*40);g.strokeRect(20,28+r*40,600,36)}
  const s=c.captureStream(15);window.__gdmCalls=(window.__gdmCalls||0)+1;return s};
  Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{value:gdm,configurable:true})})()`;

// 1x1 png to attach
const png = join(profile, "e2e-sample.png");
writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"));

const fresh = async () => {
  await send("Page.navigate", { url: BASE });
  if (!(await waitFor(exists(TID("message-input")), 15000))) throw new Error("composer not found");
  await sleep(500);
};

try {
  const apiUp = await fetch(BASE + "/api/health").then((r) => r.status < 500).catch(() => false);
  if (!apiUp) console.log("  WARN: " + BASE + "/api/* unreachable");
  const health = await fetch(BASE + "/api/health").then((r) => r.json()).catch(() => null);
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE });
  await waitFor("document.readyState==='complete'");
  await ev(`localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}))`);
  await fresh();

  // ---- Files
  await step("1a. Files menu opens with real content (empty state + attach action)", async () => {
    await clickByLabel("Files");
    if (!(await waitFor(`document.body.innerText.includes('No files yet')`, 3000))) { await shot("c1a"); return "Files menu did not open with an empty state"; }
    const t = await bodyText();
    if (!t.includes("Attach from disk")) return "no 'Attach from disk' action";
    await shot("c1a-files-empty");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(300);
  });
  await step("1b. attaching a file adds a chip and a Files row", async () => {
    const { root } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[type="file"][aria-label="Attach a file"]' });
    if (!nodeId) return "no file input";
    await send("DOM.setFileInputFiles", { nodeId, files: [png] });
    if (!(await waitFor(`!!document.querySelector('[data-testid="attachments"]') && document.querySelector('[data-testid="attachments"]').innerText.includes('e2e-sample')`, 10000))) { await shot("c1b"); return "no attachment chip for e2e-sample.png"; }
  });
  await step("1c. choosing the file in Files inserts an @mention", async () => {
    await clickByLabel("Files");
    if (!(await waitFor(`[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('e2e-sample'))`, 3000))) return "file row missing in Files menu";
    await shot("c1c-files-list");
    const c = await ev(`(()=>{const e=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('e2e-sample'));const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await clickAt(c.x, c.y); await sleep(300);
    const v = await ev(`document.querySelector('[data-testid="message-input"]').value`);
    if (!/@e2e-sample\S*\s$/.test(v)) return "textarea is " + JSON.stringify(v);
  });
  await step("1d. typing @ shows the mention picker with the asset", async () => {
    await ev(`(()=>{const t=document.querySelector('[data-testid="message-input"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'look at @');t.dispatchEvent(new Event('input',{bubbles:true}));t.focus()})()`);
    if (!(await waitFor(`!!document.querySelector('[aria-label="Mention a file"]') && document.querySelector('[aria-label="Mention a file"]').innerText.includes('e2e-sample')`, 3000))) return "mention picker missing";
    await shot("c1d-mention");
    await ev(`(()=>{const t=document.querySelector('[data-testid="message-input"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'');t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  });
  await step("1e. Plus menu 'Add photos or files' opens the picker (input click)", async () => {
    await ev(`window.__fileClicks=0;document.querySelector('input[type=file][aria-label="Attach a file"]').addEventListener('click',()=>window.__fileClicks++)`);
    await click(TID("plus-button"));
    if (!(await waitFor(`[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('Add photos or files'))`, 3000))) return "Plus menu missing items";
    if (!(await ev(`[...document.querySelectorAll('[role=menuitem]')].some(e=>e.textContent.includes('Lift from screen'))`))) return "Plus menu missing Lift";
    await ev(`[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('Add photos or files')).click()`);
    await sleep(300);
    if ((await ev(`window.__fileClicks`)) < 1) return "file input was not triggered";
  });

  // ---- Plugins
  await step("2a. Plugins menu lists every plugin and statuses mirror /api/health", async () => {
    await fresh();
    await clickByLabel("Plugins");
    if (!(await waitFor(exists(TID("plugin-live")), 3000))) return "Plugins menu did not open";
    await sleep(600);
    const want = { live: health !== null, perceptron: health?.hasPerceptron, jev: health?.hasTypesafe, gemini: health?.hasGemini, inkling: health?.hasOpenRouter || health?.hasTinker, mongo: health?.hasMongo };
    const got = await ev(`Object.fromEntries([...document.querySelectorAll('[data-testid^="plugin-"]')].map(e=>[e.getAttribute('data-testid').slice(7),e.innerText.includes('Connected')]))`);
    await shot("c2a-plugins");
    const bad = Object.entries(want).filter(([k, v]) => got[k] !== Boolean(v)).map(([k, v]) => `${k}: menu=${got[k]} health=${Boolean(v)}`);
    if (Object.keys(got).length < 6) return "only " + Object.keys(got).join(",");
    if (bad.length) return "mismatch " + bad.join("; ");
  });
  await step("2b. Gemini switch toggles and persists in prefs", async () => {
    const before = await ev(`document.querySelector('[aria-label^="Gemini "]').getAttribute('aria-checked')`);
    await click('[aria-label^="Gemini "]'); await sleep(250);
    const after = await ev(`document.querySelector('[aria-label^="Gemini "]').getAttribute('aria-checked')`);
    if (before === after) return "switch did not change";
    await click('[aria-label^="Gemini "]'); await sleep(200);
  });

  // ---- Lift (screen icon)
  await step("3a. screen icon opens the Lift overlay with the captured frame", async () => {
    await fresh();
    await click(TID("lift-button"));
    if (!(await waitFor(exists(TID("lift-overlay")), 8000))) { await shot("c3a"); return "no lift overlay after clicking the screen icon"; }
    if ((await ev(`window.__gdmCalls`)) !== 1) return "getDisplayMedia not called once";
    const img = await ev(`(()=>{const i=document.querySelector('[data-testid="lift-overlay"] img');return i?{w:i.naturalWidth,h:i.naturalHeight}:null})()`);
    if (!img || img.w < 100) return "overlay has no frame image: " + JSON.stringify(img);
    await shot("c3a-lift-overlay");
  });
  await step("3b. Esc cancels Lift", async () => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    if (!(await waitFor(`!(${exists(TID("lift-overlay"))})`, 3000))) return "overlay still open after Esc";
  });
  await step("3c. dragging a box calls /api/extract and lifts (request fires)", async () => {
    await ev(`window.__ex=[];const f=window.fetch;window.fetch=function(u,...a){if(String(u).includes('/api/extract')||String(u).includes('/api/lift'))window.__ex.push(String(u));return f.call(this,u,...a)}`);
    await click(TID("lift-button"));
    if (!(await waitFor(`!!document.querySelector('[data-testid="lift-overlay"] img') && document.querySelector('[data-testid="lift-overlay"] img').naturalWidth>0`, 8000))) return "no overlay frame";
    await sleep(700);
    const r = await ev(`(()=>{const i=document.querySelector('[data-testid="lift-overlay"] img').getBoundingClientRect();return {x:i.left,y:i.top,w:i.width,h:i.height}})()`);
    await mouse(r.x + r.w * 0.1, r.y + r.h * 0.1);
    await mouse(r.x + r.w * 0.1, r.y + r.h * 0.1, "mousePressed");
    await mouse(r.x + r.w * 0.5, r.y + r.h * 0.5, "mouseMoved");
    await mouse(r.x + r.w * 0.9, r.y + r.h * 0.9, "mouseMoved");
    await mouse(r.x + r.w * 0.9, r.y + r.h * 0.9, "mouseReleased");
    if (!(await waitFor(`window.__ex.some(u=>u.includes('/api/extract'))`, 8000))) { await shot("c3c"); return "no /api/extract request after boxing a region: " + (await ev(`JSON.stringify(window.__ex)`)); }
    await waitFor(`!(${exists(TID("lift-overlay"))})`, 5000);
  });

  // ---- Go button
  await step("4a. Go with an empty message starts voice (voice bar + Stop state)", async () => {
    await fresh();
    const label = await ev(`document.querySelector('[data-testid="go"]').getAttribute('aria-label')`);
    if (label !== "Speak") return "empty Go label is " + label;
    await click(TID("go"));
    if (!(await waitFor(`document.querySelector('[data-testid="go"]').getAttribute('aria-label')==='Stop recording'`, 6000))) { await shot("c4a"); return "voice did not start (Go never became Stop recording); bar=" + (await ev(`document.querySelector('[data-testid="voice-bar"]')?.innerText||'none'`)) + " ; at-go=" + (await ev(`(()=>{const g=document.querySelector('[data-testid=go]').getBoundingClientRect();const e=document.elementFromPoint(g.left+g.width/2,g.top+g.height/2);return e.tagName+'.'+String(e.className).slice(0,60)+' disabled='+document.querySelector('[data-testid=go]').getAttribute('aria-disabled')+' mr='+typeof MediaRecorder+' gum='+typeof navigator.mediaDevices.getUserMedia})()`)); }
    if (!(await ev(exists(TID("voice-bar"))))) return "no voice bar";
    await shot("c4a-voice");
  });
  await step("4b. Go again stops recording (state leaves 'recording')", async () => {
    await click(TID("go"));
    if (!(await waitFor(`document.querySelector('[data-testid="go"]').getAttribute('aria-label')!=='Stop recording'`, 6000))) return "still recording after Stop";
    await waitFor(`!(${exists(TID("voice-bar"))})`, 8000);
  });
  await step("4c. Go with text sends (thread appears, input clears)", async () => {
    await fresh();
    await click(TID("message-input"));
    await send("Input.insertText", { text: "A landing page for a coffee shop called Ember" });
    await sleep(200);
    const label = await ev(`document.querySelector('[data-testid="go"]').getAttribute('aria-label')`);
    if (label !== "Go") return "text Go label is " + label;
    await click(TID("go"));
    if (!(await waitFor(`document.querySelectorAll('[data-screen-root] [data-node-id]').length>0`, 30000))) { await shot("c4c"); return "no page rendered after Go"; }
    if ((await ev(`document.querySelector('[data-testid="message-input"]').value`)) !== "") return "input not cleared";
  });

  // ---- Fan
  const openFanItem = async (testid) => {
    await hoverGo();
    let c = await center(TID(testid));
    if (!c) { await ev(`document.querySelector('[data-testid="go"]').focus()`); await sleep(600); c = await center(TID(testid)); }
    if (!c) throw new Error(testid + " not visible after hovering Go");
    await sleep(300); c = await center(TID(testid));
    const top = await ev(`(()=>{const e=document.elementFromPoint(${c.x},${c.y});return e?.closest('[data-testid]')?.getAttribute('data-testid')||(e?.tagName+'.'+String(e?.className).slice(0,80))})()`);
    if (top !== testid) throw new Error(`${testid} covered by ${top}`);
    return c;
  };
  await step("5a. fan shows Speak, Sketch, Narrate", async () => {
    await fresh(); await hoverGo();
    for (const t of ["mic-button", "canvas-button", "narrate-button"]) if (!(await ev(exists(TID(t))))) return t + " missing";
    await shot("c5a-fan");
  });
  await step("5b. fan Speak toggles voice state", async () => {
    await fresh();
    const c = await openFanItem("mic-button"); await clickAt(c.x, c.y);
    if (!(await waitFor(`document.querySelector('[data-testid="go"]').getAttribute('aria-label')==='Stop recording'`, 6000))) return "voice did not start from fan Speak";
    await click(TID("go"));
    if (!(await waitFor(`document.querySelector('[data-testid="go"]').getAttribute('aria-label')!=='Stop recording'`, 6000))) return "did not stop";
  });
  await step("5c. fan Sketch opens canvas mode", async () => {
    await fresh();
    const c = await openFanItem("canvas-button"); await clickAt(c.x, c.y);
    if (!(await waitFor(exists("[data-canvas-host]"), 10000))) { await shot("c5c"); return "no [data-canvas-host] after Sketch"; }
    await sleep(800); await shot("c5c-sketch");
  });
  await step("5d. fan Narrate opens the narrate overlay", async () => {
    await fresh();
    const c = await openFanItem("narrate-button"); await clickAt(c.x, c.y);
    if (!(await waitFor(exists("[data-narrate-ignore]"), 10000))) { await shot("c5d"); return "no narrate overlay"; }
    await sleep(600); await shot("c5d-narrate");
  });
} catch (e) {
  rec("harness", false, e.stack.split("\n").slice(0, 3).join(" | "));
}

const noisy = (s) => /favicon|ERR_ABORTED|net::ERR_BLOCKED|Download the React DevTools|\/api\/icons\/svg|400 [^ ]*\/api\/transcribe|404 [^ ]*\/api\/traces|429 [^ ]*\/api\/voice-token/i.test(s);
const ce = [...new Set(consoleErrors.filter((s) => !noisy(s)))], fr = [...new Set(failedReqs.filter((s) => !noisy(s)))];
rec("9a. no console errors/exceptions", ce.length === 0, ce.slice(0, 5).join(" || "));
rec("9b. no failed requests (icons/svg 502 , the empty transcribe probe, missing /api/traces, demo-limit 429 excluded)", fr.length === 0, fr.slice(0, 5).join(" || "));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
try { ws.close(); } catch {}
cleanup();
process.exit(failed ? 1 : 0);
