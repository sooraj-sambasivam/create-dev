// Shared helpers for the demo-video pipeline: paths, a tiny CDP client over Node's global WebSocket, Chromium launch.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const VIDEO_DIR =
  process.env.VIDEO_DIR ||
  "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/video";
export const BEATS_FILE = process.env.BEATS_FILE || path.join(VIDEO_DIR, "beats.json");
export const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
export const FFPROBE = process.env.FFPROBE || "/opt/homebrew/bin/ffprobe";
export const CHROME =
  process.env.CHROME ||
  path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
export const EXT_DIR = path.join(REPO, "apps/extension");
export const DEMO_DIR = path.join(EXT_DIR, "demo");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(`[video ${new Date().toISOString().slice(11, 19)}]`, ...a);
export const mkdir = (p) => (fs.mkdirSync(p, { recursive: true }), p);
export const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };
export const writeJson = (p, v) => (mkdir(path.dirname(p)), fs.writeFileSync(p, JSON.stringify(v, null, 1)));

export function loadBeats() {
  let beats = readJson(BEATS_FILE);
  if (!Array.isArray(beats)) throw new Error(`Cannot read beats at ${BEATS_FILE}`);
  const only = (process.env.BEAT || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (only.length) beats = beats.filter((b) => only.some((o) => b.id === o || b.id.startsWith(o)));
  return beats;
}

/** Split narration into subtitle-sized sentences. */
export function sentences(text) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Static server for the extension demo pages so the content script (blocked on file:// without a manual toggle) runs. */
export function serveDemo(port = 5199) {
  const types = { ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };
  const srv = http.createServer((req, res) => {
    const p = path.join(DEMO_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, ""));
    if (!p.startsWith(DEMO_DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404).end("nf"); return; }
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }).end(fs.readFileSync(p));
  });
  return new Promise((resolve, reject) => { srv.once("error", reject); srv.listen(port, "127.0.0.1", () => resolve(srv)); });
}

export class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Set();
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
      } else if (msg.method) for (const h of this.handlers) h(msg);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws error")), { once: true }); });
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`timeout ${method}`)); }, 60000);
    });
  }
  on(h) { this.handlers.add(h); return () => this.handlers.delete(h); }
  close() { try { this.ws.close(); } catch {} }
}

/** Launch the cached Chromium; returns { cdp, proc, port, userDir, kill }. */
export async function launchChrome({ extension = false, width = 1920, height = 1080, headless = true } = {}) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-video-"));
  const args = [
    `--user-data-dir=${userDir}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check",
    `--window-size=${width},${height}`, "--force-device-scale-factor=1", "--hide-scrollbars", "--mute-audio",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-features=Translate,MediaRouter",
    "--autoplay-policy=no-user-gesture-required", "about:blank",
  ];
  if (headless) args.unshift("--headless=new");
  if (extension) args.unshift(`--load-extension=${EXT_DIR}`, `--disable-extensions-except=${EXT_DIR}`);
  const proc = spawn(CHROME, args, { stdio: ["ignore", "ignore", "ignore"] });
  const portFile = path.join(userDir, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 100 && !port; i++) { await sleep(150); try { port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]); } catch {} }
  if (!port) { proc.kill(); throw new Error("Chromium did not expose a DevTools port"); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const cdp = await Cdp.connect(ver.webSocketDebuggerUrl);
  const kill = () => { cdp.close(); try { proc.kill("SIGTERM"); } catch {} setTimeout(() => fs.rmSync(userDir, { recursive: true, force: true }), 1500); };
  return { cdp, proc, port, userDir, kill };
}

export function ffprobeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.on("close", () => resolve(parseFloat(out) || 0));
  });
}

export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let err = ""; p.stderr.on("data", (d) => (err += d)); p.stdout.on("data", () => {});
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exit ${c}\n${err.slice(-1500)}`))));
  });
}
