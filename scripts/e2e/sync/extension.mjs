#!/usr/bin/env node
// Extension voice sync, in a real browser: the extension is loaded, the fake mic plays "Make this bigger." (harness TTS audio), real Scribe
// realtime runs through the background, and the pointer is injected over CDP. Option is held over table A while "this" is said, the pointer
// moves to table B right after, and Option is released later. Without word-time binding the pill would lock B (hovered at release).
//
//   node --env-file=apps/server/.env scripts/e2e/sync/extension.mjs [--reps 2] [--api http://localhost:3001]
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { launch, sleep } from "./narrate-lib.mjs";
import { Path } from "./path.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const SCRATCH = "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad";
const AUDIO = opt("audio", path.join(SCRATCH, "sync/audio"));
const OUT = opt("out", path.join(SCRATCH, "sync-e2e"));
const API = opt("api", "http://localhost:3001");
const REPS = +opt("reps", 2);
const truth = JSON.parse(fs.readFileSync(path.join(AUDIO, "make-this-bigger.truth.json"), "utf8"));
const T = truth.deictics[0];
fs.mkdirSync(OUT, { recursive: true });

const site = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }).end(fs.readFileSync(path.join(HERE, "fixture/ext.html"))); });
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${site.address().port}/`;
// Run against a copy of the extension (headless cannot click the toolbar; nothing in it is changed).
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), "create-ext-sync-"));
fs.cpSync(path.resolve(HERE, "../../../apps/extension"), EXT, { recursive: true });

async function attach(url) {
  const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  return { ws, send, ev, fire: (method, params) => ws.send(JSON.stringify({ id: ++id, method, params })) };
}

async function run(voice, rep) {
  const { cdp, close, port } = await launch({ wav: voice ? path.join(AUDIO, "make-this-bigger.wav") : null, width: 1280, height: 800, extension: EXT });
  try {
    const targets = async () => (await fetch(`http://127.0.0.1:${port}/json`)).json();
    let sw = null;
    for (let i = 0; i < 50 && !sw; i++) {
      for (const t of (await targets()).filter((t) => t.type === "service_worker" && t.url.startsWith("chrome-extension://"))) {
        const c = await attach(t.webSocketDebuggerUrl);
        if (/Create: Point at any website/.test(await c.ev("chrome.runtime.getManifest().name").catch(() => ""))) { sw = c; break; }
        c.ws.close();
      }
      if (!sw) await sleep(200);
    }
    if (!sw) throw new Error("extension did not load");
    await sw.send("Runtime.enable");
    await sw.ev(`chrome.storage.sync.set({ apiOrigin: ${JSON.stringify(API)}, voice: ${voice} })`);
    const consoleLog = [];
    cdp.listeners.push((m) => { if (m.method === "Runtime.consoleAPICalled") consoleLog.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)); if (m.method === "Runtime.exceptionThrown") consoleLog.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200)); });
    await cdp.send("Page.navigate", { url: SITE });
    await cdp.waitFor("document.readyState==='complete'"); await sleep(600);
    const rect = (id) => cdp.eval(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    const A = await rect("A"), B = await rect("B");
    const host = (k) => cdp.eval(`(()=>{const h=[...document.documentElement.children].find(e=>e.dataset&&e.dataset.state);return h?h.dataset[${JSON.stringify(k)}]||'':'<none>'})()`);
    const key = (type) => cdp.send("Input.dispatchKeyEvent", { type, key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18, modifiers: type === "keyDown" ? 1 : 0 });
    const move = (x, y) => cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", modifiers: 1 });
    await cdp.mouse(A.x, A.y); await sleep(100);
    await key("keyDown");
    let t0;
    if (voice) {
      const got = await cdp.waitFor(`(()=>{const h=[...document.documentElement.children].find(e=>e.dataset&&e.dataset.voiceStart);return h?h.dataset.voiceStart:null})()`, 10000, 30);
      if (!got) throw new Error("voice never started (no audio start); console: " + JSON.stringify(consoleLog.slice(-6)));
      t0 = +got;
    } else t0 = await cdp.eval("performance.now()");
    // pointer path on the audio-file timeline: A until just after "this" starts, then B; release Option after the line ends
    const P = new Path([A.x, A.y], 0).holdUntil(T.start + 150, 2).move([B.x, B.y], T.start + 150, T.start + 400).holdUntil(truth.utteranceEndMs + 400, 2);
    const nowP = await cdp.eval("performance.now()");
    for (const s of P.samples) {
      const due = t0 + s.t; if (due < nowP) continue;
      const d = due - (await cdp.eval("performance.now()")); if (d > 8) await sleep(d - 6);
      move(Math.round(s.x), Math.round(s.y));
    }
    await key("keyUp");
    const asked = await cdp.waitFor(`(()=>{const h=[...document.documentElement.children].find(e=>e.dataset&&e.dataset.state==='asking');return h?h.dataset.chip:null})()`, 6000, 80);
    const info = { voice, rep, chip: asked || (await host("chip")), state: await host("state"), voiceData: voice ? JSON.parse((await host("voice")) || "null") : null };
    await cdp.shot(path.join(OUT, `ext-${voice ? "voice" : "novoice"}-${rep}.png`));
    return { ...info, labelA: await cdp.eval(`document.getElementById('A').closest('section').querySelector('h2').textContent`) };
  } finally { close(); }
}

const rows = [];
for (const voice of [false, true]) for (let r = 0; r < (voice ? REPS : 1); r++) {
  try { const x = await run(voice, r); rows.push(x); console.log(JSON.stringify(x)); } catch (e) { rows.push({ voice, rep: r, error: e.message }); console.warn("fail", voice, r, e.message); }
}
site.close();
const A_RX = /3 rows|Table · 3|3 × 3|3 rows × 3/i;   // table A: 3 data rows x 3 cols; table B: 5 x 2
const isA = (c) => /3 rows? × 3|3×3|× 3 cols/i.test(c || "");
const isB = (c) => /5 rows? × 2|5×2|× 2 cols/i.test(c || "");
const novoice = rows.filter((r) => !r.voice && !r.error), voiced = rows.filter((r) => r.voice);
const lines = ["# Extension voice sync (real browser, real Scribe)", "",
  `Generated ${new Date().toISOString()}. Option is held over table A while "this" is said in "Make this bigger."; the pointer moves to table B 150-400 ms after the word starts and Option is released ~0.4 s after the line ends.`, "",
  "| run | chip when the pill opened | locked table | word | bind mode |", "|---|---|---|---|---|"];
for (const r of rows) lines.push(`| ${r.voice ? "voice" : "no voice"} #${r.rep} | ${r.error ? "ERROR " + r.error : r.chip} | ${r.error ? "-" : isA(r.chip) ? "A (hovered at the word)" : isB(r.chip) ? "B (hovered at release)" : "?"} | ${r.voiceData?.word ?? "-"} | ${r.voiceData?.mode ?? "-"} |`);
const pass = novoice.every((r) => isB(r.chip)) && voiced.length > 0 && voiced.every((r) => isA(r.chip));
lines.push("", `Result: ${pass ? "PASS" : "FAIL"} (no voice locks the table hovered at release; voice locks the table hovered when "this" was said).`);
fs.writeFileSync(path.join(OUT, "report-extension.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(pass ? 0 : 1);
