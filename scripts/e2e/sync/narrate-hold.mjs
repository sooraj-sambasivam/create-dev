#!/usr/bin/env node
// Hold-to-talk (Option held anywhere, no Narrate mode) through the real app: same fake mic, real Scribe, CDP pointer paths as narrate.mjs.
// Scores the command HoldToTalk sends: pointer = what the first deictic was said over, candidates = every node named, source edited.
//
//   node --env-file=apps/server/.env scripts/e2e/sync/narrate-hold.mjs [--reps 1] [--only id,id]
import fs from "node:fs";
import path from "node:path";
import { SCENARIOS } from "./scenarios.mjs";
import { CLICK_MS } from "./synth.mjs";
import { setLayout } from "./path.mjs";
import { launch, openApp, generatePage, pickTargets, sleep } from "./narrate-lib.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i < 0 ? d : args[i + 1]; };
const SCRATCH = "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad";
const BASE = opt("base", process.env.BASE_URL || "http://localhost:5175");
const OUT = opt("out", path.join(SCRATCH, "sync-e2e"));
const AUDIO = opt("audio", path.join(SCRATCH, "sync/audio"));
const REPS = +opt("reps", 1);
const ONLY = opt("only", "make-this-bigger,move-this-over-here,that-after-leaving,hover-change,put-these-here").split(",").filter(Boolean);
const r0 = (x) => (x == null ? "n/a" : Math.round(x));

async function runOne(sc, truth, rep) {
  const { cdp, close } = await launch({ wav: path.join(AUDIO, sc.id + ".wav") });
  try {
    await openApp(cdp, BASE);
    await generatePage(cdp);
    const targets = await pickTargets(cdp, 6);
    if (targets.length < 6) throw new Error("too few page nodes");
    const letters = "ABCDEF".split("");
    setLayout(Object.fromEntries(targets.map((t, i) => [letters[i], [t.x, t.y]])), [140, 520]);
    const idOf = Object.fromEntries(targets.map((t, i) => [letters[i], t.id]));
    const { path: P, expect } = sc.build(truth.deictics);
    await cdp.mouse(140, 520); await sleep(200);
    const alt = (type) => cdp.send("Input.dispatchKeyEvent", { type, key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18, modifiers: type === "keyDown" ? 1 : 0 });
    await cdp.eval("document.activeElement && document.activeElement.blur()"); await alt("keyDown"); // the mic opens now; the fake file starts playing
    const anchor = await cdp.waitFor(`(()=>{const t=window.__taps.find(t=>t.channelCount===1&&t.tClick!=null);return t?{tClick:t.tClick}:null})()`, 12000, 40);
    if (!anchor) throw new Error("no calibration click: " + JSON.stringify(await cdp.eval("({taps:window.__taps,voice:window.__voice})")));
    const tA0 = anchor.tClick - CLICK_MS;
    let best = null;
    for (let i = 0; i < 25; i++) { const n0 = performance.now(); const p = await cdp.eval("performance.now()"); const n1 = performance.now(); if (!best || n1 - n0 < best.rtt) best = { rtt: n1 - n0, off: p - (n0 + n1) / 2 }; }
    const toNode = (t) => t - best.off;
    const sched = P.samples.map((s) => ({ t: tA0 + s.t, x: Math.round(s.x), y: Math.round(s.y) }));
    const nowP = await cdp.eval("performance.now()");
    const startIdx = sched.findIndex((s) => s.t > nowP + 40);
    if (startIdx > 0) cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x: sched[startIdx - 1].x, y: sched[startIdx - 1].y });
    for (let i = Math.max(0, startIdx); i < sched.length; i++) {
      const tNode = toNode(sched[i].t); const d = tNode - performance.now();
      if (d > 4) await sleep(d - 3);
      while (performance.now() < tNode) {}
      cdp.fire("Input.dispatchMouseEvent", { type: "mouseMoved", x: sched[i].x, y: sched[i].y });
    }
    // release a little after the line ends
    const relP = tA0 + truth.utteranceEndMs + 300;
    const wait = toNode(relP) - performance.now(); if (wait > 0) await sleep(wait);
    const releasedAt = await cdp.eval("performance.now()");
    await alt("keyUp");
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (await cdp.eval(`window.__fetches.some(f=>/route-intent|\\/api\\/ask/.test(f.url))`)) break; await sleep(100); }
    await sleep(800);
    const col = await cdp.eval(`JSON.stringify({ fetches: window.__fetches, chip: window.__chip })`).then(JSON.parse);
    const cmd = col.fetches.find((f) => /route-intent/.test(f.url));
    const out = { scenario: sc.id, rep, sent: !!cmd };
    if (cmd) {
      let body = {}; try { body = JSON.parse(cmd.body); } catch {}
      const want = [...new Set(expect.map((l) => idOf[l]))], got = (body.candidates || []).map((c) => c.id);
      Object.assign(out, {
        pointerCorrect: body.pointer?.targetId === idOf[expect[0]], candidatesCorrect: want.every((w) => got.includes(w)), transcript: body.transcript,
        afterReleaseMs: cmd.t - releasedAt,
      });
      const edit = col.fetches.find((f) => /edit-node/.test(f.url) && f.t >= cmd.t);
      if (edit) { try { out.editCorrect = JSON.parse(edit.body).nodeId === idOf[expect[0]]; } catch {} }
    }
    await cdp.shot(path.join(OUT, `hold-${sc.id}.${rep}.png`));
    return out;
  } finally { close(); }
}

const truth = Object.fromEntries(SCENARIOS.map((sc) => [sc.id, JSON.parse(fs.readFileSync(path.join(AUDIO, sc.id + ".truth.json"), "utf8"))]));
const rows = [];
for (const sc of SCENARIOS.filter((s) => ONLY.includes(s.id))) for (let r = 0; r < REPS; r++) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { const x = await runOne(sc, truth[sc.id], r); rows.push(x); console.log(JSON.stringify(x)); break; }
    catch (e) { console.warn(`fail ${sc.id}#${r} attempt ${attempt}: ${e.message.slice(0, 200)}`); await sleep(attempt ? 20000 : 8000); }
  }
}
const L = ["# Hold-to-talk through the real app", "", `Generated ${new Date().toISOString()}. Option held from before the line to ~0.3 s after it; pointer paths from the harness scenarios; real Scribe via the fake mic.`, "",
  "| scenario | sent | pointer = first target | candidates complete | edit-node on first target | ms after release |", "|---|---|---|---|---|---|"];
for (const r of rows) L.push(`| ${r.scenario}#${r.rep} | ${r.sent ? "yes" : "NO"} | ${r.pointerCorrect ? "yes" : "no"} | ${r.candidatesCorrect ? "yes" : "no"} | ${r.editCorrect === undefined ? "n/a" : r.editCorrect ? "yes" : "no"} | ${r0(r.afterReleaseMs)} |`);
const ok = rows.filter((r) => r.sent && r.pointerCorrect && r.candidatesCorrect).length;
L.push("", `${ok}/${rows.length} runs sent the right command.`);
fs.writeFileSync(path.join(OUT, "report-hold.md"), L.join("\n") + "\n");
console.log(L.join("\n"));
process.exit(0);
