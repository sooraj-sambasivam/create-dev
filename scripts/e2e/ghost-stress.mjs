#!/usr/bin/env node
// Agent-cursor stress test. Lifts 4 different entities via /api/lift, then runs ghostAddRow 5x on each
// (plus one runAgentAddRow each) with values derived from the rows already on the page.
// Asserts: each field got the value derived for its label, submit happened, the row appears, the cursor stays on screen.
// Usage: node scripts/e2e/ghost-stress.mjs   (env: BASE_URL, API_URL, RUNS=5, SHOT_DIR)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5175";
const API = process.env.API_URL || "http://localhost:3001";
const RUNS = Number(process.env.RUNS || 5);
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

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "create-ghost-"));
const chrome = spawn(findChrome(), [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "about:blank",
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
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const to = setTimeout(() => { pending.delete(i); rej(new Error("CDP timeout: " + method)); }, 60000); pending.set(i, { res: (v) => { clearTimeout(to); res(v); }, rej: (e) => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(expr)) return true; } catch {} await sleep(150); } return false; };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, name + ".png"), Buffer.from(r.data, "base64")); };

const col = (key, label, type = "text") => ({ key, label, type });
const ENTITIES = [
  { name: "schedule", kind: "schedule", title: "Stress route schedule", columns: [col("time", "Time", "time"), col("stop", "Stop"), col("riders", "Riders", "number")],
    rows: [["8:00 AM", "Stop 1", "40"], ["8:30 AM", "Stop 2", "55"], ["9:00 AM", "Stop 3", "70"]] },
  { name: "pricing", kind: "table", title: "Stress pricing", columns: [col("tier", "Plan"), col("price", "Price", "money"), col("seats", "Seats", "number")],
    rows: [["Free", "$0", "1"], ["Starter", "$9", "3"], ["Basic", "$19", "5"]] },
  { name: "orders", kind: "table", title: "Stress orders", columns: [col("order", "Order"), col("item", "Item"), col("qty", "Qty", "number"), col("total", "Total", "money")],
    rows: [["Order 101", "Latte", "2", "$9.00"], ["Order 102", "Mocha", "1", "$5.50"], ["Order 103", "Latte", "3", "$13.50"]] },
  { name: "sign-up", kind: "list", title: "Stress sign-up sheet", columns: [col("name", "Name"), col("email", "Email"), col("slot", "Slot")],
    rows: [["Ada", "ada@example.com", "Morning"], ["Ben", "ben@example.com", "Morning"], ["Cy", "cy@example.com", "Evening"]] },
].map((e) => ({ ...e, rows: e.rows.map((r) => Object.fromEntries(e.columns.map((c, i) => [c.key, r[i]]))) }));

// In-page runner. mode "ghost" = ghostAddRow with values from deriveRowValues; "agent" = runAgentAddRow.
const RUN = (mode) => `(async()=>{
  const g = await import('/src/ghost/index.ts');
  const form = g.findLiftedForm();
  if(!form) return {error:'no form'};
  const T = g.readTable(form); if(!T) return {error:'no table'};
  const fields = g.findTextFields(form);
  const labels = fields.map(f=>g.fieldKeys(f,form)[0]||'');
  const expected = g.deriveRowValues(T.columns,T.rows,labels);
  const before = T.rows.length;
  const typed = {}; let submitted = 0, snap = null;
  const grab = () => { snap = Object.fromEntries(fields.map((f,i)=>[labels[i], f.value])); };
  const onClick = (e) => { if (e.target.closest('button')) { submitted++; grab(); } };
  form.addEventListener('click', onClick, true);
  const vw = innerWidth, vh = innerHeight; let samples = 0, off = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const iv = setInterval(()=>{ const c=document.querySelector('[data-ghost-cursor]'); if(!c) return; const r=c.getBoundingClientRect(); if(r.width===0&&r.height===0) return;
    samples++; minX=Math.min(minX,r.left); minY=Math.min(minY,r.top); maxX=Math.max(maxX,r.right); maxY=Math.max(maxY,r.bottom);
    if (r.left < -2 || r.top < -2 || r.right > vw + 2 || r.bottom > vh + 2) off++; }, 40);
  const t0 = performance.now();
  let res = null, err = null;
  try {
    if ('${mode}'==='ghost') await g.ghostAddRow(form, expected, { caption: 'Stress run' });
    else res = await g.runAgentAddRow();
  } catch(e) { err = String(e&&e.message||e); }
  const landedBy = async () => { const t=performance.now(); while(performance.now()-t<8000){ const n=g.readTable(g.findLiftedForm()||form); if(n && n.rows.length>before) return n; await new Promise(r=>setTimeout(r,100)); } return null; };
  const after = await landedBy();
  const dur = performance.now() - t0;
  clearInterval(iv); form.removeEventListener('click', onClick, true);
  const exp = '${mode}'==='ghost' ? expected : (snap ? Object.values(snap) : []);
  return { error: err || (res && !res.ok ? res.reason : null), labels, expected: exp, snap, submitted, before, after: after ? after.rows.length : null,
    newRow: after ? after.rows[after.rows.length-1] : null, columns: T.columns, dur, samples, off, box: [minX,minY,maxX,maxY], vw, vh };
})()`;

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const runs = [];
try {
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: BASE });
  await ev(`localStorage.setItem('create.profile',JSON.stringify({state:{intent:'build',level:'dev',onboarded:true},version:0}))`);
  for (const ent of ENTITIES) {
    const lift = await fetch(API + "/api/lift", { method: "POST", headers: { "content-type": "application/json", Origin: new URL(BASE).origin }, body: JSON.stringify({ entity: { kind: ent.kind, title: ent.title + " " + Date.now(), columns: ent.columns, rows: ent.rows, source: { title: "Stress" } }, instruction: "track this" }) }).then((r) => r.json());
    if (!lift?.url) { console.log("lift failed for " + ent.name + ": " + JSON.stringify(lift)); runs.push({ ent: ent.name, mode: "lift", ok: false, why: "lift failed", dur: 0 }); continue; }
    const url = new URL(lift.url); url.protocol = new URL(BASE).protocol; url.host = new URL(BASE).host;
    await send("Page.navigate", { url: url.toString() });
    if (!(await waitFor(`document.querySelectorAll('[data-screen-root] table:not(.sr-only) tbody tr').length>=3 && !!document.querySelector('[data-screen-root] [data-form], [data-screen-root] input')`, 20000))) { await shot("ghost-" + ent.name + "-norender"); runs.push({ ent: ent.name, mode: "render", ok: false, why: "lifted app did not render", dur: 0 }); continue; }
    await sleep(900);
    const plan = [...Array(RUNS).fill("ghost"), "agent"];
    for (const [n, mode] of plan.entries()) {
      let r;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { r = await ev(RUN(mode)); break; } catch (e) {
          r = { error: "eval: " + e.message.split("\n")[0] };
          if (!/navigated|closed|context/i.test(e.message)) break;
          // The dev server hot-reloaded the page under us (other lanes edit files): reload the lifted app and retry. Not a ghost failure.
          console.log("  (page reloaded under the run; retrying)");
          await sleep(1500); await send("Page.navigate", { url: url.toString() });
          await waitFor(`document.querySelectorAll('[data-screen-root] table:not(.sr-only) tbody tr').length>=3`, 20000); await sleep(900);
        }
      }
      const why = [];
      if (r.error) why.push("error: " + r.error);
      else {
        if (r.submitted < 1) why.push("submit click not seen");
        if (r.after === null || r.after <= r.before) why.push(`row did not appear (${r.before} -> ${r.after})`);
        // right field got each value
        if (r.snap) {
          r.labels.forEach((l, i) => { if (r.expected[i] !== undefined && norm(r.snap[l]) !== norm(r.expected[i])) why.push(`field "${l}" had "${r.snap[l]}" expected "${r.expected[i]}"`); });
        } else why.push("no form snapshot at submit");
        // the new row shows the values
        if (r.newRow) {
          const cells = r.newRow.map(norm);
          r.expected.forEach((v, i) => { if (v && !cells.some((c) => c.includes(norm(v)))) why.push(`new row lacks "${v}" (got ${JSON.stringify(r.newRow)})`); });
        }
        if (r.samples < 5) why.push(`cursor sampled only ${r.samples}x`);
        if (r.off > 0) why.push(`cursor off-screen in ${r.off}/${r.samples} samples box=${r.box.map(Math.round)} vp=${r.vw}x${r.vh}`);
      }
      const ok = why.length === 0;
      runs.push({ ent: ent.name, mode, n, ok, why: why.join("; "), dur: r.dur || 0 });
      console.log(`${ok ? "PASS" : "FAIL"} ${ent.name}#${n} ${mode} ${Math.round(r.dur || 0)}ms ${ok ? JSON.stringify(r.expected) : why.join("; ")}`);
      if (!ok) await shot(`ghost-fail-${ent.name}-${n}`);
      await sleep(700);   // let the previous run's Pip/cursor settle
    }
    await shot("ghost-" + ent.name);
  }
} catch (e) {
  console.log("harness error: " + e.stack.split("\n").slice(0, 3).join(" | "));
  runs.push({ ent: "harness", mode: "-", ok: false, why: e.message, dur: 0 });
}
const okRuns = runs.filter((r) => r.ok), good = okRuns.map((r) => r.dur).sort((a, b) => a - b);
const median = good.length ? good[Math.floor(good.length / 2)] : 0;
const rate = runs.length ? (100 * okRuns.length) / runs.length : 0;
console.log(`\nghost stress: ${okRuns.length}/${runs.length} succeeded (${rate.toFixed(1)}%), median duration ${Math.round(median)}ms (successful runs)`);
for (const ent of ENTITIES) { const rs = runs.filter((r) => r.ent === ent.name); console.log(`  ${ent.name}: ${rs.filter((r) => r.ok).length}/${rs.length}`); }
try { ws.close(); } catch {}
cleanup();
process.exit(rate >= 95 && runs.length >= 20 ? 0 : 1);
