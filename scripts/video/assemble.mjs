#!/usr/bin/env node
// Step 3: frames + audio -> create-demo-draft.mp4 (1920x1080, 30fps) + create-demo-draft.srt.
// This ffmpeg has no drawtext/libass, so captions, title and end cards are rendered to PNG with the cached Chromium and
// composited with the overlay filter. Per-beat clips are cached in <VIDEO_DIR>/clips (skipped when inputs are unchanged).
// Env: BEAT=subset (clips only, no final concat unless all beats), FORCE=1, CAPTURE_MAX_SPEEDUP=4.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadBeats, launchChrome, VIDEO_DIR, FFMPEG, mkdir, readJson, writeJson, sentences, run, log, sleep, ffprobeDuration } from "./lib.mjs";

const W = 1920, H = 1080, FPS = 30, LEAD = 0.3, TAIL = 0.4, MAXSPEED = Number(process.env.CAPTURE_MAX_SPEEDUP || 4);
const audioDir = path.join(VIDEO_DIR, "audio"), clipDir = mkdir(path.join(VIDEO_DIR, "clips")), ovDir = mkdir(path.join(VIDEO_DIR, "overlays"));
const durations = readJson(path.join(audioDir, "durations.json"), {});
const source = readJson(path.join(audioDir, "source.json"), { placeholder: true });
const allBeats = loadBeats();
const hash = (...a) => crypto.createHash("sha1").update(a.join("|")).digest("hex").slice(0, 12);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- overlay rendering via Chromium
const FONT = `-apple-system, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif`;
let chrome, tab;
async function render(name, html, transparent) {
  const f = path.join(ovDir, `${name}-${hash(html)}.png`);
  if (fs.existsSync(f)) return f;
  if (!chrome) {
    chrome = await launchChrome({ width: W, height: H });
    const { targetId } = (await chrome.cdp.send("Target.getTargets")).targetInfos.find((t) => t.type === "page");
    const { sessionId } = await chrome.cdp.send("Target.attachToTarget", { targetId, flatten: true });
    tab = (m, p) => chrome.cdp.send(m, p, sessionId);
    await tab("Page.enable");
    await tab("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  }
  await tab("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await tab("Page.navigate", { url: "data:text/html;base64," + Buffer.from(`<!doctype html><meta charset=utf-8><style>*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:${FONT};${transparent ? "background:transparent" : ""}}</style>${html}`).toString("base64") });
  await sleep(450);
  const { data } = await tab("Page.captureScreenshot", { format: "png", fromSurface: true });
  fs.writeFileSync(f, Buffer.from(data, "base64"));
  return f;
}
const captionHtml = (t) => `<div style="position:absolute;left:0;right:0;bottom:64px;display:flex;justify-content:center"><div style="max-width:1560px;padding:18px 34px;border-radius:20px;background:rgba(12,12,16,.78);color:#fff;font-size:40px;line-height:1.28;font-weight:560;text-align:center;letter-spacing:-.01em">${esc(t)}</div></div>`;
const chipHtml = (sponsor, label) => `<div style="position:absolute;left:36px;top:17px;display:flex;gap:12px;align-items:center">
 <div style="padding:9px 18px;border-radius:999px;background:rgba(12,12,16,.78);color:#fff;font-size:24px;font-weight:650"><span style="color:#8ab4ff">Create</span>${sponsor ? ` <span style="opacity:.55">·</span> ${esc(sponsor)}` : ""}</div></div>
 ${source.placeholder ? `<div style="position:absolute;right:36px;top:17px;padding:9px 18px;border-radius:999px;background:#fff3c4;color:#6b4e00;font-size:22px;font-weight:650">Placeholder voice (macOS say)</div>` : ""}`;
const cardBg = `background:radial-gradient(1200px 700px at 78% 8%,rgba(59,130,246,.30),transparent 60%),radial-gradient(900px 600px at 10% 100%,rgba(148,163,184,.18),transparent 60%),#0b0b10`;
const cardHtml = (lines, sub) => `<div style="position:absolute;inset:0;${cardBg};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 140px;gap:26px">
 <div style="font-size:176px;font-weight:760;letter-spacing:-.04em;line-height:1">Create</div>
 ${lines.map((l, i) => `<div style="font-size:${i === 0 ? 50 : 34}px;font-weight:${i === 0 ? 600 : 500};opacity:${i === 0 ? 1 : 0.78};line-height:1.3">${esc(l)}</div>`).join("")}
 ${sub ? `<div style="margin-top:30px;padding:10px 22px;border-radius:999px;background:#fff3c4;color:#6b4e00;font-size:24px;font-weight:650">${esc(sub)}</div>` : ""}</div>`;

// ---------- helpers
const spans = (text, A) => { // subtitle timing inside a clip, proportional to sentence length
  const ss = sentences(text), total = ss.reduce((n, s) => n + s.length, 0) || 1;
  let t = LEAD; return ss.map((s) => { const d = (A * s.length) / total, r = { text: s, a: t, b: t + d }; t += d; return r; });
};
const placeholderNote = source.placeholder ? "Draft with placeholder voice. Final narration: ElevenLabs." : "";

async function frameClip(beat, out, T, items) {
  const fdir = path.join(VIDEO_DIR, "frames", beat.id), meta = readJson(path.join(fdir, "meta.json"));
  const idx = meta.index;
  const span = idx.at(-1).t - idx[0].t;
  const cap = Math.min(Math.max(span, (meta.endedAt || 0) - idx[0].t), span + 25) + 0.2;
  const list = path.join(clipDir, `${beat.id}.list.txt`);
  let txt = "ffconcat version 1.0\n";
  idx.forEach((fr, i) => { const next = i + 1 < idx.length ? idx[i + 1].t : idx[0].t + cap; txt += `file '${path.join(fdir, fr.f)}'\nduration ${Math.max(0.001, next - fr.t).toFixed(4)}\n`; });
  txt += `file '${path.join(fdir, idx.at(-1).f)}'\n`;
  fs.writeFileSync(list, txt);
  const speed = Math.min(MAXSPEED, Math.max(1, cap / T));
  return { inputs: ["-f", "concat", "-safe", "0", "-i", list], pre: `[0:v]setpts=PTS/${speed.toFixed(4)},fps=${FPS},scale=1776:999:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:${H - 999 - 0}:color=0x0b0b10,tpad=stop_mode=clone:stop_duration=60,setsar=1[base]`, speed, cap };
}

const timeline = []; // {id, start, dur, sentences}
let cursor = 0;
function srtTime(t) { const ms = Math.round(t * 1000), p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; }

const clips = [];
async function makeCard(id, T, html, audio, A, captions) {
  const png = await render(id, html, false);
  const key = hash(png, T, audio ? hash(fs.statSync(audio).size) : "", JSON.stringify(captions));
  const out = path.join(clipDir, `${id}.mp4`), keyf = out + ".key";
  if (process.env.FORCE !== "1" && fs.existsSync(out) && fs.existsSync(keyf) && fs.readFileSync(keyf, "utf8") === key) { log(`${id}: clip cached`); return out; }
  const ins = ["-loop", "1", "-framerate", String(FPS), "-t", T.toFixed(3), "-i", png];
  const caps = [];
  for (const c of captions) caps.push(await render("cap", captionHtml(c.text), true));
  const capIns = caps.flatMap((p) => ["-i", p]);
  let fc = "[0:v]format=yuv420p[b0]", last = "b0";
  captions.forEach((c, i) => { fc += `;[${last}][${i + 1}:v]overlay=0:0:enable='between(t,${c.a.toFixed(3)},${c.b.toFixed(3)})'[b${i + 1}]`; last = `b${i + 1}`; });
  const aIdx = captions.length + 1;
  const aIn = audio ? ["-i", audio] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];
  fc += `;[${aIdx}:a]${audio ? `adelay=${Math.round(LEAD * 1000)}:all=1,aresample=44100,` : ""}apad,atrim=0:${T.toFixed(3)},aformat=channel_layouts=stereo[a]`;
  await run(FFMPEG, ["-y", "-loglevel", "error", ...ins, ...capIns, ...aIn, "-filter_complex", fc, "-map", `[${last}]`, "-map", "[a]", "-t", T.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", out]);
  fs.writeFileSync(keyf, key); log(`${id}: card clip ${T.toFixed(1)}s`);
  return out;
}

try {
  // title card
  const titleLines = ["Point at anything. Get a live app you own.", "DubHacks NEXT · Perceptron · SideShift · MongoDB Atlas"];
  const tT = 3.5;
  clips.push({ id: "title", file: await makeCard("title", tT, cardHtml(titleLines, placeholderNote), null, 0, []), dur: tT, caps: [] });

  for (const beat of allBeats) {
    const A = durations[beat.id];
    if (!A) throw new Error(`no audio for ${beat.id}; run voice.mjs first`);
    const hasCard = beat.steps?.some((s) => s.do === "card");
    const fdir = path.join(VIDEO_DIR, "frames", beat.id), meta = readJson(path.join(fdir, "meta.json"));
    const caps = spans(beat.narration, A);
    const audio = path.join(audioDir, `${beat.id}.mp3`);
    if (hasCard || !meta?.frames) {
      if (!hasCard) log(`${beat.id}: WARNING no captured frames, using a caption card (run capture.mjs)`);
      const cs = beat.steps?.find((s) => s.do === "card")?.text?.split("\n") || [beat.caption];
      const T = A + LEAD + (hasCard ? 3 : TAIL);
      const f = await makeCard(beat.id, T, cardHtml(cs, placeholderNote), audio, A, caps);
      clips.push({ id: beat.id, file: f, dur: T, caps }); continue;
    }
    const T = A + LEAD + TAIL;
    const out = path.join(clipDir, `${beat.id}.mp4`), keyf = out + ".key";
    const chip = await render("chip", chipHtml(beat.sponsor), true);
    const capPngs = []; for (const c of caps) capPngs.push(await render("cap", captionHtml(c.text), true));
    const key = hash(JSON.stringify(meta.index.length), meta.endedAt, meta.startedAt, T, chip, capPngs.join(), fs.statSync(audio).size);
    if (process.env.FORCE !== "1" && fs.existsSync(out) && fs.existsSync(keyf) && fs.readFileSync(keyf, "utf8") === key) { log(`${beat.id}: clip cached`); clips.push({ id: beat.id, file: out, dur: T, caps }); continue; }
    const { inputs, pre, speed, cap } = await frameClip(beat, out, T);
    const n = 1 + capPngs.length;
    let fc = pre, last = "base";
    fc += `;[${last}][1:v]overlay=0:0[c0]`; last = "c0";
    capPngs.forEach((_, i) => { fc += `;[${last}][${i + 2}:v]overlay=0:0:enable='between(t,${caps[i].a.toFixed(3)},${caps[i].b.toFixed(3)})'[c${i + 1}]`; last = `c${i + 1}`; });
    fc += `;[${n + 1}:a]adelay=${Math.round(LEAD * 1000)}:all=1,aresample=44100,apad,atrim=0:${T.toFixed(3)},aformat=channel_layouts=stereo[a]`;
    await run(FFMPEG, ["-y", "-loglevel", "error", ...inputs, "-i", chip, ...capPngs.flatMap((p) => ["-i", p]), "-i", audio, "-filter_complex", fc, "-map", `[${last}]`, "-map", "[a]", "-t", T.toFixed(3), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", out]);
    fs.writeFileSync(keyf, key);
    log(`${beat.id}: clip ${T.toFixed(1)}s (capture ${cap.toFixed(1)}s, speed x${speed.toFixed(2)}${cap < T ? ", last frame held" : ""})`);
    clips.push({ id: beat.id, file: out, dur: T, caps });
  }
} finally { chrome?.kill(); }

// ---------- final concat + SRT (only when the whole beat list was assembled)
const subset = (process.env.BEAT || "").trim();
const outName = subset ? "create-demo-draft.partial" : "create-demo-draft";
const list = path.join(clipDir, "concat.txt");
fs.writeFileSync(list, clips.map((c) => `file '${c.file}'\n`).join(""));
const mp4 = path.join(VIDEO_DIR, `${outName}.mp4`);
await run(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", mp4]);
let t = 0, n = 1, srt = "";
for (const c of clips) { for (const s of c.caps) { srt += `${n++}\n${srtTime(t + s.a)} --> ${srtTime(t + s.b)}\n${s.text}\n\n`; } t += c.dur; }
fs.writeFileSync(path.join(VIDEO_DIR, `${outName}.srt`), srt);
log(`wrote ${mp4} (${(await ffprobeDuration(mp4)).toFixed(1)}s) and ${outName}.srt`);
