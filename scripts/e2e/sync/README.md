# Sync harness (Stage H)

Measures cursor / voice / screen binding accuracy and timing error of the sync core
(`apps/web/src/sync`, `packages/shared/src/timeline.ts`) in real Chromium.

```
node --env-file=apps/server/.env scripts/e2e/sync/run.mjs [--reps 3] [--concurrency 2] [--only id,id] [--force-synth] [--out DIR]
```

`eval:sync` is intentionally not added to the root `package.json` (other stages may be editing it).
Add `"eval:sync": "node --env-file=apps/server/.env scripts/e2e/sync/run.mjs"` when it is free.

Output (default `scratchpad/sync/`): `report.md`, `report.json`, `runs/*.json` (raw emissions), `audio/*` (TTS, truth, WAV).

## Pipeline
1. `synth.mjs`: ElevenLabs TTS (George) per scenario, then batch STT (`scribe_v2`, `timestamps_granularity=word`) for ground-truth word times. Builds the fake-mic WAV: 2 s lead with a calibration click at 800 ms, the speech, 2.5 s tail (48 kHz stereo s16).
2. `scenarios.mjs` + `path.mjs`: pointer paths (bezier sweeps, dwells, fast passes) laid out relative to the measured deictic word times, so the intended target per word is known.
3. `run.mjs`: bundles the core with esbuild (from the pnpm store), serves `fixture/` (6 targets A-F), launches Chrome for Testing headless with the fake mic, injects the path with CDP `Input.dispatchMouseEvent` at 120 Hz, and arms three parallel sessions in the page (`harness-page.js`):
   - `inj`: exact STT word times injected at word end
   - `ws`: Web Speech simulation (interim transcripts ~450 ms +/- jitter after each word)
   - `live`: real Scribe realtime (`include_timestamps=true`) fed from the fake mic through an AudioWorklet; audio anchored with the click and `AudioContext.getOutputTimestamp`.
4. `report.mjs`: accuracy, |error| p50/p95, latency, failure modes.

## Chromium notes (verified)
- `--use-file-for-fake-audio-capture` delivers only silence unless `--disable-features=AudioServiceSandbox` is set.
- `getUserMedia` must disable echoCancellation/noiseSuppression/autoGainControl or the processed signal is gutted.
- Plain `ffmpeg` WAV (48 kHz stereo s16, no metadata) is accepted. `%noloop` works.
- ElevenLabs plan allows 2 concurrent requests; keep `--concurrency <= 2` (realtime Scribe sockets count).
