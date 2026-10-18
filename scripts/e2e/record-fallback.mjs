#!/usr/bin/env node
// Records the demo path with the web app's replay module in RECORD mode, exports the recording to JSON,
// then plays the same path back in REPLAY mode (fresh browser profile) and checks no AI request hit the network.
//
// Demo path: locate + read a schedule on a web target -> lift it into an app -> ask about the chart (Chat) -> "make this bigger".
// No npm deps: launches the cached Playwright Chromium over CDP, like smoke.mjs.
//
// Usage: node scripts/e2e/record-fallback.mjs [--record-only | --replay-only] (env: BASE_URL, API_URL, OUT_DIR, SHOT_DIR, HEADED=1)
// Output: <OUT_DIR>/fallback-recording.json  (default docs/results/traces/)  and  <OUT_DIR>/fallback-run.json (timings)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASE_URL || "http://localhost:5175";
const API = process.env.API_URL || "http://localhost:3001";
const OUT = process.env.OUT_DIR || join(ROOT, "docs/results/traces");
const SHOTS = process.env.SHOT_DIR || join(tmpdir(), "create-fallback-shots");
const REC_FILE = join(OUT, "fallback-recording.json");
const RUN_FILE = join(OUT, "fallback-run.json");
const args = new Set(process.argv.slice(2));
const doRecord = !args.has("--replay-only");
const doReplay = !args.has("--record-only");
const REPLAY_PATHS = ["/api/generate", "/api/generate-sketch", "/api/edit-node", "/api/canvas-ops", "/api/route-intent", "/api/demo", "/api/transcribe"];
mkdirSync(OUT, { recursive: true });
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

/** One browser session. Returns helpers; call close() when done. */
async function openBrowser() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), "create-fallback-"));
  const flags = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--window-size=1440,900", "about:blank"];
  if (!process.env.HEADED) flags.splice(2, 0, "--headless=new");
  const chrome = spawn(findChrome(), flags, { stdio: "ignore" });
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error("chrome did not expose CDP");
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } else listeners.forEach((l) => l(d));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pending.delete(i); rej(new Error("CDP timeout: " + method)); }, 30000); pending.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
  const netAi = []; // replay-covered AI requests that went out on the network
  const netUncovered = []; // AI requests the replay module does not cover (it only wraps REPLAY_PATHS)
  listeners.push((d) => {
    if (d.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    if (d.method === "Network.requestWillBeSent") {
      try { const p = new URL(d.params.request.url).pathname; if (REPLAY_PATHS.includes(p)) netAi.push(p); else if (["/api/ask", "/api/locate", "/api/extract"].includes(p)) netUncovered.push(p); } catch {}
    }
  });
  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000, step = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(step); } return false; };
  const shot = async (name) => { const f = join(SHOTS, name + ".png"); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(r.data, "base64")); return f; };
  const mouse = (x, y, type = "mouseMoved") => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });
  const clickAt = async (x, y) => { await mouse(x, y); await mouse(x, y, "mousePressed"); await mouse(x, y, "mouseReleased"); };
  const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  const key = async (k, code, vk, text) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk }); };
  const typeSend = async (text) => {
    const c = await center('[data-testid="message-input"]');
    await clickAt(c.x, c.y);
    await send("Input.insertText", { text });
    await sleep(150);
    await key("Enter", "Enter", 13, "\r");
  };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const close = () => { try { ws.close(); } catch {} try { chrome.kill("SIGKILL"); } catch {} };
  process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });
  return { send, ev, waitFor, shot, mouse, clickAt, center, key, typeSend, netAi, netUncovered, close };
}

// ---------- server-side half of the demo path (locate -> read -> lift) ----------
async function post(path, body) {
  const t0 = performance.now();
  const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json", Origin: new URL(BASE).origin }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ms: Math.round(performance.now() - t0), json };
}

async function liftSchedule() {
  const dir = join(ROOT, "eval/pointer/corpus/t01-transit-timetable");
  const t = JSON.parse(readFileSync(join(dir, "target.json"), "utf8"));
  const image = "data:image/png;base64," + readFileSync(join(dir, "shot.png")).toString("base64");
  const dom = JSON.parse(readFileSync(join(dir, "dom.json"), "utf8"));
  const stages = [];
  const loc = await post("/api/locate", { input: { source: "app", image, imageSize: t.imageSize, cursor: t.cursor, utterance: t.utterance, dom } });
  stages.push({ stage: "locate", ms: loc.ms, status: loc.status, traceId: loc.json?.trace?.id, ask: loc.json?.ask ?? null, source: loc.json?.result?.source ?? null });
  const ex = await post("/api/extract", { image, hint: loc.json?.result?.label });
  // The pointer's label for this target is a miss (":"), so the user's spoken name titles the app, as a "Which one?" answer would.
  stages.push({ stage: "read", ms: ex.ms, status: ex.status, provider: ex.json?.provider, traceId: ex.json?.trace?.id });
  if (!ex.json?.entity) throw new Error("extract returned no entity: " + JSON.stringify(ex.json).slice(0, 200));
  const lift = await post("/api/lift", { entity: { ...ex.json.entity, title: t.label, source: { title: t.app } }, instruction: "turn this into something I can track" });
  stages.push({ stage: "act:lift", ms: lift.ms, status: lift.status });
  if (!lift.json?.url) throw new Error("lift failed: " + JSON.stringify(lift.json).slice(0, 200));
  const url = new URL(lift.json.url); url.protocol = new URL(BASE).protocol; url.host = new URL(BASE).host;
  return { url: url.toString(), stages };
}

// ---------- browser half: open app, ask about chart, make heading bigger ----------
async function runBrowserSteps(b, url, label) {
  const steps = [];
  const step = async (name, fn) => {
    const t0 = Date.now();
    try { const r = await fn(); const ok = r === undefined || r === true; steps.push({ name, ok, ms: Date.now() - t0, ...(ok ? {} : { detail: String(r) }) }); }
    catch (e) { steps.push({ name, ok: false, ms: Date.now() - t0, detail: e.message.split("\n")[0] }); }
    console.log(`${steps.at(-1).ok ? "PASS" : "FAIL"}  [${label}] ${name}  ${steps.at(-1).ms}ms${steps.at(-1).detail ? "  - " + steps.at(-1).detail : ""}`);
  };
  await step("open lifted app (table + chart)", async () => {
    await b.send("Page.navigate", { url });
    if (!(await b.waitFor(`document.querySelectorAll('[data-screen-root] table:not(.sr-only) tbody tr').length>=3`, 20000))) return "table did not render";
    if (!(await b.waitFor(`!!document.querySelector('[data-screen-root] figure svg[role=img]')`, 5000))) return "chart did not render";
    await b.shot(`${label}-1-lifted`);
  });
  await step("editor: prompt renders the app in the right panel", async () => {
    await b.send("Page.navigate", { url: BASE });
    if (!(await b.waitFor(`!!document.querySelector('[data-testid="message-input"]')`, 15000))) return "composer not found";
    await sleep(500);
    await b.typeSend("Turn this train schedule into a small tracker app with a chart");
    if (!(await b.waitFor(`document.querySelectorAll('[data-screen-root] [data-node-id]').length>0`, 30000))) return "no page rendered in 30s";
    await sleep(800); await b.shot(`${label}-2-editor`);
  });
  await step("Chat: ask about the chart", async () => {
    if (!(await b.waitFor(`!!document.querySelector('[data-testid="work-mode-chat"]')`, 8000))) return "no Chat toggle";
    await b.key("Escape", "Escape", 27);
    await b.ev(`document.querySelector('[data-testid="work-mode-chat"]').click()`);
    await sleep(300);
    const before = await b.ev(`document.querySelectorAll('[data-testid="answer"]').length`);
    await b.typeSend("what does this chart show?");
    if (!(await b.waitFor(`document.querySelectorAll('[data-testid="answer"]').length>${before}`, 20000))) return "no answer";
    await sleep(400); await b.shot(`${label}-3-answer`);
  });
  await step("Narrate: make the heading bigger", async () => {
    await b.ev(`document.querySelector('[data-testid="work-mode-code"]')?.click()`).catch(() => {});
    await sleep(300);
    const go = await b.center('[data-testid="go"]');
    if (!go) return "no Go button";
    await b.mouse(go.x, go.y); await sleep(500);
    let nb = await b.center('[data-testid="narrate-button"]');
    if (!nb) { await b.ev(`document.querySelector('[data-testid="go"]').focus()`); await sleep(500); nb = await b.center('[data-testid="narrate-button"]'); }
    if (!nb) return "narrate-button not visible";
    await sleep(400);
    await b.ev(`document.querySelector('[data-testid="narrate-button"]').click()`);
    await sleep(1200);
    const t = await b.ev(`(()=>{const els=[...document.querySelectorAll('[data-right-panel] [data-screen-root] [data-node-id]')];
      const leaf=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.top>=0&&r.bottom<=innerHeight&&e.textContent.trim().length>3&&![...e.children].some(c=>c.hasAttribute('data-node-id'))});
      const h=leaf.sort((a,b)=>parseFloat(getComputedStyle(b).fontSize)-parseFloat(getComputedStyle(a).fontSize))[0];
      if(!h)return null;const r=h.getBoundingClientRect();return {id:h.getAttribute('data-node-id'),x:r.left+Math.min(r.width/2,60),y:r.top+r.height/2,fs:Math.max(...[h,...h.querySelectorAll('*')].map(x=>parseFloat(getComputedStyle(x).fontSize)||0))}})()`);
    if (!t) return "no heading node";
    for (let i = 0; i < 4; i++) { await b.mouse(t.x - 30 + i * 10, t.y); await sleep(60); }
    await b.mouse(t.x, t.y); await sleep(500);
    if ((await b.ev(`typeof window.__createNarrate?.say`)) !== "function") return "no __createNarrate.say hook";
    const fs = (id) => `(()=>{const e=document.querySelector('[data-right-panel] [data-screen-root] [data-node-id="${id}"]');if(!e)return 0;return Math.max(...[e,...e.querySelectorAll('*')].map(x=>parseFloat(getComputedStyle(x).fontSize)||0))})()`;
    await b.ev(`Promise.resolve(window.__createNarrate.say("make this bigger", true)).then(()=>1)`).catch(() => {});
    const grew = await b.waitFor(`${fs(t.id)}>${t.fs}`, 10000);
    await b.shot(`${label}-4-bigger`);
    if (!grew) return `font-size unchanged (${t.fs})`;
  });
  return steps;
}

const run = { startedAt: new Date().toISOString(), base: BASE, api: API, note: "MOCK_AI responses unless the server has provider keys; recorded bodies are what the server returned.", record: null, replay: null };

if (doRecord) {
  const lift = await liftSchedule();
  console.log("lifted:", lift.url, JSON.stringify(lift.stages));
  const b = await openBrowser();
  try {
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}));localStorage.setItem('create.replay.mode','record')}catch{}` });
    const steps = await runBrowserSteps(b, lift.url, "record");
    await sleep(1500); // let recordResponse() finish teeing streams
    const recs = await b.ev(`new Promise((res,rej)=>{const o=indexedDB.open('create-replay',1);o.onerror=()=>rej(o.error);o.onsuccess=()=>{const g=o.result.transaction('recordings').objectStore('recordings').getAll();g.onsuccess=()=>res(g.result);g.onerror=()=>rej(g.error)}})`);
    writeFileSync(REC_FILE, JSON.stringify({ exportedAt: new Date().toISOString(), baseUrl: BASE, liftedUrl: lift.url, count: recs.length, recordings: recs }, null, 1));
    run.record = { liftStages: lift.stages, steps, recordings: recs.map((r) => ({ route: `${r.method} ${r.path}`, kind: r.kind, chunks: r.chunks?.length ?? 0, latencyMs: r.latency })), liftedUrl: lift.url };
    console.log(`recorded ${recs.length} AI responses -> ${REC_FILE}`);
  } finally { b.close(); }
}

if (doReplay) {
  if (!existsSync(REC_FILE)) { console.error("no recording at " + REC_FILE + "; run without --replay-only first"); process.exit(2); }
  const { recordings, liftedUrl } = JSON.parse(readFileSync(REC_FILE, "utf8"));
  const b = await openBrowser();
  try {
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `try{localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}));localStorage.setItem('create.replay.mode','replay')}catch{}` });
    // Seed IndexedDB on the app origin, then reload into replay mode.
    await b.send("Page.navigate", { url: BASE });
    await b.waitFor(`document.readyState==='complete'`, 10000);
    await b.ev(`new Promise((res,rej)=>{const o=indexedDB.open('create-replay',1);o.onupgradeneeded=()=>{const s=o.result.createObjectStore('recordings',{keyPath:'id',autoIncrement:true});s.createIndex('key','key');s.createIndex('route','route')};o.onerror=()=>rej(o.error);o.onsuccess=()=>{const tx=o.result.transaction('recordings','readwrite');const s=tx.objectStore('recordings');for(const r of ${JSON.stringify(recordings)}){delete r.id;s.add(r)}tx.oncomplete=()=>res(1);tx.onerror=()=>rej(tx.error)}})`);
    b.netAi.length = 0; b.netUncovered.length = 0;
    const steps = await runBrowserSteps(b, liftedUrl, "replay");
    const dot = await b.ev(`!!document.querySelector('[title="Replay on"]')`);
    run.replay = { steps, replayDotVisible: dot, aiRequestsOnNetwork: [...b.netAi], uncoveredAiRequestsOnNetwork: [...b.netUncovered] };
    console.log(`replay dot visible: ${dot}; replayable AI requests that hit the network: ${b.netAi.length}; NOT covered by replay (went to network): ${JSON.stringify(b.netUncovered)}`);
  } finally { b.close(); }
}

run.finishedAt = new Date().toISOString();
writeFileSync(RUN_FILE, JSON.stringify(run, null, 1));
const bad = [...(run.record?.steps ?? []), ...(run.replay?.steps ?? [])].filter((s) => !s.ok).length + (run.replay && run.replay.aiRequestsOnNetwork.length ? 1 : 0);
console.log(`${bad ? "FAILED" : "OK"}  run log: ${RUN_FILE}  screenshots: ${SHOTS}`);
process.exit(bad ? 1 : 0);
