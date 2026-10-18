#!/usr/bin/env node
// Step 2: narration audio per beat -> <VIDEO_DIR>/audio/<beat>.mp3 (+ durations.json, source.json).
// ElevenLabs REST when ELEVENLABS_API_KEY is set (run with: node --env-file=apps/server/.env ...), else macOS `say` placeholder.
// Env: ELEVEN_VOICE_ID (default George JBFqnCBsd6RMkjVDRZzb, an ElevenLabs default voice: the free plan blocks library voices), ELEVEN_MODEL (default eleven_multilingual_v2;
// eleven_v4 is the newest flagship per the ElevenLabs model docs), BEAT=subset, FORCE=1, VOICE=Samantha (say voice).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { loadBeats, VIDEO_DIR, FFMPEG, mkdir, readJson, writeJson, ffprobeDuration, run, log } from "./lib.mjs";

let KEY = process.env.ELEVENLABS_API_KEY || "";
let VOICE_ID = process.env.ELEVEN_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVEN_MODEL || "eleven_multilingual_v2";
const SAY_VOICE = process.env.VOICE || "Samantha";

const dir = mkdir(path.join(VIDEO_DIR, "audio"));
const durFile = path.join(dir, "durations.json");
const durations = readJson(durFile, {});

async function eleven(text, out) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } }),
  });
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200).replace(KEY, "***")}`), { status: r.status });
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}
async function say(text, out) {
  const aiff = out.replace(/\.mp3$/, ".aiff");
  await new Promise((res, rej) => { const p = spawn("say", ["-v", SAY_VOICE, "-r", "170", "-o", aiff, text]); p.on("close", (c) => (c ? rej(new Error("say failed")) : res())); });
  await run(FFMPEG, ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "128k", out]);
  fs.rmSync(aiff, { force: true });
}

/** Probe the chosen voice once. On failure fall back to the macOS `say` placeholder (labelled in the video). */
async function resolveVoice() {
  if (!KEY) return;
  const probe = path.join(dir, ".probe.mp3");
  try { await eleven("Ready.", probe); fs.rmSync(probe, { force: true }); log(`using ElevenLabs voice ${VOICE_ID}`); return; } catch (e) {
    log(`ElevenLabs voice ${VOICE_ID} unavailable (${e.message.slice(0, 90)}); using the macOS \`say\` placeholder`);
    KEY = "";
  }
}
await resolveVoice();
const provider = KEY ? `elevenlabs:${MODEL}:${VOICE_ID}` : `macos-say:${SAY_VOICE}`;

for (const b of loadBeats()) {
  const out = path.join(dir, `${b.id}.mp3`), meta = path.join(dir, `${b.id}.json`);
  const hash = crypto.createHash("sha1").update(provider + "\n" + b.narration).digest("hex");
  if (process.env.FORCE !== "1" && fs.existsSync(out) && readJson(meta, {}).hash === hash) { log(`${b.id}: audio up to date`); continue; }
  log(`${b.id}: synthesizing via ${provider.split(":")[0]}`);
  await (KEY ? eleven : say)(b.narration, out);
  durations[b.id] = await ffprobeDuration(out);
  writeJson(meta, { hash, provider, duration: durations[b.id] });
  log(`${b.id}: ${durations[b.id].toFixed(2)}s`);
}
// refresh durations for all present files
for (const b of loadBeats()) { const f = path.join(dir, `${b.id}.mp3`); if (fs.existsSync(f)) durations[b.id] = await ffprobeDuration(f); }
writeJson(durFile, durations);
writeJson(path.join(dir, "source.json"), { provider, placeholder: !KEY, note: KEY ? "ElevenLabs narration" : "PLACEHOLDER voice (macOS say). Re-run voice.mjs with ELEVENLABS_API_KEY for the real narration." });
if (!KEY) log("NOTE: no ELEVENLABS_API_KEY, used macOS `say` placeholder voice (labelled in the video).");
