// TTS (George) + batch STT with word timestamps -> ground-truth word times; builds the fake-mic WAV.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { SCENARIOS } from "./scenarios.mjs";

export const LEAD_MS = 2000, CLICK_MS = 800, TAIL_MS = 2500;
const VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George
const key = () => { if (!process.env.ELEVENLABS_API_KEY) throw new Error("run with node --env-file=apps/server/.env"); return process.env.ELEVENLABS_API_KEY; };
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const strip = (s) => s.toLowerCase().replace(/[^a-z']/g, "");
export const DEICTIC = new Set(["this", "that", "these", "those", "here", "there", "it", "one"]);

async function retry(f) { for (let i = 0; ; i++) { const r = await f(); if (r.status !== 429 || i > 6) return r; await new Promise((x) => setTimeout(x, 1500 * (i + 1))); } }

export async function synthAll(outDir, force = false) {
  const dir = path.join(outDir, "audio"); fs.mkdirSync(dir, { recursive: true });
  const res = {};
  const queue = [...SCENARIOS];
  // ElevenLabs plan allows 2 concurrent requests
  const worker = async () => { for (let sc; (sc = queue.shift()); ) await one(sc); };
  const one = async (sc) => {
    const base = path.join(dir, sc.id), meta = base + ".truth.json";
    if (!force && fs.existsSync(meta) && fs.existsSync(base + ".wav")) { res[sc.id] = JSON.parse(fs.readFileSync(meta, "utf8")); return; }
    const tts = await retry(() => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=pcm_16000`, {
      method: "POST", headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ text: sc.text, model_id: "eleven_multilingual_v2" }),
    }));
    if (!tts.ok) throw new Error(`tts ${sc.id} ${tts.status} ${await tts.text()}`);
    const pcm = Buffer.from(await tts.arrayBuffer());
    // ground-truth word times from batch STT (scribe_v2, word timestamps) on the TTS-only audio
    fs.writeFileSync(base + ".tts.pcm", pcm);
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", base + ".tts.pcm", base + ".tts.wav"]);
    const fd = new FormData();
    fd.set("model_id", "scribe_v2"); fd.set("timestamps_granularity", "word"); fd.set("language_code", "eng");
    fd.set("file", new Blob([fs.readFileSync(base + ".tts.wav")], { type: "audio/wav" }), "a.wav");
    const stt = await retry(() => fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key() }, body: fd }));
    if (!stt.ok) throw new Error(`stt ${sc.id} ${stt.status} ${await stt.text()}`);
    const j = await stt.json();
    const words = (j.words || []).filter((w) => w.type === "word").map((w) => ({
      text: w.text, start: LEAD_MS + w.start * 1000, end: LEAD_MS + w.end * 1000,
    }));
    const deictics = words.filter((w) => DEICTIC.has(strip(w.text)));
    // file = lead silence (click at CLICK_MS) + tts + tail
    const sr = 16000, lead = Buffer.alloc((LEAD_MS / 1000) * sr * 2), tail = Buffer.alloc((TAIL_MS / 1000) * sr * 2);
    const c0 = Math.round((CLICK_MS / 1000) * sr);
    for (let i = 0; i < 80; i++) lead.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 1000 * i) / sr) * 0.9 * 32767), (c0 + i) * 2);
    fs.writeFileSync(base + ".raw", Buffer.concat([lead, pcm, tail]));
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "s16le", "-ar", "16000", "-ac", "1", "-i", base + ".raw", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", base + ".wav"]);
    const out = { id: sc.id, text: sc.text, sttText: j.text, words, deictics, ttsMs: (pcm.length / 32000) * 1000, utteranceEndMs: LEAD_MS + (pcm.length / 32000) * 1000 };
    fs.writeFileSync(meta, JSON.stringify(out, null, 1));
    res[sc.id] = out;
  };
  await Promise.all([worker(), worker()]);
  return res;
}
