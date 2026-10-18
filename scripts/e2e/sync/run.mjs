#!/usr/bin/env node
// Sync eval: node --env-file=apps/server/.env scripts/e2e/sync/run.mjs [--reps 3] [--concurrency 3] [--only id,id] [--force-synth] [--out DIR]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { SCENARIOS } from "./scenarios.mjs";
import { synthAll, CLICK_MS, DEICTIC } from "./synth.mjs";
import { CENTER } from "./path.mjs";
import { writeReport } from "./report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const REPS = +opt("reps", 3), CONC = +opt("concurrency", 3);
// The product commits on silence (server VAD, 0.5 s); "--commit manual" reproduces the old manual-commit baseline.
const COMMIT = opt("commit", process.env.SYNC_VAD ? process.env.SYNC_VAD : "0.5") === "manual" ? "manual" : +opt("commit", process.env.SYNC_VAD ?? "0.5");
const ONLY = opt("only", "")?.split(",").filter(Boolean);
const OUT = opt("out", "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/sync");
const CHROME = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bundle() {
  const pnpm = path.join(ROOT, "node_modules/.pnpm");
  const dir = fs.readdirSync(pnpm).find((d) => d.startsWith("esbuild@"));
  const esbuild = createRequire(path.join(pnpm, dir, "node_modules/esbuild/"))("esbuild");
  const outfile = path.join(OUT, "bundle/sync-bundle.js");
  await esbuild.build({
    entryPoints: [path.join(HERE, "entry.ts")], bundle: true, format: "iife", globalName: "SyncCore", outfile, target: "chrome120",
    alias: { "@create/shared": path.join(ROOT, "packages/shared/src/timeline.ts") }, logLevel: "error",
  });
  return outfile;
}

function serve(bundlePath) {
  const files = { "/": path.join(HERE, "fixture/index.html"), "/harness-page.js": path.join(HERE, "harness-page.js"), "/sync-bundle.js": bundlePath };
  const srv = http.createServer((req, res) => {
    const f = files[req.url.split("?")[0]];
    if (!f) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html", "cache-control": "no-store" }).end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

class CDP {
  constructor(url) { this.id = 0; this.cb = new Map(); this.ws = new WebSocket(url); }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; this.ws.onmessage = (e) => { const m = JSON.parse(e.data); const c = this.cb.get(m.id); if (c) { this.cb.delete(m.id); m.error ? c.rej(new Error(JSON.stringify(m.error))) : c.res(m.result); } }; }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.cb.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  fire(method, params = {}) { this.ws.send(JSON.stringify({ id: ++this.id, method, params })); }
  async eval(expr) { const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
}

async function mintToken() {
  const r = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } });
  if (!r.ok) throw new Error("token " + r.status);
  return (await r.json()).token;
}

const strip = (s) => s.toLowerCase().replace(/[^a-z']/g, "");
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

const withTimeout = (ms, what, p, onTimeout) => Promise.race([p, new Promise((_, r) => setTimeout(async () => r(new Error('timeout: ' + what + (onTimeout ? ' ' + (await onTimeout().catch(() => '')) : ''))), ms))]);

async function runOne(sc, truth, rep, port) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "syncprof-"));
  const chrome = spawn(CHROME, [
    ...(process.env.SYNC_HEADED ? [] : ["--headless=new"]), "--disable-features=AudioServiceSandbox", ...(process.env.SYNC_FLAGS ? process.env.SYNC_FLAGS.split(" ") : []), "--remote-debugging-port=0", `--user-data-dir=${prof}`, "--no-first-run", "--no-default-browser-check",
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", ...(process.env.SYNC_NOFILE ? [] : [`--use-file-for-fake-audio-capture=${process.env.SYNC_WAV || path.join(OUT, "audio", sc.id + ".wav")}${process.env.SYNC_LOOP ? "" : "%noloop"}`]),
    "--autoplay-policy=no-user-gesture-required", "--window-size=1000,640", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "about:blank",
  ], { stdio: "ignore" });
  try {
    let dp; for (let i = 0; i < 100 && !dp; i++) { await sleep(100); try { dp = fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
    if (!dp) throw new Error("chrome did not start");
    const tabs = await (await fetch(`http://127.0.0.1:${dp}/json/list`)).json();
    const tab = tabs.find((t) => t.type === "page");
    const cdp = new CDP(tab.webSocketDebuggerUrl); await cdp.open();
    await cdp.send("Page.enable"); await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 640, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: `http://localhost:${port}/` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval("!!window.__h").catch(() => false)) break; await sleep(100); }
    // node<->page clock offset (best of N round trips)
    let best = null;
    for (let i = 0; i < 25; i++) { const n0 = performance.now(); const p = await cdp.eval("performance.now()"); const n1 = performance.now(); if (!best || n1 - n0 < best.rtt) best = { rtt: n1 - n0, off: p - (n0 + n1) / 2 }; }
    const toNode = (pageT) => pageT - best.off;
    const token = await mintToken();
    const dbg = (m) => process.env.SYNC_DEBUG && console.log(`[${sc.id}#${rep}]`, m);
    dbg('page ready');
    const anchor = await withTimeout(15000, 'anchor (mic click not detected?)', cdp.eval(`__h.startMic(${JSON.stringify(token)}, ${CLICK_MS}, ${COMMIT === "manual" ? "null" : JSON.stringify({ vad: COMMIT })})`), () => cdp.eval("JSON.stringify([__h.log, (__h.peaks||[]).filter((x,i)=>i%8==0).join(' ')])"));
    dbg('anchor ' + JSON.stringify(anchor.diag));
    const tA0 = anchor.tA0;
    // plan
    const R = rng(1234 + rep * 97 + sc.id.length);
    const wsLags = truth.words.map(() => Math.round(450 + (R() * 300 - 120)));
    const commitAtMs = truth.utteranceEndMs + 700;
    await cdp.eval(`__h.arm(${JSON.stringify({ tA0, words: truth.words, commitAtMs, wsLags })})`);
    // pointer path
    const { path: P, expect } = sc.build(truth.deictics);
    const sched = P.samples.map((s) => ({ t: tA0 + s.t, x: Math.round(s.x), y: Math.round(s.y) }));
    const nowP = await cdp.eval("performance.now()");
    const startIdx = sched.findIndex((s) => s.t > nowP + 40);
    if (startIdx > 0) cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x: sched[startIdx - 1].x, y: sched[startIdx - 1].y });
    const dispatched = [];
    for (let i = Math.max(0, startIdx); i < sched.length; i++) {
      const tNode = toNode(sched[i].t);
      let d = tNode - performance.now();
      if (d > 4) await sleep(d - 3);
      while (performance.now() < tNode) {}
      cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x: sched[i].x, y: sched[i].y });
      dispatched.push(sched[i]);
    }
    const doneRes = await withTimeout(20000, "scribe done", cdp.eval("__h.done"));
    await sleep(300);
    const col = await cdp.eval("JSON.stringify(__h.collect())").then(JSON.parse);
    cdp.ws.close();
    return { sc, rep, tA0, anchor: { sock0: anchor.sock0, diag: anchor.diag }, expect, truthDeictics: truth.deictics, truthWords: truth.words, dispatched, sched, col, doneRes, wsLags, rtt: best.rtt };
  } finally {
    chrome.kill("SIGKILL"); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  }
}

/** Score one run: per source, per truth deictic. */
function score(run) {
  const { tA0, truthDeictics, expect, col } = run;
  const rows = [];
  for (const src of ["inj", "ws", "live"]) {
    const em = col.emissions.filter((e) => e.src === src);
    truthDeictics.forEach((td, i) => {
      const Ts = tA0 + td.start, Te = tA0 + td.end;
      const cand = em.filter((e) => strip(e.text) === strip(td.text) && Math.abs(e.wStart - Ts) < 900);
      const byId = new Map(); for (const e of cand) { (byId.get(e.id) ?? byId.set(e.id, []).get(e.id)).push(e); }
      // the word whose id has the closest final start
      let bestId = null, bd = Infinity;
      for (const [id, arr] of byId) { const d = Math.abs(arr[arr.length - 1].wStart - Ts); if (d < bd) { bd = d; bestId = id; } }
      const row = { scenario: run.sc.id, rep: run.rep, src, idx: i, word: td.text, expected: expect[i], found: !!bestId };
      if (bestId) {
        const arr = byId.get(bestId), first = arr[0], last = arr[arr.length - 1];
        Object.assign(row, {
          first: first.target, last: last.target, mode: last.mode, conf: +last.conf.toFixed(2),
          correctFirst: first.target === expect[i], correct: last.target === expect[i],
          wordStartErrMs: last.wStart - Ts, lookupErrMs: last.t - Ts,
          latencyFirstMs: first.rcv - Te, latencyFinalMs: last.rcv - Te, nEmissions: arr.length, finalFlag: last.final, wsrc: last.wsrc,
        });
      } else Object.assign(row, { correct: false, correctFirst: false });
      rows.push(row);
    });
  }
  // pointer delivery jitter: page event time vs scheduled time
  const byXY = new Map(); for (const s of run.dispatched) (byXY.get(s.x + "," + s.y) ?? byXY.set(s.x + "," + s.y, []).get(s.x + "," + s.y)).push(s.t);
  const jit = [];
  for (const a of col.actualMoves) { const c = byXY.get(Math.round(a.x) + "," + Math.round(a.y)); if (!c) continue; let b = Infinity, bt = 0; for (const t of c) if (Math.abs(a.t - t) < b) { b = Math.abs(a.t - t); bt = t; } if (b < 60) jit.push(a.t - bt); }
  // Scribe committed word times vs batch-STT truth (the realtime ASR timing error, independent of the resolver)
  const scribeWordErr = [];
  const committed = col.scribeMsgs.filter((m) => m.type === "committed_transcript_with_timestamps" && m.words).pop();
  if (committed) for (const tw of run.truthWords) {
    const sw = committed.words.find((w) => strip(w.text) === strip(tw.text) && Math.abs(run.anchor.sock0 + w.start * 1000 - (tA0 + tw.start)) < 900);
    if (sw) scribeWordErr.push({ text: tw.text, startErr: run.anchor.sock0 + sw.start * 1000 - (tA0 + tw.start), endErr: run.anchor.sock0 + sw.end * 1000 - (tA0 + tw.end) });
  }
  const partials = col.scribeMsgs.filter((m) => m.type === "partial_transcript").length;
  return { rows, jitter: jit, scribeWordErr, meta: { scenario: run.sc.id, rep: run.rep, partials, committed: !!committed, doneRes: run.doneRes, anchorDiag: run.anchor.diag, wsLags: run.wsLags, rtt: run.rtt, tA0: run.tA0 } };
}

async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

const t0 = Date.now();
const bundlePath = await bundle();
const srv = await serve(bundlePath); const port = srv.address().port;
console.log("synth (cached when present)...");
const truth = await synthAll(OUT, args.includes("--force-synth"));
for (const sc of SCENARIOS) { const t = truth[sc.id]; const exp = sc.build(t.deictics).expect.length; if (t.deictics.length !== exp) console.warn(`WARN ${sc.id}: STT deictics ${t.deictics.length} != expected ${exp} (${t.sttText})`); }
const jobs = []; for (const sc of SCENARIOS) { if (ONLY?.length && !ONLY.includes(sc.id)) continue; if (truth[sc.id].deictics.length !== sc.build(truth[sc.id].deictics).expect.length) continue; for (let r = 0; r < REPS; r++) jobs.push({ sc, r }); }
const scored = await pool(jobs, CONC, async ({ sc, r }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const run = await runOne(sc, truth[sc.id], r, port); const s = score(run); fs.mkdirSync(path.join(OUT, "runs"), { recursive: true }); fs.writeFileSync(path.join(OUT, "runs", `${sc.id}.${r}.json`), JSON.stringify({ ...s, raw: { emissions: run.col.emissions, scribeMsgs: run.col.scribeMsgs } }, null, 1)); console.log(`ok ${sc.id}#${r} live=${s.rows.filter((x) => x.src === "live" && x.correct).length}/${s.rows.filter((x) => x.src === "live").length}`); return s; }
    catch (e) { console.warn(`fail ${sc.id}#${r} attempt ${attempt}: ${e.message}`); }
  }
  return null;
});
srv.close();
writeReport(OUT, scored.filter(Boolean), truth, { reps: REPS, concurrency: CONC, seconds: (Date.now() - t0) / 1000, failedRuns: scored.filter((x) => !x).length });
console.log("report:", path.join(OUT, "report.md"));
process.exit(0);
