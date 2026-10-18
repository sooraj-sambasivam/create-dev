#!/usr/bin/env node
// End-to-end sync scenario through the REAL narrate overlay: real app (vite :5175 -> mock API), real Chromium with a fake mic playing
// the harness TTS audio, real ElevenLabs Scribe realtime, pointer moves injected over CDP at 120 Hz along the harness paths mapped
// onto six live page nodes. Scores the deictic bindings the product produced, the pointer bubble, and the command it sent.
//
//   node --env-file=apps/server/.env scripts/e2e/sync/narrate.mjs [--reps 1] [--only id,id] [--base http://localhost:5175] [--out DIR] [--audio DIR]
//
// Needs the harness audio (run scripts/e2e/sync/run.mjs once; it caches audio/*.wav + *.truth.json in its out dir).
import fs from "node:fs";
import path from "node:path";
import { SCENARIOS } from "./scenarios.mjs";
import { CLICK_MS } from "./synth.mjs";
import { setLayout } from "./path.mjs";
import { launch, openApp, generatePage, openNarrate, pickTargets, sleep } from "./narrate-lib.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const SCRATCH = "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad";
const BASE = opt("base", process.env.BASE_URL || "http://localhost:5175");
const OUT = opt("out", path.join(SCRATCH, "sync-e2e"));
const AUDIO = opt("audio", path.join(SCRATCH, "sync/audio"));
const REPS = +opt("reps", 1);
const ONLY = opt("only", "").split(",").filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

const strip = (s) => s.toLowerCase().replace(/[^a-z']/g, "");
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r0 = (x) => (x == null ? "n/a" : Math.round(x));
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + "%" : "n/a");

async function runOne(sc, truth, rep) {
  const { cdp, close } = await launch({ wav: path.join(AUDIO, sc.id + ".wav") });
  try {
    await openApp(cdp, BASE);
    await generatePage(cdp);
    const targets = await pickTargets(cdp, 6);
    if (targets.length < 6) throw new Error(`only ${targets.length} usable page nodes`);
    const letters = "ABCDEF".split("");
    setLayout(Object.fromEntries(targets.map((t, i) => [letters[i], [t.x, t.y]])), [140, 520]);
    const idOf = Object.fromEntries(targets.map((t, i) => [letters[i], t.id]));
    const labelOf = Object.fromEntries(targets.map((t, i) => [letters[i], t.label]));
    const { path: P, expect } = sc.build(truth.deictics);

    await cdp.mouse(140, 520);
    await openNarrate(cdp); // the mic opens here; the fake file starts playing
    const anchor = await cdp.waitFor(`(()=>{const t=window.__taps.find(t=>t.channelCount===1&&t.tClick!=null);return t?{tClick:t.tClick,idx:t.idx,taps:window.__taps.length}:null})()`, 12000, 40);
    if (!anchor) throw new Error("no calibration click on the live mic stream: " + JSON.stringify(await cdp.eval("({taps:window.__taps,voice:window.__voice,gum:window.__gumCalls,fetches:window.__fetches.length})")));
    const tA0 = anchor.tClick - CLICK_MS;

    // node <-> page clock offset
    let best = null;
    for (let i = 0; i < 25; i++) { const n0 = performance.now(); const p = await cdp.eval("performance.now()"); const n1 = performance.now(); if (!best || n1 - n0 < best.rtt) best = { rtt: n1 - n0, off: p - (n0 + n1) / 2 }; }
    const toNode = (pageT) => pageT - best.off;
    const sched = P.samples.map((s) => ({ t: tA0 + s.t, x: Math.round(s.x), y: Math.round(s.y) }));
    const nowP = await cdp.eval("performance.now()");
    const startIdx = sched.findIndex((s) => s.t > nowP + 40);
    if (startIdx > 0) cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x: sched[startIdx - 1].x, y: sched[startIdx - 1].y });
    for (let i = Math.max(0, startIdx); i < sched.length; i++) {
      const tNode = toNode(sched[i].t);
      const d = tNode - performance.now();
      if (d > 4) await sleep(d - 3);
      while (performance.now() < tNode) {}
      cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x: sched[i].x, y: sched[i].y });
    }
    // Wait for the product to finish the line: a command request (or a timeout past the utterance end).
    const endP = tA0 + truth.utteranceEndMs;
    const deadline = Date.now() + Math.max(2000, endP - (await cdp.eval("performance.now()"))) + 9000;
    while (Date.now() < deadline) {
      if (await cdp.eval(`window.__fetches.some(f=>/route-intent|\\/api\\/ask/.test(f.url))`)) break;
      await sleep(150);
    }
    await sleep(1200);
    await cdp.shot(path.join(OUT, `${sc.id}.${rep}.png`));
    const col = await cdp.eval(`JSON.stringify({ log: window.__createNarrate ? window.__createNarrate.log : null, fetches: window.__fetches, chip: window.__chip,
      words: window.__createNarrate ? window.__createNarrate.sync.session.snapshot().words.map(w=>({text:w.text,start:w.start,end:w.end,final:w.final,source:w.source})) : null, taps: window.__taps })`).then(JSON.parse);
    if (!col.log) throw new Error("no __createNarrate.log (dev server required)");
    return { sc, rep, tA0, expect, idOf, labelOf, truth, col };
  } finally { close(); }
}

function score(run) {
  const { tA0, truth, expect, idOf, labelOf, col } = run;
  const items = col.log.flatMap((e) => e.targets.map((t) => ({ ...t, at: e.t })));
  const rows = [];
  truth.deictics.forEach((td, i) => {
    const Ts = tA0 + td.start, Te = tA0 + td.end;
    const cand = items.filter((it) => strip(it.w) === strip(td.text) && Math.abs(it.s - Ts) < 900);
    const byId = new Map(); for (const it of cand) (byId.get(it.b) ?? byId.set(it.b, []).get(it.b)).push(it);
    let bestId = null, bd = Infinity;
    for (const [id, arr] of byId) { const d = Math.abs(arr[arr.length - 1].s - Ts); if (d < bd) { bd = d; bestId = id; } }
    const row = { scenario: run.sc.id, rep: run.rep, idx: i, word: td.text, expected: expect[i], found: !!bestId };
    if (bestId) {
      const arr = byId.get(bestId), first = arr[0], last = arr[arr.length - 1];
      const finals = arr.filter((x) => x.f);
      const fin = finals.length ? finals[finals.length - 1] : last;
      Object.assign(row, {
        first: first.id, last: fin.id, correctFirst: first.id === idOf[expect[i]], correct: fin.id === idOf[expect[i]],
        wordStartErrMs: fin.s - Ts, latencyFirstMs: first.at - Te, latencyFinalMs: (finals[0] ?? last).at - Te, final: !!finals.length,
      });
    } else Object.assign(row, { correct: false, correctFirst: false });
    // does the bubble name the node the first (estimated) binding found, and how soon after that binding?
    if (i === 0 && bestId) {
      const arr = byId.get(bestId), first = arr[0];
      const want = labelOf[expect[0]];
      if (first.id === idOf[expect[0]] && want) {
        const before = [...col.chip].filter((c) => c.t <= first.at - 30).pop();
        const hit = col.chip.find((c) => c.t >= first.at - 30 && c.text.includes(want));
        row.bubbleLagMs = before && before.text.includes(want) ? 0 : hit ? Math.max(0, hit.t - first.at) : null;
      }
    }
    rows.push(row);
  });
  // the command the product sent
  const cmd = col.fetches.find((f) => /route-intent/.test(f.url));
  let cmdInfo = { sent: !!cmd };
  if (cmd) {
    let body = {}; try { body = JSON.parse(cmd.body); } catch {}
    const want = [...new Set(expect.map((l) => idOf[l]))];
    const got = (body.candidates || []).map((c) => c.id);
    cmdInfo = {
      sent: true, latencyMs: cmd.t - (tA0 + truth.utteranceEndMs), pointer: body.pointer?.targetId ?? null,
      pointerCorrect: body.pointer?.targetId === idOf[expect[0]], candidatesCorrect: want.length > 1 ? want.every((w) => got.includes(w)) : got.includes(want[0]),
      annotated: /\(.+ · .+\)|\([A-Z][a-z]+\)/.test(body.transcript || "") , transcript: body.transcript,
    };
    const edit = col.fetches.find((f) => /edit-node/.test(f.url) && f.t >= cmd.t);
    if (edit) { try { cmdInfo.editNode = JSON.parse(edit.body).nodeId ?? JSON.parse(edit.body).id ?? null; } catch {} cmdInfo.editCorrect = cmdInfo.editNode === idOf[expect[0]]; }
  }
  const wordErr = [];
  for (const tw of truth.words) {
    const sw = (col.words || []).filter((w) => w.source === "scribe" && w.final).find((w) => strip(w.text) === strip(tw.text) && Math.abs(w.start - (tA0 + tw.start)) < 900);
    if (sw) wordErr.push(sw.start - (tA0 + tw.start));
  }
  return { rows, cmd: { scenario: run.sc.id, rep: run.rep, ...cmdInfo }, wordErr, anchorTaps: col.taps.map((t) => ({ idx: t.idx, ch: t.channelCount, openedAt: Math.round(t.openedAt), tClick: t.tClick && Math.round(t.tClick), err: t.err })) };
}

function report(all) {
  const rows = all.flatMap((s) => s.rows), cmds = all.map((s) => s.cmd), werr = all.flatMap((s) => s.wordErr);
  const found = rows.filter((r) => r.found);
  const abs = (k) => found.map((r) => Math.abs(r[k])).filter(Number.isFinite);
  const L = [];
  L.push("# Sync end-to-end through the real narrate overlay", "", `Generated ${new Date().toISOString()}. ${all.length} runs (${REPS} rep(s)/scenario). Real app at ${BASE}, real Chromium with fake mic (harness TTS audio), real ElevenLabs Scribe realtime (VAD commit 0.5 s, word timestamps), pointer injected over CDP at 120 Hz onto six live page nodes.`, "",
    "## Deictic bindings produced by the product", "", "| deictics | correct (final) | correct (first, estimated) | word-start |err| p50 / p95 ms | first binding after word end p50 / p95 ms | final binding after word end p50 / p95 ms |", "|---|---|---|---|---|---|");
  L.push(`| ${rows.length} | ${pct(rows.filter((r) => r.correct).length, rows.length)} | ${pct(rows.filter((r) => r.correctFirst).length, rows.length)} | ${r0(q(abs("wordStartErrMs"), .5))} / ${r0(q(abs("wordStartErrMs"), .95))} | ${r0(q(found.map((r) => r.latencyFirstMs), .5))} / ${r0(q(found.map((r) => r.latencyFirstMs), .95))} | ${r0(q(found.map((r) => r.latencyFinalMs), .5))} / ${r0(q(found.map((r) => r.latencyFinalMs), .95))} |`);
  const bub = rows.map((r) => r.bubbleLagMs).filter((x) => x != null);
  L.push("", `Pointer bubble named the bound node for the first deictic in ${bub.length}/${all.length} runs where the first binding was right, ${r0(q(bub, .5))} ms (p50) / ${r0(q(bub, .95))} ms (p95) after that binding was emitted.`);
  L.push(`Scribe word starts vs batch-STT truth (n=${werr.length}): |err| p50 ${r0(q(werr.map(Math.abs), .5))} / p95 ${r0(q(werr.map(Math.abs), .95))} ms, signed median ${r0(q(werr, .5))} ms (includes the product's own audio anchor against an independent click tap).`);
  L.push("", "## Command sent to /api/route-intent", "", "| scenario | sent | pointer = first target | candidates complete | transcript names each target | edit-node on first target | ms after speech end |", "|---|---|---|---|---|---|---|");
  for (const c of cmds) L.push(`| ${c.scenario}#${c.rep} | ${c.sent ? "yes" : "NO"} | ${c.pointerCorrect ? "yes" : "no"} | ${c.candidatesCorrect ? "yes" : "no"} | ${c.annotated ? "yes" : "-"} | ${c.editCorrect === undefined ? "n/a" : c.editCorrect ? "yes" : "no"} | ${r0(c.latencyMs)} |`);
  L.push("", "## Per scenario (correct final / correct first)", "", "| scenario | correct final | correct first |", "|---|---|---|");
  for (const sc of [...new Set(rows.map((r) => r.scenario))]) { const r = rows.filter((x) => x.scenario === sc); L.push(`| ${sc} | ${r.filter((x) => x.correct).length}/${r.length} | ${r.filter((x) => x.correctFirst).length}/${r.length} |`); }
  const bad = rows.filter((r) => !r.correct);
  L.push("", "## Failures", "");
  if (!bad.length) L.push("None."); else for (const f of bad) L.push(`- ${f.scenario}#${f.rep} "${f.word}" expected ${f.expected}: ${f.found ? `got ${f.last} (first ${f.first})` : "no binding"}`);
  L.push("", "## Limits", "", "- Mock API (MOCK_AI=1): the route-intent/edit-node answers are canned, so this scores what the product BOUND and SENT, not what the model did with it.", "- Fake mic, one utterance per page load, same machine for Chromium, Node and the dev server.", "- Anchor truth is an independent AudioWorklet tap on the same fake stream (1 kHz click at 800 ms).");
  fs.writeFileSync(path.join(OUT, "report-overlay.md"), L.join("\n") + "\n");
  fs.writeFileSync(path.join(OUT, "report-overlay.json"), JSON.stringify({ rows, cmds, wordErr: werr, runs: all.map((s) => ({ scenario: s.cmd.scenario, rep: s.cmd.rep, taps: s.anchorTaps })) }, null, 1));
}

const truth = Object.fromEntries(SCENARIOS.map((sc) => [sc.id, JSON.parse(fs.readFileSync(path.join(AUDIO, sc.id + ".truth.json"), "utf8"))]));
const jobs = []; for (const sc of SCENARIOS) { if (ONLY.length && !ONLY.includes(sc.id)) continue; for (let r = 0; r < REPS; r++) jobs.push({ sc, r }); }
const scored = [];
for (const { sc, r } of jobs) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const run = await runOne(sc, truth[sc.id], r); const s = score(run); scored.push(s); console.log(`ok ${sc.id}#${r}: ${s.rows.filter((x) => x.correct).length}/${s.rows.length} correct, cmd ${s.cmd.sent ? (s.cmd.pointerCorrect ? "ok" : "wrong target") : "NOT SENT"}`); break; }
    catch (e) { console.warn(`fail ${sc.id}#${r} attempt ${attempt}: ${e.message}`); }
  }
}
report(scored);
console.log("report:", path.join(OUT, "report-overlay.md"));
process.exit(0);
