import fs from "node:fs";
import path from "node:path";

const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const r0 = (x) => (x == null ? "n/a" : Math.round(x));
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + "%" : "n/a");
const SRC_NAME = { inj: "injected (exact STT times)", ws: "webspeech-sim (lag 450 +/- jitter)", live: "scribe-live (fake mic)" };

function stats(rows) {
  const found = rows.filter((r) => r.found);
  const abs = (k) => found.map((r) => Math.abs(r[k])).filter(Number.isFinite);
  return {
    n: rows.length, found: found.length, correct: rows.filter((r) => r.correct).length, correctFirst: rows.filter((r) => r.correctFirst).length,
    startErr: { p50: q(abs("wordStartErrMs"), .5), p95: q(abs("wordStartErrMs"), .95), max: q(abs("wordStartErrMs"), 1), signedMedian: q(found.map((r) => r.wordStartErrMs), .5) },
    lookupErr: { p50: q(abs("lookupErrMs"), .5), p95: q(abs("lookupErrMs"), .95) },
    latFirst: { p50: q(found.map((r) => r.latencyFirstMs), .5), p95: q(found.map((r) => r.latencyFirstMs), .95) },
    latFinal: { p50: q(found.map((r) => r.latencyFinalMs), .5), p95: q(found.map((r) => r.latencyFinalMs), .95) },
  };
}

export function writeReport(out, scored, truth, info) {
  const all = scored.flatMap((s) => s.rows);
  const srcs = ["inj", "ws", "live"];
  const bySrc = Object.fromEntries(srcs.map((s) => [s, stats(all.filter((r) => r.src === s))]));
  const scenarios = [...new Set(all.map((r) => r.scenario))];
  const bySc = {}; for (const sc of scenarios) for (const s of srcs) (bySc[sc] ??= {})[s] = stats(all.filter((r) => r.scenario === sc && r.src === s));
  const jit = scored.flatMap((s) => s.jitter).map(Math.abs);
  const jitS = scored.flatMap((s) => s.jitter);
  const swe = scored.flatMap((s) => s.scribeWordErr);
  const scribeWord = { n: swe.length, startAbs: { p50: q(swe.map((x) => Math.abs(x.startErr)), .5), p95: q(swe.map((x) => Math.abs(x.startErr)), .95) }, startSignedMedian: q(swe.map((x) => x.startErr), .5), endAbs: { p50: q(swe.map((x) => Math.abs(x.endErr)), .5), p95: q(swe.map((x) => Math.abs(x.endErr)), .95) } };
  const deictWordErr = all.filter((r) => r.src === "live" && r.found).map((r) => r.wordStartErrMs);
  const failures = all.filter((r) => !r.correct);
  const json = { info, bySource: bySrc, byScenario: bySc, pointerDeliveryJitterMs: { n: jit.length, absP50: q(jit, .5), absP95: q(jit, .95), signedMedian: q(jitS, .5) }, scribeWordTimingVsBatchSTT: scribeWord, anchorDiag: scored.map((s) => ({ ...s.meta })), failures, rows: all, truth };
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(json, null, 1));

  const L = [];
  L.push("# Stage H sync harness report", "", `Generated ${new Date().toISOString()}. ${scored.length} runs (${info.reps} reps/scenario, concurrency ${info.concurrency}, ${info.failedRuns} failed), ${info.seconds.toFixed(0)} s.`, "",
    "Harness: `scripts/e2e/sync/run.mjs`. Core under test: `apps/web/src/sync` + `packages/shared/src/timeline.ts` (bundled with esbuild, real `createSyncSession`, DOM target resolver, pointer events from CDP `Input.dispatchMouseEvent` at 120 Hz).", "",
    "## Verdict (target: >= 95% correct and |timing error| p95 <= 150 ms)", "",
    "| source | deictics | correct (final) | correct (first emission) | word-start |err| p50 / p95 ms | lookup |err| p50 / p95 ms | verdict |", "|---|---|---|---|---|---|---|");
  for (const s of srcs) {
    const b = bySrc[s]; const ok = b.correct / b.n >= .95 && b.startErr.p95 <= 150;
    L.push(`| ${SRC_NAME[s]} | ${b.n} | ${pct(b.correct, b.n)} | ${pct(b.correctFirst, b.n)} | ${r0(b.startErr.p50)} / ${r0(b.startErr.p95)} | ${r0(b.lookupErr.p50)} / ${r0(b.lookupErr.p95)} | ${ok ? "PASS" : "FAIL"} |`);
  }
  L.push("", "Word-start error = |bound word start - batch-STT ground-truth start|. Lookup error = |time actually used to look up the pointer - truth start| (estimated words use the word midpoint minus lag, so this includes that deliberate shift).", "",
    "## End-to-end latency (truth word end -> binding emitted in page)", "", "| source | first emission p50 / p95 ms | final emission p50 / p95 ms |", "|---|---|---|");
  for (const s of srcs) { const b = bySrc[s]; L.push(`| ${SRC_NAME[s]} | ${r0(b.latFirst.p50)} / ${r0(b.latFirst.p95)} | ${r0(b.latFinal.p50)} / ${r0(b.latFinal.p95)} |`); }
  L.push("", "Scribe-live final emission happens only when the segment is committed (manual commit sent 700 ms after the utterance end), so its final latency is dominated by the commit time, not by Scribe. The first emission comes from partial transcripts with estimated times.", "",
    "## Per scenario (correct final / correct first / word-start |err| p95 ms)", "", "| scenario | " + srcs.map((s) => SRC_NAME[s]).join(" | ") + " |", "|---|" + srcs.map(() => "---").join("|") + "|");
  for (const sc of scenarios) L.push(`| ${sc} | ` + srcs.map((s) => { const b = bySc[sc][s]; return `${b.correct}/${b.n} / ${b.correctFirst}/${b.n} / ${r0(b.startErr.p95)}`; }).join(" | ") + " |");
  L.push("", "## Components measured separately", "",
    `- Scribe committed word times vs batch-STT truth (n=${scribeWord.n} words): start |err| p50 ${r0(scribeWord.startAbs.p50)} / p95 ${r0(scribeWord.startAbs.p95)} ms, signed median ${r0(scribeWord.startSignedMedian)} ms, end |err| p50 ${r0(scribeWord.endAbs.p50)} / p95 ${r0(scribeWord.endAbs.p95)} ms. This includes the audio-anchor error (AudioContext output-timestamp mapping of the fake-mic capture, input latency assumed 0) plus real-time vs batch ASR differences.`,
    `- Pointer delivery (scheduled vs page event timeStamp, n=${jit.length}): |delay| p50 ${r0(q(jit, .5))} / p95 ${r0(q(jit, .95))} ms, signed median ${r0(q(jitS, .5))} ms. The harness is the clock source for truth, so this is harness jitter, not core error.`,
    "", "## Failures", "");
  if (!failures.length) L.push("None.");
  else {
    const g = {}; for (const f of failures) (g[`${f.scenario} | ${f.src}`] ??= []).push(f);
    L.push("| scenario / source | n | detail |", "|---|---|---|");
    for (const [k, v] of Object.entries(g)) L.push(`| ${k} | ${v.length} | ` + v.slice(0, 4).map((f) => f.found ? `"${f.word}" expected ${f.expected} got ${f.last} (${f.mode}, conf ${f.conf}, startErr ${r0(f.wordStartErrMs)} ms)` : `"${f.word}" no binding`).join("; ") + " |");
  }
  L.push("", "## Assumptions and limits", "",
    "- Ground-truth word times come from ElevenLabs batch STT (`scribe_v2`, word timestamps) on the TTS audio. The pointer path is generated relative to those times, so the intended target per deictic is known by construction.",
    "- Pointer events are injected from Node over CDP. The page timeline is `performance.now`; Node-to-page offset is calibrated by a min-RTT sample. Page-side delivery jitter is reported above.",
    "- webspeech-sim feeds growing interim transcripts at (word end + 450 ms +/- jitter in [-120,+180]) to `feedWebSpeech`, with the core's default lag of 450 ms. Real Web Speech cannot run headless.",
    "- scribe-live anchor: a 1 kHz click at 800 ms in the WAV is detected in the AudioWorklet; its context time is mapped via `clock.fromAudioContextTime`. Socket time zero is the first sent block. Residual capture-path latency of the fake device is NOT corrected.",
    "- Voice is George only; one utterance per page load; same machine for Chromium, harness and (3 parallel) runs, so CPU contention can inflate jitter.");
  fs.writeFileSync(path.join(out, "report.md"), L.join("\n") + "\n");
}
