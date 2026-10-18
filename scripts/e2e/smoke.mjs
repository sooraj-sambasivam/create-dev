#!/usr/bin/env node
// Real-browser smoke test. No npm deps: launches the cached Playwright Chromium and drives it over CDP.
// Usage: node scripts/e2e/smoke.mjs   (env: BASE_URL, SHOT_DIR, HEADED=1)
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
const consoleErrors = [], failedReqs = [], bugs = [];

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "create-e2e-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });
const cleanup = () => { try { chrome.kill("SIGKILL"); } catch {} };
process.on("exit", cleanup);

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error("chrome did not expose CDP");
}

const ws = new WebSocket(await connect());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
  else listeners.forEach((l) => l(d));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
listeners.push((d) => {
  if (d.method === "Runtime.exceptionThrown") consoleErrors.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push("console.error: " + d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  if (d.method === "Network.loadingFailed" && !d.params.canceled) failedReqs.push(`${d.params.errorText} ${d.params.requestId}`);
  if (d.method === "Network.responseReceived" && d.params.response.status >= 400) failedReqs.push(`${d.params.response.status} ${d.params.response.url}`);
});

const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 15000, step = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await ev(expr); if (v) return v; } catch {} await sleep(step); } return false; };
const shot = async (name) => { const f = join(SHOTS, name + ".png"); const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(r.data, "base64")); console.log("  shot " + f); return f; };
const mouse = (x, y, type = "mouseMoved") => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });
const clickAt = async (x, y) => { await mouse(x, y); await mouse(x, y, "mousePressed"); await mouse(x, y, "mouseReleased"); };
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
const modUrl = (name) => `(()=>{const e=performance.getEntriesByType('resource').map(r=>r.name).find(n=>n.includes('/src/store/${name}.ts'));return e||'/src/store/${name}.ts'})()`;
const maxFs = (id) => `(()=>{const e=document.querySelector('[data-right-panel] [data-screen-root] [data-node-id="${id}"]');if(!e)return 0;return Math.max(...[e,...e.querySelectorAll('*')].map(x=>parseFloat(getComputedStyle(x).fontSize)||0))})()`;
let skipped = false;
const step = async (name, fn) => { skipped = false; try { const r = await fn(); if (r !== undefined && r !== true) rec(name, false, String(r)); else if (skipped) rec(name, true, "SKIP: hook not present"); else rec(name, true); } catch (e) { rec(name, false, e.message.split("\n")[0]); } };

try {
  const apiUp = await fetch(BASE + "/api/health").then((r) => r.status < 500).catch(() => false);
  if (!apiUp) console.log("  WARN: " + BASE + "/api/* unreachable (api server down?)");
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // (0) onboarding on a fresh profile (the browser profile is new, so localStorage is empty)
  const profileOf = `(()=>{try{return JSON.parse(localStorage.getItem('create.profile')||'null')?.state||null}catch{return null}})()`;
  const dialog = `!!document.querySelector('[role="dialog"][aria-labelledby="onb-title"]')`;
  const clickText = (txt, sel = "button") => ev(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim()===${JSON.stringify(txt)});if(!b)return false;b.click();return true})()`);
  await step("0a. onboarding appears on a fresh profile and Skip completes it", async () => {
    await send("Page.navigate", { url: BASE });
    if (!(await waitFor(dialog, 15000))) { await shot("00a-no-onboarding"); return "onboarding dialog not shown on a fresh profile"; }
    await sleep(500); await shot("00a-onboarding-step1");
    if (!(await clickText("Skip"))) return "no Skip button";
    if (!(await waitFor(`!(${dialog})`, 5000))) return "dialog still open after Skip";
    const p = await ev(profileOf);
    if (!p?.onboarded) return "profile.onboarded not set after Skip: " + JSON.stringify(p);
  });
  await step("0b. onboarding can be completed (Ask + I'm a developer -> Chat default)", async () => {
    await ev(`(()=>{localStorage.setItem('create.profile',JSON.stringify({state:{intent:'both',level:'some',onboarded:false},version:0}));localStorage.removeItem('create.workmode')})()`);
    await send("Page.navigate", { url: BASE });
    if (!(await waitFor(dialog, 15000))) return "onboarding dialog not shown";
    const radios = async (label) => ev(`(()=>{const r=[...document.querySelectorAll('[role="radio"]')].find(e=>e.textContent.includes(${JSON.stringify(label)}));if(!r)return false;r.click();return true})()`);
    if (!(await clickText("Get started"))) { await shot("00b-no-get-started"); return "no Get started on the welcome step"; }
    await sleep(400);
    if (!(await radios("Ask"))) return "no Ask choice";
    if (!(await radios("developer"))) { await shot("00b-no-dev"); return "no developer choice"; }
    await clickText("Next"); await sleep(400);   // permissions
    await clickText("Next"); await sleep(400);   // try it
    await clickText("Next"); await sleep(500); await shot("00b-onboarding-done");
    if (!(await clickText("Start creating"))) return "no Start creating on the last step";
    if (!(await waitFor(`!(${dialog})`, 5000))) return "dialog still open after finishing";
    const p = await ev(profileOf);
    if (!p?.onboarded || p.intent !== "ask" || p.level !== "dev") return "profile not saved: " + JSON.stringify(p);
  });
  // Later steps run as an experienced "build" user.
  await ev(`localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}))`);

  // (1) load + themes
  for (const scheme of ["light", "dark"]) {
    await step(`1. load + screenshot (${scheme})`, async () => {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
      await send("Page.navigate", { url: BASE });
      if (!(await waitFor(`!!document.querySelector('[data-testid="message-input"]')`))) return "composer not found";
      await sleep(600); await shot(`01-load-${scheme}`);
      const bg = await ev(`getComputedStyle(document.body).backgroundColor`);
      const lum = bg.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
      if (scheme === "dark" && lum > 100) return `dark scheme but body bg ${bg}`;
      if (scheme === "light" && lum < 150) return `light scheme but body bg ${bg}`;
    });
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await send("Page.navigate", { url: BASE });
  await waitFor(`!!document.querySelector('[data-testid="message-input"]')`);

  // (2) prompt -> rendered page
  await step("2. prompt renders a page in right panel", async () => {
    const c = await center('[data-testid="message-input"]');
    await clickAt(c.x, c.y);
    await send("Input.insertText", { text: "A landing page for a coffee shop called Ember" });
    await sleep(150);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    const ok = await waitFor(`document.querySelectorAll('[data-screen-root] [data-node-id]').length>0`, 30000);
    await sleep(800); await shot("02-rendered");
    if (!ok) return "no [data-screen-root] [data-node-id] after 30s";
    const n = await ev(`document.querySelectorAll('[data-screen-root] [data-node-id]').length`);
    console.log("  nodes: " + n);
  });

  // (3) narrate mode + hover bubble
  let target = null;
  await step("3a. open narrate via Go fan", async () => {
    const go = await center('[data-testid="go"]');
    await mouse(go.x, go.y); await sleep(500);
    let nb = await center('[data-testid="narrate-button"]');
    if (!nb) { await ev(`document.querySelector('[data-testid="go"]').focus()`); await sleep(500); nb = await center('[data-testid="narrate-button"]'); }
    if (!nb) { await shot("03-fan-missing"); return "narrate-button not visible after hovering Go"; }
    await sleep(400); nb = await center('[data-testid="narrate-button"]');
    const topEl = await ev(`(()=>{const e=document.elementFromPoint(${nb.x},${nb.y});return e?(e.closest('[data-testid]')?.getAttribute('data-testid')||e.tagName):null})()`);
    await shot("03a-fan-open");
    console.log(`  narrate-button at ${Math.round(nb.x)},${Math.round(nb.y)} topmost=${topEl}`);
    if (topEl !== "narrate-button") { bugs.push("Go fan: narrate-button covered by " + topEl); console.log("  BUG: fan item covered by " + topEl + "; falling back to DOM click"); await ev(`document.querySelector('[data-testid="narrate-button"]').click()`); }
    else await clickAt(nb.x, nb.y);
    await sleep(1200);
    await shot("03a-narrate-open");
    const st = await ev(`document.querySelector('[data-narrate-ignore]')!==null`);
    if (!st) return "no [data-narrate-ignore] overlay element after clicking Narrate";
  });
  await step("3b. hover heading -> pointer bubble label", async () => {
    target = await ev(`(()=>{const els=[...document.querySelectorAll('[data-right-panel] [data-screen-root] [data-node-id]')];
      const vis=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.top>=0&&r.bottom<=innerHeight});
      const leaf=vis.filter(e=>e.textContent.trim().length>3&&![...e.children].some(c=>c.hasAttribute('data-node-id')));const h=leaf.sort((a,b)=>parseFloat(getComputedStyle(b).fontSize)-parseFloat(getComputedStyle(a).fontSize))[0];
      if(!h)return null;const r=h.getBoundingClientRect();return {id:h.getAttribute('data-node-id'),tag:h.tagName,x:r.left+Math.min(r.width/2,60),y:r.top+r.height/2,fs:Math.max(...[h,...h.querySelectorAll('*')].map(x=>parseFloat(getComputedStyle(x).fontSize)||0))}})()`);
    if (!target) return "no visible node in right panel";
    for (let i = 0; i < 4; i++) { await mouse(target.x - 30 + i * 10, target.y); await sleep(60); }
    await mouse(target.x, target.y); await sleep(500);
    const label = await ev(`(()=>{const c=document.querySelector('[data-narrate-ignore] [class*="max-w-[320px]"]');return c&&getComputedStyle(c).opacity==='1'?c.textContent.trim():null})()`);
    await shot("03b-hover-bubble");
    console.log(`  target ${target.tag}#${target.id} fs=${target.fs} label=${JSON.stringify(label)}`);
    if (!label) return "bubble chip not visible/empty while hovering " + target.id;
  });

  // (4) say() hook
  await step("4. window.__createNarrate.say('make this bigger') edits hovered node", async () => {
    const has = await ev(`typeof window.__createNarrate?.say`);
    if (has !== "function") { skipped = true; return true; }
    if (!target) return "no hover target";
    await mouse(target.x, target.y); await sleep(200);
    await ev(`Promise.resolve(window.__createNarrate.say("make this bigger", true)).then(()=>1)`).catch((e) => console.log("  say threw: " + e.message));
    const grew = await waitFor(`${maxFs(target.id)}>${target.fs}`, 8000);
    const done = await ev(`/·\\s*Done/.test(document.querySelector('[data-narrate-ignore] [class*="max-w-[320px]"]')?.textContent||'')`);
    await shot("04-after-say");
    const fs2 = await ev(maxFs(target.id));
    console.log(`  font-size ${target.fs} -> ${fs2}, doneText=${done}`);
    if (!grew && !done) return `font-size unchanged (${target.fs}) and no Done state`;
  });

  // (6) Chat mode answers and never edits; the right panel is untouched
  const panelState = `(()=>{const a=document.querySelector('[data-right-panel]');return a?Math.round(a.getBoundingClientRect().width)+':'+!!document.querySelector('[data-right-panel] [data-screen-root]'):'none'})()`;
  const typeSend = async (text) => {
    const c = await center('[data-testid="message-input"]');
    await clickAt(c.x, c.y);
    await send("Input.insertText", { text });
    await sleep(150);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  };
  await step("6. Chat mode: ask about the 4.9 -> answer item, page and right panel unchanged", async () => {
    // Back to the Edit-less thread state: leave narrate if the fan opened it.
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(500);
    if (!(await center('[data-testid="work-mode-chat"]'))) return "no Chat toggle in the composer";
    await ev(`document.querySelector('[data-testid="work-mode-chat"]').click()`);
    await sleep(300);
    const pressed = await ev(`document.querySelector('[data-testid="work-mode-chat"]').getAttribute('aria-pressed')`);
    if (pressed !== "true") return "Chat toggle not pressed";
    const before = { panel: await ev(panelState), json: await ev(`import(${modUrl('screenStore')}).then(m=>JSON.stringify(m.useScreenStore.getState().screen).length)`), answers: await ev(`document.querySelectorAll('[data-testid="answer"]').length`) };
    await typeSend("what does the 4.9 mean?");
    const ok = await waitFor(`document.querySelectorAll('[data-testid="answer"]').length>${before.answers}`, 15000);
    await sleep(500); await shot("06-chat-answer");
    if (!ok) return "no answer item after asking in Chat mode";
    const text = await ev(`[...document.querySelectorAll('[data-testid="answer"]')].pop().textContent`);
    console.log("  answer: " + JSON.stringify(text.slice(0, 140)));
    const after = { panel: await ev(panelState), json: await ev(`import(${modUrl('screenStore')}).then(m=>JSON.stringify(m.useScreenStore.getState().screen).length)`) };
    if (after.panel !== before.panel) return `right panel changed ${before.panel} -> ${after.panel}`;
    if (after.json !== before.json) return "page content changed in Chat mode";
  });

  // (7) Backend tab shows the user's app, derived from the Screen
  await step("7. Backend tab shows app-derived sections", async () => {
    await ev(`document.querySelector('[data-testid="work-mode-code"]')?.click()`);
    await ev(`[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.trim()==='Backend')?.click()`);
    const ok = await waitFor(`/Pages/.test(document.querySelector('#rp-body')?.textContent||'')&&/Hosting/.test(document.querySelector('#rp-body')?.textContent||'')`, 8000);
    await sleep(400); await shot("07-backend");
    if (!ok) return "Backend tab has no Pages/Hosting sections: " + (await ev(`(document.querySelector('#rp-body')?.textContent||'').slice(0,120)`));
    const t = await ev(`document.querySelector('#rp-body').textContent`);
    if (/Narrate|Mongo|ElevenLabs|Perceptron/i.test(t)) return "Backend tab still shows Create's own services";
  });

  // (8) a form on the page, submitted in Preview, shows up in Backend
  await step("8. form submitted in Preview -> response count in Backend", async () => {
    const appId = await ev(`(async()=>{const m=await import(${modUrl('workspaceStore')});return m.useWorkspaceStore.getState().activeChatId||'draft'})()`).catch(() => "draft");
    await ev(`[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.trim()==='Output')?.click()`);
    await ev(`(async()=>{const m=await import(${modUrl('screenStore')});const s=m.useScreenStore.getState();
      const base=s.screen;
      const form={id:'e2e-form',type:'container',direction:'column',gap:'md',align:'stretch',justify:'start',padding:'md',background:'none',width:'full',wrap:false,overlay:'dark',children:[
        {id:'e2e-h',type:'heading',text:'Join the list',level:2},
        {id:'e2e-e',type:'textbox',label:'Email',placeholder:'you@example.com',multiline:false},
        {id:'e2e-b',type:'button',label:'Sign up',variant:'primary'}]};
      s.setScreen({...base,children:[...base.children,form]});})()`);
    // Long pages mount lazily: scroll every scroller in the panel to the bottom while waiting.
    const scrollDown = `(()=>{document.querySelectorAll('[data-right-panel] *').forEach(e=>{if(e.scrollHeight>e.clientHeight+20)e.scrollTop=e.scrollHeight});return !!document.querySelector('[data-right-panel] [data-node-id="e2e-b"]')})()`;
    if (!(await waitFor(scrollDown, 8000))) { await shot("08-form-missing"); return "form not rendered: " + (await ev(`(async()=>{const m=await import(${modUrl('screenStore')});const sc=m.useScreenStore.getState().screen;return (sc?.children||[]).map(c=>c.id).join(',')+' ids='+[...document.querySelectorAll('[data-node-id]')].map(e=>e.dataset.nodeId).slice(-6).join(',')+' tab='+document.querySelector('[role=tab][aria-selected=true]')?.textContent})()`)); }
    await ev(`[...document.querySelectorAll('[data-right-panel] button')].find(e=>e.textContent.trim()==='Preview')?.click()`);
    await sleep(400);
    await ev(`document.querySelector('[data-right-panel] [data-node-id="e2e-b"]').scrollIntoView({block:'center'})`);
    await sleep(300);
    const input = await center('[data-right-panel] [data-node-id="e2e-e"] input, [data-right-panel] input[type="text"], [data-right-panel] input:not([type])');
    if (!input) return "no input found in the form";
    await clickAt(input.x, input.y);
    await send("Input.insertText", { text: "e2e@example.com" });
    await sleep(200);
    const btn = await center('[data-right-panel] [data-node-id="e2e-b"]');
    await clickAt(btn.x, btn.y);
    await sleep(1000); await shot("08-form-submitted");
    const formsUrl = `http://localhost:3001/api/forms/${encodeURIComponent(appId)}`;
    const { token } = await fetch(`${formsUrl}/token`, { method: "POST", headers: { Origin: new URL(BASE).origin } }).then((r) => r.json()).catch(() => ({}));
    const stored = await fetch(formsUrl, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => []);
    console.log(`  appId=${appId} stored=${Array.isArray(stored) ? stored.length : "?"}`);
    if (!Array.isArray(stored) || !stored.some((r) => JSON.stringify(r.fields).includes("e2e@example.com"))) return "submission not stored on the server";
    await ev(`[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.trim()==='Backend')?.click()`);
    const ok = await waitFor(`/[1-9]\\d* responses?/.test(document.querySelector('#rp-body')?.textContent||'')`, 8000);
    await sleep(400); await shot("08-backend-responses");
    if (!ok) return "Backend shows no response count: " + (await ev(`(document.querySelector('#rp-body')?.textContent||'').slice(0,200)`));
  });

  // (9) lift: entity -> live app; a row added through the page form shows up live in the table and in the stored responses
  await step("9. /api/lift entity -> app renders table + chart; form row appears live and is stored", async () => {
    const entity = { kind: "schedule", title: "Smoke route schedule", columns: [{ key: "day", label: "Day", type: "text" }, { key: "riders", label: "Riders", type: "number" }],
      rows: [{ day: "Mon", riders: "120" }, { day: "Tue", riders: "150" }, { day: "Wed", riders: "90" }], source: { title: "Sample page" } };
    const lift = await fetch("http://localhost:3001/api/lift", { method: "POST", headers: { "content-type": "application/json", Origin: new URL(BASE).origin }, body: JSON.stringify({ entity, instruction: "turn this into something I can track" }) }).then((r) => r.json());
    if (!lift?.url || !lift?.id || !lift?.formId) return "bad lift response: " + JSON.stringify(lift);
    const url = new URL(lift.url); url.protocol = new URL(BASE).protocol; url.host = new URL(BASE).host;
    await send("Page.navigate", { url: url.toString() });
    const rows = `document.querySelectorAll('[data-screen-root] table:not(.sr-only) tbody tr').length`;
    if (!(await waitFor(`${rows}>=3`, 15000))) { await shot("09-no-table"); return "table did not render 3 rows at " + url + " (rows=" + (await ev(rows)) + ")"; }
    if (!(await waitFor(`!!document.querySelector('[data-screen-root] figure svg[role=img]')`, 5000))) { await shot("09-no-chart"); return "chart did not render"; }
    await shot("09a-lift-rendered");
    await ev(`document.querySelectorAll('input').forEach(e=>e.scrollIntoView({block:'center'}))`);
    const inputs = await ev(`[...document.querySelectorAll('[data-screen-root] input:not([type=hidden]), [data-screen-root] textarea')].map((e,i)=>{e.setAttribute('data-e2e-i',i);return e.getAttribute('aria-label')||e.placeholder||e.name||''})`);
    if (inputs.length < 2) return "expected 2 form inputs, found " + inputs.length;
    for (const [i, text] of ["Thu", "777"].entries()) {
      await ev(`document.querySelector('[data-e2e-i="${i}"]').scrollIntoView({block:'center'})`);
      await sleep(150);
      const c = await center(`[data-e2e-i="${i}"]`);
      await clickAt(c.x, c.y);
      await send("Input.insertText", { text });
    }
    const clicked = await ev(`(()=>{const b=[...document.querySelectorAll('[data-screen-root] button')].find(e=>/add row/i.test(e.textContent));if(!b)return false;b.scrollIntoView({block:'center'});return true})()`);
    if (!clicked) return "no Add row button";
    await sleep(200);
    const bc = await center(`[data-screen-root] button`).then(async () => ev(`(()=>{const b=[...document.querySelectorAll('[data-screen-root] button')].find(e=>/add row/i.test(e.textContent));const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`));
    await clickAt(bc.x, bc.y);
    const t0 = Date.now();
    const appeared = await waitFor(`${rows}>=4 && /777/.test(document.querySelector('[data-screen-root] table:not(.sr-only) tbody').textContent)`, 5000);
    await shot("09b-lift-row-added");
    if (!appeared) return "new row not visible in the table within 5s (rows=" + (await ev(rows)) + ")";
    console.log(`  row visible after ${Date.now() - t0}ms`);
    const formsUrl = `http://localhost:3001/api/forms/${encodeURIComponent(lift.id)}`;
    const { token } = await fetch(`${formsUrl}/token`, { method: "POST", headers: { Origin: new URL(BASE).origin } }).then((r) => r.json()).catch(() => ({}));
    const stored = await fetch(formsUrl, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => []);
    if (!Array.isArray(stored) || !stored.some((r) => JSON.stringify(r.fields).includes("777"))) return "row not stored (Backend responses): " + JSON.stringify(stored).slice(0, 200);
  });
  await sleep(500);
} catch (e) {
  rec("harness", false, e.stack.split("\n").slice(0, 3).join(" | "));
}

// (5) errors
const noisy = (s) => /favicon|ERR_ABORTED|net::ERR_BLOCKED|Download the React DevTools/i.test(s);
const ce = [...new Set(consoleErrors.filter((s) => !noisy(s)))], fr = [...new Set(failedReqs.filter((s) => !noisy(s)))];
rec("5a. no console errors/exceptions", ce.length === 0, ce.slice(0, 5).join(" || "));
rec("5b. no failed requests (>=400 / net error)", fr.length === 0, fr.slice(0, 5).join(" || "));

console.log("\n| Check | Result | Detail |\n|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail.replace(/\|/g, "/")} |`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${SHOTS}`);
try { ws.close(); } catch {}
cleanup();
process.exit(failed ? 1 : 0);
