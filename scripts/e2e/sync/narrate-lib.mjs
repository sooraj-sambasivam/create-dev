// Shared bits for the real-overlay sync scenario: Chrome launch, CDP client, the page shim, app driving.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const CHROME = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CDP {
  constructor(url) { this.id = 0; this.cb = new Map(); this.ws = new WebSocket(url); this.listeners = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = res; this.ws.onerror = rej;
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        const c = this.cb.get(m.id);
        if (c) { this.cb.delete(m.id); m.error ? c.rej(new Error(JSON.stringify(m.error))) : c.res(m.result); } else this.listeners.forEach((l) => l(m));
      };
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.cb.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  fire(method, params = {}) { this.ws.send(JSON.stringify({ id: ++this.id, method, params })); }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expr, ms = 15000, step = 120) {
    const t = Date.now();
    while (Date.now() - t < ms) { try { const v = await this.eval(expr); if (v) return v; } catch {} await sleep(step); }
    return false;
  }
  async shot(file) { const r = await this.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(r.data, "base64")); return file; }
  mouse(x, y, type = "mouseMoved") { return this.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 }); }
  async clickAt(x, y) { await this.mouse(x, y); await this.mouse(x, y, "mousePressed"); await this.mouse(x, y, "mouseReleased"); }
  center(sel) { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`); }
  async key(key, code, vk) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, text: key === "Enter" ? "\r" : undefined });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  }
}

/** Launches Chrome for Testing. wav: fake-mic file (played once from the moment a stream opens), or null for a silent fake device. */
export async function launch({ wav, width = 1440, height = 900, headed = false, extension = null }) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "syncprof-"));
  const chrome = spawn(CHROME, [
    ...(headed ? [] : ["--headless=new"]), "--disable-features=AudioServiceSandbox", "--remote-debugging-port=0", `--user-data-dir=${prof}`,
    "--no-first-run", "--no-default-browser-check", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    ...(wav ? [`--use-file-for-fake-audio-capture=${wav}%noloop`] : []),
    ...(extension ? [`--load-extension=${extension}`, `--disable-extensions-except=${extension}`] : []),
    "--autoplay-policy=no-user-gesture-required", `--window-size=${width},${height}`,
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "about:blank",
  ], { stdio: "ignore" });
  let dp;
  for (let i = 0; i < 100 && !dp; i++) { await sleep(100); try { dp = fs.readFileSync(path.join(prof, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
  if (!dp) { chrome.kill("SIGKILL"); throw new Error("chrome did not start"); }
  const tabs = await (await fetch(`http://127.0.0.1:${dp}/json/list`)).json();
  const cdp = new CDP(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const close = () => { try { cdp.ws.close(); } catch {} chrome.kill("SIGKILL"); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} };
  return { cdp, close, port: dp };
}

/**
 * Installed before the app loads:
 *  - getUserMedia: turns off echo cancellation / noise suppression (they gut the fake file), optionally holds the stream until
 *    __micGo(), and taps every stream with its own AudioWorklet to find the 1 kHz calibration click (an independent audio clock).
 *  - fetch log with performance.now stamps; chip text log (what the pointer bubble says, and when).
 */
export const SHIM = `(() => {
  const w = window;
  w.__taps = []; w.__fetches = []; w.__chip = []; w.__gumCalls = 0;
  let release; const gate = new Promise((r) => (release = r));
  w.__holdMic = false; w.__micGo = () => release();
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const code = \`class Tap extends AudioWorkletProcessor { constructor(){super(); this.done=false;}
    process(inputs){ const ch=inputs[0]&&inputs[0][0]; if(!ch||this.done) return true;
      for(let i=0;i<ch.length;i++) if(Math.abs(ch[i])>0.4){ this.done=true; this.port.postMessage({frame:currentFrame+i}); break; } return true; } }
    registerProcessor('tap', Tap);\`;
  navigator.mediaDevices.getUserMedia = async (c) => {
    const idx = w.__gumCalls++;
    const audio = c && c.audio;
    const cons = audio ? { ...c, audio: { ...(typeof audio === 'object' ? audio : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false } } : c;
    if (w.__holdMic) await gate;
    // The keydown MediaRecorder buffer opens a second stream; the fake device would share one file between them. Give it silence.
    if (audio && !(typeof audio === 'object' && audio.channelCount === 1)) {
      const sctx = new AudioContext(); const dest = sctx.createMediaStreamDestination(); w.__taps.push({ idx, channelCount: null, silent: true, openedAt: performance.now(), tClick: null });
      return dest.stream;
    }
    const stream = await orig(cons);
    const tap = { idx, channelCount: audio && audio.channelCount, openedAt: performance.now(), tClick: null };
    w.__taps.push(tap);
    if (audio) {
      try {
        const ctx = new AudioContext();
        await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        const src = ctx.createMediaStreamSource(stream), node = new AudioWorkletNode(ctx, 'tap'), g = ctx.createGain(); g.gain.value = 0;
        src.connect(node); node.connect(g); g.connect(ctx.destination); await ctx.resume();
        node.port.onmessage = (e) => {
          const ts = ctx.getOutputTimestamp();
          tap.tClick = ts.performanceTime + (e.data.frame / ctx.sampleRate - ts.contextTime) * 1000;
        };
      } catch (err) { tap.err = String(err); }
    }
    return stream;
  };
  const of = w.fetch.bind(w);
  w.__voice = [];
  w.fetch = (u, o) => { try { const url0 = typeof u === 'string' ? u : u.url; if (/voice-token/.test(url0)) return of(u, o).then((r) => { r.clone().json().then((j) => w.__voice.push({ t: performance.now(), provider: j.provider, reason: j.reason })).catch(() => {}); return r; }); } catch {} try { const url = typeof u === 'string' ? u : u.url; if (/\\/api\\/(route-intent|edit-node|ask)/.test(url)) w.__fetches.push({ t: performance.now(), url, body: o && typeof o.body === 'string' ? o.body.slice(0, 4000) : null }); } catch {} return of(u, o); };
  const chipText = () => { const c = document.querySelector('[data-narrate-ignore] [class*="max-w-[320px]"]'); return c && getComputedStyle(c).opacity === '1' ? c.textContent.trim() : ''; };
  let last = null;
  new MutationObserver(() => { const t = chipText(); if (t !== last) { last = t; w.__chip.push({ t: performance.now(), text: t }); } }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
})();`;

export async function openApp(cdp, base) {
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: SHIM });
  await cdp.send("Page.navigate", { url: base });
  await cdp.waitFor("document.readyState==='complete'");
  await cdp.eval(`localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}));localStorage.removeItem('create.workmode')`);
  await cdp.send("Page.navigate", { url: base });
  if (!(await cdp.waitFor(`!!document.querySelector('[data-testid="message-input"]')`, 20000))) throw new Error("composer not found");
  await sleep(500);
}

export async function generatePage(cdp, prompt = "A landing page for a coffee shop called Ember") {
  const c = await cdp.center('[data-testid="message-input"]');
  await cdp.clickAt(c.x, c.y);
  await cdp.send("Input.insertText", { text: prompt });
  await sleep(150);
  await cdp.key("Enter", "Enter", 13);
  if (!(await cdp.waitFor(`document.querySelectorAll('[data-right-panel] [data-screen-root] [data-node-id]').length>3`, 40000))) throw new Error("no page rendered");
  await sleep(900);
}

/** Opens Narrate from the Go fan. */
export async function openNarrate(cdp) {
  const go = await cdp.center('[data-testid="go"]');
  await cdp.mouse(go.x, go.y); await sleep(500);
  let nb = await cdp.center('[data-testid="narrate-button"]');
  if (!nb) { await cdp.eval(`document.querySelector('[data-testid="go"]').focus()`); await sleep(500); nb = await cdp.center('[data-testid="narrate-button"]'); }
  if (!nb) throw new Error("narrate-button not visible");
  await sleep(400);
  nb = await cdp.center('[data-testid="narrate-button"]');
  const top = await cdp.eval(`(()=>{const e=document.elementFromPoint(${nb.x},${nb.y});return e&&e.closest('[data-testid]')?.getAttribute('data-testid')})()`);
  if (top === "narrate-button") await cdp.clickAt(nb.x, nb.y); else await cdp.eval(`document.querySelector('[data-testid="narrate-button"]').click()`);
  if (!(await cdp.waitFor(`!!document.querySelector('[data-narrate-bar]')`, 10000))) throw new Error("narrate bar did not open");
  await sleep(500);
}

/**
 * Picks `n` well-separated leaf nodes of the live page whose centre really resolves to that node (same rule as the app's
 * hover resolver: the first data-node-id in the element stack inside the page root). Returns [{id,x,y,label}] with the label
 * the pointer bubble would show.
 */
export function pickTargets(cdp, n = 6) {
  return cdp.eval(`(async () => {
    const root = document.querySelector('[data-right-panel] [data-screen-root]');
    const tg = await import(performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/overlay/targets.ts'))||'/src/modes/narrate/overlay/targets.ts');
    const st = await import(performance.getEntriesByType('resource').map(r=>r.name).find(u=>u.includes('/store/screenStore.ts'))||'/src/store/screenStore.ts');
    const screen = st.useScreenStore.getState().screen;
    const pr = root.getBoundingClientRect();
    const cands = [];
    for (const el of root.querySelectorAll('[data-node-id]')) {
      if ([...el.children].some((c) => c.hasAttribute('data-node-id'))) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 16 || r.top < 70 || r.bottom > innerHeight - 70 || r.left < pr.left + 6 || r.right > pr.right - 6) continue;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = tg.resolveHoverAt(x, y);
      if (!hit || hit.id !== el.getAttribute('data-node-id')) continue;
      cands.push({ id: hit.id, x, y, label: tg.humanLabel(hit.id, screen, hit.label) });
    }
    const out = [];
    while (out.length < ${n} && cands.length) {
      let best = 0, bd = -1;
      cands.forEach((c, i) => { const d = out.length ? Math.min(...out.map((o) => Math.hypot(o.x - c.x, o.y - c.y))) : -c.y; if (d > bd) { bd = d; best = i; } });
      out.push(cands.splice(best, 1)[0]);
    }
    return out;
  })()`);
}
