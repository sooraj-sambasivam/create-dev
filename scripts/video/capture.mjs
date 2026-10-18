#!/usr/bin/env node
// Step 1: drive each beat in headless Chromium (extension loaded) over CDP and record Page.startScreencast frames.
// Output: <VIDEO_DIR>/frames/<beat>/NNNNN.jpg + meta.json (timestamps, warnings). Idempotent: beats with meta.json are skipped
// unless FORCE=1. Env: BEAT=b1,b2 (subset), USE_REAL=1 (route /api to :3002 and point the extension at it), LOOK=paper|luminous.
import fs from "node:fs";
import path from "node:path";
import { launchChrome, serveDemo, loadBeats, VIDEO_DIR, mkdir, readJson, writeJson, sleep, log } from "./lib.mjs";

const WEB = process.env.WEB_ORIGIN || "http://localhost:5175";
const REAL = process.env.USE_REAL === "1";
const API = process.env.API_ORIGIN || (REAL ? "http://localhost:3002" : "http://localhost:3001");
const LOOK = process.env.LOOK || "paper";
const DEMO_PORT = 5199;
const W = 1920, H = 1080;
const demoUrl = (u) => (u || "").replace(/^file:\/\/.*\/apps\/extension\/demo\//, `http://localhost:${DEMO_PORT}/`);

const beats = loadBeats();
const pending = beats.filter((b) => process.env.FORCE === "1" || !fs.existsSync(path.join(VIDEO_DIR, "frames", b.id, "meta.json")));
if (!pending.length) { log("capture: all beats already captured (FORCE=1 to redo)"); process.exit(0); }
for (const [name, url] of [["web", WEB + "/"], ["api", API + "/api/health"]]) {
  try { await fetch(url, { signal: AbortSignal.timeout(3000) }); } catch { console.error(`capture: ${name} not reachable at ${url}`); process.exit(2); }
}

const demo = await serveDemo(DEMO_PORT);
const { cdp, kill } = await launchChrome({ extension: true, width: W, height: H });
const cleanup = () => { try { demo.close(); } catch {} kill(); };
process.on("SIGINT", () => { cleanup(); process.exit(130); });

const SEED = `(() => { try {
  if (location.origin === ${JSON.stringify(WEB)}) {
    const p = JSON.parse(localStorage.getItem("create.profile") || "null");
    if (!p || !p.state || !p.state.onboarded) localStorage.setItem("create.profile", JSON.stringify({ state: { intent: "both", level: "some", onboarded: true, onboardingSkipped: false, onboardingVersion: 99, defaultMode: "code" }, version: 0 }));
    if (!localStorage.getItem("create-look")) localStorage.setItem("create-look", ${JSON.stringify(LOOK)});
  } } catch {} })();`;

// Visible synthetic cursor; follows real (CDP-dispatched) mouse events, ripples on press. Plus a selector finder.
const OVERLAY = `(() => {
  if (window.__cc) return;
  const mk = () => {
    if (document.getElementById("__cc-cursor")) return;
    const c = document.createElement("div"); c.id = "__cc-cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:34px;height:34px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);will-change:transform;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 28 28"><path d="M4 2l17 10-7.5 1.8L10 21z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    (document.documentElement).appendChild(c); window.__ccEl = c;
    if (window.__ccLast) c.style.transform = "translate(" + window.__ccLast[0] + "px," + window.__ccLast[1] + "px)";
  };
  window.__cc = true;
  const mv = (x, y) => { window.__ccLast = [x, y]; if (window.__ccEl) window.__ccEl.style.transform = "translate(" + x + "px," + y + "px)"; };
  window.__ccMove = mv;
  addEventListener("mousemove", (e) => mv(e.clientX, e.clientY), true);
  addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;left:" + (e.clientX - 18) + "px;top:" + (e.clientY - 18) + "px;width:36px;height:36px;border-radius:50%;border:3px solid #e11d8f;opacity:.9;transition:transform .45s ease-out,opacity .45s";
    document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.transform = "scale(1.9)"; r.style.opacity = "0"; }); setTimeout(() => r.remove(), 600);
  }, true);
  if (document.documentElement) mk(); else addEventListener("DOMContentLoaded", mk);
  new MutationObserver(() => { if (!document.getElementById("__cc-cursor") && document.documentElement) mk(); }).observe(document, { childList: true });
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
  window.__find = (sel) => {
    for (const part of sel.split(/,\\s*(?![^()]*\\))/)) {
      const m = part.trim().match(/^(.*?):has-text\\('(.*)'\\)$/);
      let list;
      try { list = m ? [...document.querySelectorAll(m[1] || "*")].filter((e) => (e.textContent || "").toLowerCase().includes(m[2].toLowerCase()) && ![...e.children].some((k) => (k.textContent || "").toLowerCase().includes(m[2].toLowerCase()))) : [...document.querySelectorAll(part.trim())]; } catch { list = []; }
      const el = list.find(vis) || null; if (el) return el;
    }
    return null;
  };
})();`;

const state = { src: null, app: null, pos: [W / 2, H / 2], warnings: [], rec: null, paused: false };
const tabs = new Map(); // sessionId -> tab

async function attach(targetId, opts = {}) {
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const tab = { targetId, sessionId };
  tab.send = (m, p) => cdp.send(m, p, sessionId);
  tab.eval = async (expression) => {
    const r = await tab.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval error");
    return r.result.value;
  };
  await tab.send("Runtime.enable");
  if (opts.worker) return tab;
  await tab.send("Page.enable");
  await tab.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: SEED });
  await tab.send("Page.addScriptToEvaluateOnNewDocument", { source: OVERLAY });
  if (REAL) await tab.send("Fetch.enable", { patterns: [{ urlPattern: `${WEB}/api/*` }] });
  tabs.set(sessionId, tab);
  try { await tab.eval(SEED + ";" + OVERLAY); await tab.eval(`window.__ccMove&&window.__ccMove(${state.pos[0]},${state.pos[1]})`); } catch {}
  return tab;
}

cdp.on(async (m) => {
  if (m.method === "Fetch.requestPaused") {
    const t = tabs.get(m.sessionId); if (!t) return;
    const u = m.params.request.url.replace(WEB, API);
    t.send("Fetch.continueRequest", { requestId: m.params.requestId, url: u }).catch(() => {});
  }
  if (m.method === "Page.screencastFrame") {
    const r = state.rec;
    const ack = () => cdp.send("Page.screencastFrameAck", { sessionId: m.params.sessionId }, m.sessionId).catch(() => {});
    if (r && r.tab.sessionId === m.sessionId && !state.paused) {
      const f = `${String(r.frames.length).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(r.dir, f), Buffer.from(m.params.data, "base64"));
      r.frames.push({ f, t: m.params.metadata.timestamp });
    }
    ack();
  }
});

// ---- recorder
async function recStart(tab) {
  const r = state.rec;
  if (r.tab) await r.tab.send("Page.stopScreencast").catch(() => {});
  r.tab = tab;
  await tab.send("Page.bringToFront").catch(() => {});
  await tab.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
}
async function beginBeat(id) {
  const dir = path.join(VIDEO_DIR, "frames", id);
  fs.rmSync(dir, { recursive: true, force: true }); mkdir(dir);
  state.warnings = []; state.rec = { dir, frames: [], tab: null, startedAt: Date.now() / 1000 };
}
async function endBeat(id, extra = {}) {
  const r = state.rec;
  if (r.tab) await r.tab.send("Page.stopScreencast").catch(() => {});
  const fr = r.frames;
  writeJson(path.join(r.dir, "meta.json"), {
    id, frames: fr.length, startT: fr[0]?.t ?? 0, endT: fr.at(-1)?.t ?? 0,
    duration: fr.length ? fr.at(-1).t - fr[0].t : 0, index: fr, warnings: state.warnings, real: REAL, startedAt: r.startedAt, endedAt: Date.now() / 1000, ...extra,
  });
  log(`${id}: ${fr.length} frames, ${(fr.length ? fr.at(-1).t - fr[0].t : 0).toFixed(1)}s, ${state.warnings.length} warning(s)`);
  state.rec = null;
}
async function step(name, fn) {
  try { return await fn(); } catch (e) { state.warnings.push(`${name}: ${e.message}`); log(`  warn ${name}: ${e.message}`); }
}

// ---- input primitives
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
async function glide(tab, x, y, ms = 900) {
  const [x0, y0] = state.pos, dx = x - x0, dy = y - y0, d = Math.hypot(dx, dy) || 1;
  const nx = -dy / d, ny = dx / d, bow = Math.min(120, d * 0.18) * (dx >= 0 ? 1 : -1);
  const c1 = [x0 + dx * 0.25 + nx * bow, y0 + dy * 0.1 + ny * bow], c2 = [x0 + dx * 0.75 + nx * bow * 0.4, y0 + dy * 0.9 + ny * bow * 0.4];
  const dur = Math.max(250, Math.min(ms, 300 + d * 0.9)), t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const px = bez(x0, c1[0], c2[0], x, e), py = bez(y0, c1[1], c2[1], y, e);
    await tab.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py });
    if (k >= 1) break; await sleep(16);
  }
  state.pos = [x, y];
}
async function rectOf(tab, sel, scroll = true) {
  const js = `(() => { const el = window.__find(${JSON.stringify(sel)}); if (!el) return null; ${scroll ? 'el.scrollIntoView({block:"center",inline:"nearest"});' : ""} const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40), w: r.width, h: r.height, top: r.top }; })()`;
  return tab.eval(js);
}
async function waitFor(tab, expr, timeout = 15000, every = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await tab.eval(expr)) return true; } catch {} await sleep(every); }
  throw new Error(`timeout waiting for ${expr.slice(0, 80)}`);
}
const waitSel = (tab, sel, t) => waitFor(tab, `!!window.__find && !!window.__find(${JSON.stringify(sel)})`, t);
async function hover(tab, sel, ms) { await waitSel(tab, sel, 10000); const r = await rectOf(tab, sel); await sleep(200); const r2 = await rectOf(tab, sel, false); await glide(tab, (r2 || r).x, (r2 || r).y, ms); }
async function click(tab, sel) {
  await hover(tab, sel, 800); await sleep(150);
  await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x: state.pos[0], y: state.pos[1], button: "left", clickCount: 1 });
  await sleep(70);
  await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: state.pos[0], y: state.pos[1], button: "left", clickCount: 1 });
  await sleep(250);
}
const clickAny = async (tab, sels) => { let last; for (const s of sels) { try { await click(tab, s); return s; } catch (e) { last = e; } } throw last; };
async function typeText(tab, text, per = 55) {
  for (const ch of text) { await tab.send("Input.dispatchKeyEvent", { type: "char", text: ch, key: ch }); await sleep(per + Math.random() * 25); }
}
const keyCodes = { Enter: [13, "Enter", "\r"], Alt: [18, "AltLeft"], z: [90, "KeyZ"], Meta: [91, "MetaLeft"] };
async function key(tab, k, down, mods = 0, text) {
  const [vk, code, t] = keyCodes[k] || [0, k];
  await tab.send("Input.dispatchKeyEvent", { type: down ? (t && text !== false ? "keyDown" : "rawKeyDown") : "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(down && t && text !== false ? { text: t } : {}) });
}
const press = async (tab, k, mods = 0) => { await key(tab, k, true, mods); await sleep(60); await key(tab, k, false, mods); };
async function smoothScrollTo(tab, sel, ms = 4000) {
  await tab.eval(`(() => { const el = window.__find(${JSON.stringify(sel)}); if (!el) return; const y = el.getBoundingClientRect().top + scrollY - innerHeight / 3; const y0 = scrollY, t0 = performance.now(); const f = (n) => { const k = Math.min(1, (n - t0) / ${ms}), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; scrollTo(0, y0 + (y - y0) * e); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  await sleep(ms + 200);
}

// ---- tabs
async function pageTargets() { return (await cdp.send("Target.getTargets")).targetInfos.filter((t) => t.type === "page"); }
async function newTab(url) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const tab = await attach(targetId);
  if (url) await tab.send("Page.navigate", { url });
  return tab;
}
async function goto(tab, url, readySel) {
  await tab.send("Page.navigate", { url: demoUrl(url) });
  await sleep(500);
  if (readySel) await waitSel(tab, readySel, 15000);
  await tab.eval(`window.__ccMove&&window.__ccMove(${state.pos[0]},${state.pos[1]})`).catch(() => {});
}
/** Wait for a new tab on the web origin (the lifted app), attach, activate and record it. */
async function waitForAppTab(known, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = (await pageTargets()).find((x) => !known.has(x.targetId) && x.url.startsWith(WEB));
    if (t) { const tab = await attach(t.targetId); await sleep(300); return tab; }
    await sleep(400);
  }
  throw new Error("lifted app tab did not open");
}

// ---- the extension lift (shared by b1, b7 and silent setup)
async function pointAndAsk(tab, targetSel, askText) {
  await hover(tab, targetSel, 1100); await sleep(700);
  await key(tab, "Alt", true, 1); await sleep(1300); await key(tab, "Alt", false, 0); await sleep(700);
  await typeText(tab, askText);
  await sleep(500); await press(tab, "Enter");
}
async function liftTable({ silent = false } = {}) {
  const prev = state.paused; state.paused = silent;
  try {
    const tab = state.src;
    await goto(tab, "http://localhost:5199/route-44-schedule.html", "table#timetable");
    const known = new Set((await pageTargets()).map((t) => t.targetId));
    await pointAndAsk(tab, "table#timetable tbody tr:nth-child(4)", "turn this into something I can track");
    if (silent) { state.app = await waitForAppTab(known); await waitFor(state.app, `document.querySelectorAll('table tbody tr').length>=3`, 30000).catch(() => {}); }
    if (!silent) state.known = known;
    return known;
  } finally { state.paused = prev; }
}
async function ensureApp() {
  if (state.app && (await pageTargets()).some((t) => t.targetId === state.app.targetId)) return;
  log("  (setting up app silently)");
  await step("silent-lift", () => liftTable({ silent: true }));
  if (!state.app) { state.app = await newTab(WEB + "/"); await sleep(2500); }
}

// ---- beat drivers
const drivers = {
  async "b1-point"() {
    await recStart(state.src);
    await step("lift", () => liftTable());
    await sleep(2500); // chip: Reading table / Building your app
  },
  async "b2-app"() {
    if (state.known && !state.app) { // b1 ran in this process: the chip phase is recorded on the source tab while the app builds
      await recStart(state.src);
      await step("app-tab", async () => { state.app = await waitForAppTab(state.known, 60000); });
      if (!state.app) await ensureApp();
    } else await ensureApp();
    await recStart(state.app);
    await step("rows", () => waitFor(state.app, `document.querySelectorAll('table tbody tr').length>=3`, 30000));
    await sleep(1500);
    await step("chart", () => smoothScrollTo(state.app, "figure svg, svg[role=img]", 5000));
  },
  async "b3-gap"() {
    await ensureApp(); await recStart(state.app);
    await sleep(800);
    await step("form", () => smoothScrollTo(state.app, "form, [data-testid=add-row], button:has-text('Add row')", 4000));
    await sleep(3000);
  },
  async "b4-qr-atlas"() {
    await ensureApp(); await recStart(state.app);
    await step("output-tab", () => click(state.app, "[role=tab]:has-text('Output')"));
    await step("qr", () => clickAny(state.app, ["button:has-text('Scan to open')", "button:has-text('Show QR')", "button:has-text('QR')", "button:has-text('Share')"]));
    await sleep(2500);
    await step("second-tab-add-row", async () => { // stands in for the phone; unrecorded, then shown arriving in the Backend tab
      const url = await state.app.eval("location.href");
      const prev = state.paused; state.paused = true;
      const t2 = await newTab(url); await sleep(3500);
      const ok = await t2.eval(`(() => { const f = document.querySelector('form'); if (!f) return false; const ins = [...f.querySelectorAll('input:not([type=hidden])')]; const set = (i, v) => { if (!i) return; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set(ins[0], 'Thu'); set(ins[1], '777'); const b = [...f.querySelectorAll('button')].find((x) => /add/i.test(x.textContent)) || f.querySelector('button[type=submit]'); if (b) b.click(); return !!b; })()`);
      await sleep(1500); await cdp.send("Target.closeTarget", { targetId: t2.targetId }); state.paused = prev;
      if (!ok) throw new Error("add-row form not found in second tab");
    });
    await state.app.send("Page.bringToFront").catch(() => {}); await recStart(state.app);
    await step("backend-tab", () => click(state.app, "[role=tab]:has-text('Backend')"));
    await step("responses", () => waitFor(state.app, `/[1-9]\\d* responses?/i.test((document.querySelector('#rp-body')||document.body).innerText)`, 9000));
    await sleep(2500);
  },
  async "b5-chat"() {
    await ensureApp(); await recStart(state.app);
    await step("chat-mode", () => clickAny(state.app, ["[data-testid=work-mode-chat]", "button:has-text('Chat')", "[role=tab]:has-text('Chat')"]));
    await step("point-chart", () => hover(state.app, "[data-screen-root] figure svg[role=img], figure svg, svg[role=img]", 1100));
    await step("hold-alt", async () => { await key(state.app, "Alt", true, 1); await sleep(1100); await key(state.app, "Alt", false, 0); });
    await step("ask", async () => {
      await clickAny(state.app, ["[data-testid=message-input]", "textarea", "input[type=text]"]);
      await typeText(state.app, "why does this spike in week 3?"); await sleep(400); await press(state.app, "Enter");
    });
    await step("answer", () => waitFor(state.app, `document.querySelectorAll('[data-testid=answer]').length>0`, 20000));
    await sleep(3500);
  },
  async "b6-this"() {
    await ensureApp(); await recStart(state.app);
    await step("narrate-mode", () => clickAny(state.app, ["[data-testid=work-mode]", "button:has-text('Narrate')", "button:has-text('Work')"]));
    await step("hover-title", () => hover(state.app, "[data-screen-root] h1, [data-screen-root] [data-node-id]:first-child, h1", 1100));
    await step("hold-alt", async () => { await key(state.app, "Alt", true, 1); await sleep(1100); await key(state.app, "Alt", false, 0); });
    await step("say", async () => {
      await clickAny(state.app, ["[data-testid=message-input]", "textarea", "input[type=text]"]);
      await typeText(state.app, "make this bigger"); await sleep(400); await press(state.app, "Enter");
    });
    await sleep(4500);
    await step("undo", () => press(state.app, "z", 4));
    await sleep(2500);
  },
  async "b7-pixels"() {
    const tab = state.src; await recStart(tab);
    await step("lift-chart", async () => {
      await goto(tab, "http://localhost:5199/chart.html", "img, svg");
      const known = new Set((await pageTargets()).map((t) => t.targetId));
      await pointAndAsk(tab, "img, svg", "turn this into something I can track");
      await sleep(2000);
      const app = await waitForAppTab(known, 45000); await recStart(app); state.app2 = app;
      await sleep(4000);
    });
  },
  async "b8-surfaces"() {
    const tab = state.app2 || state.app || state.src; await recStart(tab);
    await step("home", async () => { await tab.send("Page.navigate", { url: WEB + "/" }); await sleep(2500); });
    await step("look", async () => {
      const before = await tab.eval(`localStorage.getItem('create-look')||''`);
      await clickAny(tab, ["[data-testid=look-switch]", "button:has-text('Luminous')", "[aria-label*='look' i]", "button:has-text('Look')"]);
      await sleep(1500);
      const after = await tab.eval(`localStorage.getItem('create-look')||''`);
      if (before === after) throw new Error("look did not visibly change");
    });
    await sleep(3000);
  },
  async "b9-end"() { /* card beat: rendered in assemble.mjs, nothing to capture */ },
};

try {
  const first = (await pageTargets())[0];
  state.src = await attach(first.targetId);
  // extension storage: point at the right API and web origin
  const swUrl = await (async () => { // several built-in component extensions also run workers: pick ours by manifest name
    for (let i = 0; i < 40; i++) {
      for (const t of (await cdp.send("Target.getTargets")).targetInfos.filter((x) => x.type === "service_worker" && x.url.endsWith("background.js"))) {
        try {
          const s = await attach(t.targetId, { worker: true });
          if (/^Create/.test(await s.eval("chrome.runtime.getManifest().name"))) return s;
        } catch {}
      }
      await sleep(300);
    }
  })();
  if (swUrl) {
    await swUrl.eval(`chrome.storage.sync.set({ apiOrigin: ${JSON.stringify(API)}, webOrigin: ${JSON.stringify(WEB)} })`).catch((e) => log("ext storage:", e.message));
    log(`extension ready (api ${API}, web ${WEB}, real=${REAL})`);
  } else log("WARNING: extension service worker not found");

  for (const b of beats) {
    if (!pending.includes(b)) { log(`${b.id}: skip (captured)`); continue; }
    log(`${b.id}: capturing`);
    await beginBeat(b.id);
    await step("driver", () => drivers[b.id]?.() ?? (state.warnings.push("no driver for beat"), undefined));
    await endBeat(b.id, { card: b.steps?.some((s) => s.do === "card") || undefined });
  }
} finally { cleanup(); }
