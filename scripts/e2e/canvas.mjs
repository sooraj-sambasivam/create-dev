#!/usr/bin/env node
// Canvas (Sketch) QA over CDP. For 1024/1280/1440/1920 wide, preview pane open/closed, library expanded/collapsed:
// screenshots + bounding-box overlap/clipping assertions on every control group. Also: zoom stays locked, a pen group
// + Confirm reaches /api/canvas-ops, and a library drop lands on the canvas / page.
// Usage: node scripts/e2e/canvas.mjs   (env: BASE_URL, SHOT_DIR)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5175";
const SHOTS = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/e2e";
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const c = [];
  for (const d of readdirSync(root)) {
    if (d.startsWith("chromium_headless_shell-")) c.push(join(root, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"));
    else if (d.startsWith("chromium-")) c.push(join(root, d, "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium"));
  }
  const hit = c.find(existsSync);
  if (!hit) throw new Error("no Playwright Chromium found under " + root);
  return hit;
}

const results = [];
const rec = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };
const consoleErrors = [], apiCalls = [];

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "create-canvas-"));
const chrome = spawn(findChrome(), [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} };
process.on("exit", cleanup);
async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const page = list.find((t) => t.type === "page"); if (page) return page.webSocketDebuggerUrl; } catch {}
    await sleep(200);
  }
  throw new Error("chrome did not expose CDP");
}
const ws = new WebSocket(await connect());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } else listeners.forEach((l) => l(d)); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pending.delete(i); rej(new Error("CDP timeout: " + method)); }, 30000); pending.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
const reqs = new Map();
listeners.push((d) => {
  if (d.method === "Runtime.exceptionThrown") consoleErrors.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === "Network.requestWillBeSent" && d.params.request.url.includes("/api/")) reqs.set(d.params.requestId, d.params.request.url);
  if (d.method === "Network.responseReceived" && d.params.response.url.includes("/api/")) apiCalls.push({ url: d.params.response.url, status: d.params.response.status });
});
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, name + ".png"), Buffer.from(r.data, "base64")); };
const mouse = (x, y, type = "mouseMoved") => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mouseReleased" || type === "mouseMoved" ? 0 : 1, clickCount: type === "mouseMoved" ? 0 : 1 });
const drag = async (pts) => { await mouse(pts[0][0], pts[0][1]); await mouse(pts[0][0], pts[0][1], "mousePressed"); for (const [x, y] of pts.slice(1)) { await mouse(x, y); await sleep(12); } const l = pts[pts.length - 1]; await mouse(l[0], l[1], "mouseReleased"); };
const step = async (name, fn) => { try { const r = await fn(); if (r !== undefined && r !== true) rec(name, false, String(r)); else rec(name, true); } catch (e) { rec(name, false, e.message.split("\n")[0]); } };

// Same module instance as the app: reuse the exact URL (with any ?t= HMR suffix) the page loaded.
const store = (n) => `import(performance.getEntriesByType('resource').map(r=>r.name).find(u=>new URL(u).pathname==='/src/${n}')||'/src/${n}')`;
const GROUPS = `(()=>{
  const host = document.querySelector('[data-canvas-host]'); if(!host) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const out = [];
  const add = (name, e) => { if (e && vis(e)) out.push({ name, ...R(e) }); };
  add('studio-toolbar', host.querySelector('[role=toolbar][aria-label=Sketch]'));
  add('library', host.querySelector('aside[aria-label=Library]') || host.querySelector('button[aria-label="Open library"]'));
  add('preview-pane', host.querySelector('aside[aria-label=Preview]'));
  add('show-preview', host.querySelector('button[aria-label="Show preview"]'));
  add('tl-tools', host.querySelector('.tlui-main-toolbar__tools'));
  add('tl-extras', host.querySelector('.tlui-main-toolbar__extras__controls'));
  add('tl-style-panel', host.querySelector('.tlui-style-panel__wrapper'));
  add('tl-watermark', host.querySelector('.tl-watermark_SEE-LICENSE'));
  add('popover', host.querySelector('[role=dialog][aria-label="Describe what this drawing is"]'));
  add('toast', host.querySelector('[role=status],[role=alert]'));
  const tb = host.querySelector('[role=toolbar][aria-label=Sketch]');
  const inner = tb ? [...tb.querySelectorAll('button')].filter(vis).map((b, i) => ({ name: 'toolbar-btn:' + (b.getAttribute('aria-label') || i), ...R(b) })) : [];
  const tbR = tb ? R(tb) : null;
  const lib = host.querySelector('aside[aria-label=Library]');
  const libBtns = lib ? [...lib.querySelectorAll(':scope > header button, :scope > div:first-child button')].filter(vis).map((b, i) => ({ name: 'library-btn:' + (b.getAttribute('aria-label') || b.textContent.trim() || i), ...R(b) })) : [];
  return { groups: out, inner, libBtns, tbR, vw: innerWidth, vh: innerHeight, hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    tbOverflow: tb ? tb.scrollWidth > tb.clientWidth + 1 : false };
})()`;
const overlap = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1.5;
const fmt = (a) => `${a.name}[${Math.round(a.l)},${Math.round(a.t)},${Math.round(a.r)},${Math.round(a.b)}]`;

function checkLayout(g, label) {
  const bad = [];
  const all = [...g.groups];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlap(all[i], all[j])) bad.push(`overlap ${fmt(all[i])} x ${fmt(all[j])}`);
  for (let i = 0; i < g.inner.length; i++) for (let j = i + 1; j < g.inner.length; j++) if (overlap(g.inner[i], g.inner[j])) bad.push(`overlap ${fmt(g.inner[i])} x ${fmt(g.inner[j])}`);
  for (let i = 0; i < g.libBtns.length; i++) for (let j = i + 1; j < g.libBtns.length; j++) if (overlap(g.libBtns[i], g.libBtns[j])) bad.push(`overlap ${fmt(g.libBtns[i])} x ${fmt(g.libBtns[j])}`);
  for (const a of [...g.groups, ...g.inner, ...g.libBtns]) if (a.l < -1 || a.t < -1 || a.r > g.vw + 1 || a.b > g.vh + 1) bad.push(`off-screen ${fmt(a)} vp=${g.vw}x${g.vh}`);
  if (g.hscroll) bad.push("page scrolls horizontally");
  if (g.tbOverflow) bad.push("studio toolbar content overflows its box");
  // the toolbar's buttons must sit inside the toolbar card
  if (g.tbR) for (const b of g.inner) if (b.l < g.tbR.l - 1 || b.r > g.tbR.r + 1) bad.push(`${b.name} outside toolbar card`);
  return bad.length ? `${label}: ` + [...new Set(bad)].slice(0, 6).join("; ") : true;
}

try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: BASE });
  await ev(`localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}));localStorage.removeItem('create.canvas.preview')`);
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[data-testid="message-input"]')`);
  const enter = async () => {
    await ev(`${store("store/screenStore.ts")}.then(m=>m.useScreenStore.getState().setMode('canvas')).then(()=>1)`);
    const ok = await waitFor(`!!document.querySelector('[data-canvas-host] .tl-canvas') && !!document.querySelector('[data-canvas-host] [role=toolbar]')`, 20000);
    await sleep(900);
    return ok;
  };
  const setPreview = async (open) => {
    const label = open ? "Show preview" : "Close preview";
    const has = await ev(`!!document.querySelector('aside[aria-label=Preview]')`);
    if (has !== open) await ev(`(()=>{const b=document.querySelector('button[aria-label="${label}"]');if(b)b.click()})()`);
    await sleep(500);
  };
  const setLibrary = async (open) => {
    const has = await ev(`!!document.querySelector('aside[aria-label=Library]')`);
    if (has !== open) await ev(`(()=>{const b=document.querySelector('button[aria-label="${open ? "Open library" : "Collapse library"}"]');if(b)b.click()})()`);
    await sleep(400);
  };
  if (!(await enter())) { rec("enter canvas mode", false, "canvas never mounted"); throw new Error("no canvas"); }
  rec("enter canvas mode", true);

  // (1) layout matrix. The sidebar belongs to the shell below the full-screen canvas; library collapsed/expanded is the in-canvas "rail/expanded" pair.
  for (const w of [1024, 1280, 1440, 1920]) {
    const h = w >= 1920 ? 1080 : 800;
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    for (const prev of [true, false]) for (const lib of [true, false]) {
      const name = `${w}px preview=${prev ? "open" : "closed"} library=${lib ? "expanded" : "rail"}`;
      await step("layout " + name, async () => {
        await setPreview(prev); await setLibrary(lib); await sleep(300);
        await shot(`canvas-${w}-p${prev ? 1 : 0}-l${lib ? 1 : 0}`);
        const g = await ev(GROUPS);
        if (!g) return "no canvas host";
        return checkLayout(g, name);
      });
    }
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400); await setPreview(true); await setLibrary(true);

  // (2) zoom stays locked
  await step("zoom stays locked (ctrl+wheel, keys, pinch)", async () => {
    const z0 = await ev(`${store("modes/canvas/canvasStore.ts")}.then(m=>m.useCanvasStore.getState().editor.getZoomLevel())`);
    const c = await ev(`(()=>{const r=document.querySelector('[data-canvas-host] .tl-canvas').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await mouse(c.x, c.y);
    for (let i = 0; i < 4; i++) await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c.x, y: c.y, deltaX: 0, deltaY: -120, modifiers: 2 });
    for (const [key, code, mods] of [["=", "Equal", 4], ["-", "Minus", 4], ["0", "Digit0", 4], ["=", "Equal", 2], ["1", "Digit1", 8]]) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers: mods }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods });
    }
    await sleep(500);
    const z1 = await ev(`${store("modes/canvas/canvasStore.ts")}.then(m=>m.useCanvasStore.getState().editor.getZoomLevel())`);
    if (Math.abs(z1 - z0) > 1e-6) return `zoom changed ${z0} -> ${z1}`;
  });

  // (3) pen group + Confirm -> /api/canvas-ops, result lands in the preview
  await step("pen group + Confirm -> /api/canvas-ops 200", async () => {
    await setPreview(true);
    const box = await ev(`(()=>{const r=document.querySelector('[data-canvas-host] .tl-canvas').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height}})()`);
    const x0 = box.l + box.w * 0.25, y0 = box.t + box.h * 0.45;
    await ev(`${store("modes/canvas/canvasStore.ts")}.then(m=>m.useCanvasStore.getState().editor.setCurrentTool('draw')).then(()=>1)`);
    await drag([[x0, y0], [x0 + 140, y0], [x0 + 140, y0 + 60], [x0, y0 + 60], [x0, y0 + 2]]);
    await drag([[x0 + 20, y0 + 20], [x0 + 110, y0 + 24], [x0 + 112, y0 + 40]]);
    const pop = `!!document.querySelector('[role=dialog][aria-label="Describe what this drawing is"]')`;
    if (!(await waitFor(pop, 6000))) { await shot("canvas-no-popover"); return "label popover did not appear after drawing"; }
    await sleep(300); await shot("canvas-popover");
    const g = await ev(GROUPS);
    const bad = checkLayout(g, "with popover");
    const ta = await ev(`(()=>{const t=document.querySelector('#stroke-label');const r=t.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await mouse(ta.x, ta.y); await mouse(ta.x, ta.y, "mousePressed"); await mouse(ta.x, ta.y, "mouseReleased");
    await send("Input.insertText", { text: "hero headline" });
    const before = apiCalls.length;
    const cf = await ev(`(()=>{const b=[...document.querySelectorAll('[role=dialog] button')].find(e=>e.textContent.trim()==='Confirm');if(!b||b.disabled)return null;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    if (!cf) return "Confirm button missing or disabled";
    const top = await ev(`(()=>{const e=document.elementFromPoint(${cf.x},${cf.y});return e&&e.closest('button')?.textContent.trim()})()`);
    if (top !== "Confirm") return `Confirm is covered by "${top}"`;
    await mouse(cf.x, cf.y); await mouse(cf.x, cf.y, "mousePressed"); await mouse(cf.x, cf.y, "mouseReleased");
    const t0 = Date.now(); let hit = null;
    while (Date.now() - t0 < 20000 && !hit) { hit = apiCalls.slice(before).find((c) => c.url.includes("/api/canvas-ops")); await sleep(150); }
    await sleep(800); await shot("canvas-after-confirm");
    if (!hit) return "no /api/canvas-ops response";
    if (hit.status !== 200) return "canvas-ops status " + hit.status;
    if (bad !== true) return bad;
  });

  // (4) library drops (icon/photo image shape, section into the page, motion frame)
  await step("library drops land (icon, photo, section, motion)", async () => {
    await setLibrary(true);
    const area = await ev(`(()=>{const r=document.querySelector('[data-canvas-host] .tl-canvas').getBoundingClientRect();return {x:r.left+r.width*0.6,y:r.top+r.height*0.55}})()`);
    const drops = [{ libraryKind: "icon", value: "lucide:star", label: "star" }, { libraryKind: "photo", value: "https://example.com/p.jpg", label: "p" }, { libraryKind: "section", value: "__first__" }, { libraryKind: "motion", value: "fade-up", label: "Fade up" }];
    const res = [];
    for (const d of drops) {
      const r = await ev(`(async()=>{
        const cs = await ${store("modes/canvas/canvasStore.ts")}; const ed = cs.useCanvasStore.getState().editor;
        const tpl = await ${store("modes/canvas/library/templates.ts")};
        const scr = await ${store("store/screenStore.ts")};
        const item = ${JSON.stringify(d)}; if (item.value === '__first__') item.value = tpl.SECTION_TEMPLATES[0].id;
        const shapes0 = ed.getCurrentPageShapes().length, kids0 = scr.useScreenStore.getState().screen?.children.length ?? 0;
        const dt = new DataTransfer(); dt.setData('application/x-create-library', JSON.stringify(item));
        const wrap = document.querySelector('[data-canvas-host] .tl-canvas').parentElement.closest('div[class*=min-w-0]') || document.querySelector('[data-canvas-host] .tl-canvas');
        const mk = (t) => new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: ${area.x}, clientY: ${area.y} });
        const over = mk('dragover'); wrap.dispatchEvent(over);
        wrap.dispatchEvent(mk('drop'));
        await new Promise(r=>setTimeout(r,500));
        return { kind: item.libraryKind, overPrevented: over.defaultPrevented, shapes: ed.getCurrentPageShapes().length - shapes0, kids: (scr.useScreenStore.getState().screen?.children.length ?? 0) - kids0 };
      })()`);
      res.push(r);
    }
    await shot("canvas-after-drops");
    const fails = res.filter((r) => !r.overPrevented || (r.shapes < 1 && r.kids < 1));
    if (fails.length) return "drops that did not land: " + JSON.stringify(fails);
    const g = await ev(GROUPS); return checkLayout(g, "after drops");
  });

  // (5) narrate controls
  await step("narrate controls don't overlap the toolbar/panels", async () => {
    await ev(`document.querySelector('button[aria-label=Narrate]').click()`);
    await sleep(900);
    await shot("canvas-narrate");
    const g = await ev(`(()=>{const base=${GROUPS};const host=document.querySelector('[data-canvas-host]');const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
      const extra=[...host.querySelectorAll('[data-narrate-ignore], [data-narrate-ignore] button')].filter(vis).map((e,i)=>{const r=e.getBoundingClientRect();return {name:'narrate:'+(e.getAttribute('aria-label')||e.textContent.trim().slice(0,12)||i),l:r.left,t:r.top,r:r.right,b:r.bottom,isBtn:e.tagName==='BUTTON'}});
      return {base,extra}})()`);
    const nar = g.extra.filter((e) => e.isBtn);
    const tb = g.base.groups.filter((x) => ["studio-toolbar", "tl-tools", "tl-extras", "tl-style-panel", "library", "preview-pane"].includes(x.name));
    const bad = [];
    for (const a of nar) for (const b of tb) if (overlap(a, b)) bad.push(`${fmt(a)} x ${fmt(b)}`);
    for (let i = 0; i < nar.length; i++) for (let j = i + 1; j < nar.length; j++) if (overlap(nar[i], nar[j])) bad.push(`${fmt(nar[i])} x ${fmt(nar[j])}`);
    // nothing from the canvas (built-group badges, outlines) may paint over the narrate card
    const covered = await ev(`(()=>{const c=document.querySelector('[data-narrate-ui]');if(!c)return null;const r=c.getBoundingClientRect();const bad=[];
      for(const [fx,fy] of [[.15,.1],[.5,.1],[.85,.1],[.15,.5],[.5,.5],[.85,.5],[.15,.9],[.5,.9],[.85,.9]]){const e=document.elementFromPoint(r.left+r.width*fx,r.top+r.height*fy);if(e&&!c.contains(e))bad.push(e.tagName+(e.getAttribute('title')?':'+e.getAttribute('title'):''))}return bad})()`);
    if (covered && covered.length) bad.push("narrate card covered by " + covered.join(","));
    await ev(`(()=>{const b=document.querySelector('button[aria-label=Narrate]');if(b&&b.getAttribute('aria-pressed')==='true')b.click()})()`);
    await sleep(500);
    if (bad.length) return "narrate overlaps: " + bad.slice(0, 5).join("; ");
  });
  await shot("canvas-final");
} catch (e) {
  rec("harness", false, e.stack.split("\n").slice(0, 3).join(" | "));
}
const noisy = (s) => /favicon|ERR_ABORTED|Download the React DevTools/i.test(s);
const ce = [...new Set(consoleErrors.filter((s) => !noisy(s)))];
rec("no uncaught exceptions", ce.length === 0, ce.slice(0, 3).join(" || "));
console.log("\n| Check | Result | Detail |\n|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "/")} |`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
try { ws.close(); } catch {}
cleanup();
process.exit(failed ? 1 : 0);
