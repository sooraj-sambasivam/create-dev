#!/usr/bin/env node
// Golden demo eval: lifts (locate -> extract -> lift), Chat, pointer edits, typed builds, against a REAL server.
//   node scripts/eval/demo/run.mjs [--only L01,C0] [--round round0] [--out <dir>]
// Env: EVAL_API (default from scenarios.json), EVAL_VIEWER. Reads no .env and prints no keys.
// Output: <out>/<round>/<id>.json, <id>.png and summary.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { openBrowser, setViewport, goto, sleep } from "../../../eval/pointer/collect/cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const CORPUS = join(ROOT, "eval/pointer/corpus");
const cfg = JSON.parse(readFileSync(join(HERE, "scenarios.json"), "utf8"));
const API = (process.env.EVAL_API ?? cfg.api).replace(/\/$/, "");
const VIEWER = (process.env.EVAL_VIEWER ?? cfg.viewer).replace(/\/$/, "");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ROUND = arg("round", "round0");
const OUT_BASE = arg("out", "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/demo-quality");
const OUT = join(OUT_BASE, ROUND);
const only = (arg("only", "") || "").split(",").filter(Boolean);
mkdirSync(OUT, { recursive: true });

const dataUrl = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;

async function call(path, body, { method = "POST", timeoutMs = 120_000 } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method, headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { ms: Math.round(performance.now() - t0), status: res.status, json, headers: Object.fromEntries(res.headers), error: res.ok ? undefined : (json?.error ?? text.slice(0, 200)) };
  } catch (e) { return { ms: Math.round(performance.now() - t0), status: 0, json: null, headers: {}, error: String(e.message ?? e) }; }
}

function cropPng(src, box, dst) {
  const pad = 6;
  const x = Math.max(0, Math.round(box.x - pad)), y = Math.max(0, Math.round(box.y - pad));
  const w = Math.max(8, Math.round(box.w + pad * 2)), h = Math.max(8, Math.round(box.h + pad * 2));
  execFileSync("sips", ["-c", String(h), String(w), "--cropOffset", String(y), String(x), src, "--out", dst], { stdio: "ignore" });
}

function walk(nodes, fn, parent = null) { for (const n of nodes ?? []) { fn(n, parent); if (n.type === "container") walk(n.children, fn, n); } }
function replaceIn(nodes, id, repl) {
  const out = [];
  for (const n of nodes) {
    if (n.id === id) { out.push(...repl); continue; }
    out.push(n.type === "container" ? { ...n, children: replaceIn(n.children, id, repl) } : n);
  }
  return out;
}
function labelOf(n) {
  return (n.text ?? n.label ?? n.title ?? (n.type === "table" ? "table" : n.type)).toString().slice(0, 100);
}
const sentences = (s) => (s.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).filter((x) => x.trim()).length;

/** Structural checks for a lifted app: table + chart + add-row form wired through liveFormId. */
function structureCheck(screen) {
  const nodes = []; walk(screen.children, (n) => nodes.push(n));
  const table = nodes.find((n) => n.type === "table"), chart = nodes.find((n) => n.type === "chart");
  const forms = nodes.filter((n) => n.type === "container" && n.children.some((c) => c.type === "button" && !c.href) && n.children.some((c) => c.type === "textbox"));
  const form = forms.find((f) => f.id === table?.liveFormId) ?? forms[0];
  return {
    hasTable: !!table, hasChart: !!chart, hasForm: !!form,
    tableWired: !!table && !!form && table.liveFormId === form.id,
    chartWired: !!chart && !!form && chart.liveFormId === form.id,
    tableRows: table?.rows?.length ?? 0, tableCols: table?.columns?.length ?? 0,
    fields: form ? form.children.filter((c) => c.type === "textbox").length : 0,
    fieldsMatchCols: !!form && !!table && form.children.filter((c) => c.type === "textbox").length === table.columns.length,
  };
}

const browser = await openBrowser();
await setViewport(browser, 1280, 800);

async function render(url, file) {
  await goto(browser, url, { settle: 1800 });
  const m = await browser.send("Page.getLayoutMetrics");
  const h = Math.min(5000, Math.ceil(m.cssContentSize?.height ?? m.contentSize.height));
  const r = await browser.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1280, height: Math.max(800, h), scale: 1 } });
  writeFileSync(file, Buffer.from(r.data, "base64"));
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
async function renderChat(q, a, meta, file) {
  const html = `<body style="font:16px system-ui;margin:0;padding:40px;background:#fff;color:#111"><div style="max-width:760px;margin:auto"><div style="color:#666;font-size:13px">${esc(meta)}</div><p style="background:#f2f2f2;padding:12px 16px;border-radius:12px"><b>You</b><br>${esc(q)}</p><p style="border:1px solid #ddd;padding:12px 16px;border-radius:12px"><b>Chat</b><br>${esc(a)}</p></div></body>`;
  await goto(browser, "data:text/html;charset=utf-8," + encodeURIComponent(html), { settle: 200 });
  const r = await browser.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(r.data, "base64"));
}

const state = {}; // id -> { protoId, screen, png }
const summary = [];
const health = await call("/api/health", null, { method: "GET" });
if (health.json?.mock) { console.error("Server is in MOCK mode; refusing."); browser.close(); process.exit(2); }

async function savePrototype(screen, title) {
  const r = await call("/api/prototypes", { screen, title });
  return r;
}

async function runLift(s) {
  const dir = join(CORPUS, s.corpus);
  const target = JSON.parse(readFileSync(join(dir, "target.json"), "utf8"));
  const dom = existsSync(join(dir, "dom.json")) ? JSON.parse(readFileSync(join(dir, "dom.json"), "utf8")) : undefined;
  const ax = existsSync(join(dir, "ax.json")) ? JSON.parse(readFileSync(join(dir, "ax.json"), "utf8")) : undefined;
  const shot = join(dir, "shot.png");
  const small = join(dir, "shot_small.png");
  const input = { source: "extension", image: dataUrl(shot), imageSize: target.imageSize, ...(existsSync(small) ? { imageSmall: dataUrl(small) } : {}), cursor: target.cursor, ...(dom ? { dom } : {}), ...(ax ? { ax } : {}), utterance: s.utterance, hint: target.label };
  const rec = { id: s.id, type: "lift", corpus: s.corpus, utterance: s.utterance, truth: target.box, latency: {} };
  const loc = await call("/api/locate", { input, mode: "commit" });
  rec.latency.locate = loc.ms; rec.locate = { status: loc.status, error: loc.error, result: loc.json?.result ?? null, ask: loc.json?.ask, stages: loc.json?.trace?.stages };
  let box = loc.json?.result?.box; rec.boxSource = "locate";
  if (!box) { box = target.box; rec.boxSource = "ground-truth-fallback"; }
  const crop = join(OUT, `${s.id}.crop.png`); cropPng(shot, box, crop);
  const ext = await call("/api/extract", { image: dataUrl(crop), hint: s.utterance, box });
  rec.latency.extract = ext.ms; rec.extract = { status: ext.status, error: ext.error, provider: ext.json?.provider, entity: ext.json?.entity };
  if (!ext.json?.entity) { rec.error = `extract failed: ${ext.error}`; return rec; }
  const lift = await call("/api/lift", { entity: ext.json.entity, instruction: s.utterance });
  rec.latency.lift = lift.ms; rec.lift = { status: lift.status, error: lift.error, ...lift.json };
  if (!lift.json?.id) { rec.error = `lift failed: ${lift.error}`; return rec; }
  const proto = await call(`/api/prototypes/${lift.json.id}`, null, { method: "GET" });
  rec.screen = proto.json?.screen; rec.protoId = lift.json.id; rec.url = `${VIEWER}/?p=${lift.json.id}`;
  rec.auto = structureCheck(rec.screen ?? { children: [] });
  const ent = ext.json.entity;
  const tbl = []; walk(rec.screen?.children, (n) => n.type === "table" && tbl.push(n));
  rec.auto.entityRows = ent.rows.length; rec.auto.rowsPreserved = tbl[0] ? tbl[0].rows.length === new Set(ent.rows.map((r) => JSON.stringify(r))).size : false;
  rec.latency.total = rec.latency.locate + rec.latency.extract + rec.latency.lift;
  return rec;
}

async function runChat(s) {
  const base = state[s.from];
  const rec = { id: s.id, type: "chat", from: s.from, question: s.question, model: s.model, latency: {} };
  if (!base) { rec.error = `dependency ${s.from} missing`; return rec; }
  const body = { question: s.question, screen: base.screen, pointer: { targetId: s.pointerNode, label: s.pointerLabel }, history: [], ...(s.model ? { model: s.model } : {}) };
  const r = await call("/api/ask", body);
  rec.latency.ask = r.ms; rec.status = r.status; rec.error = r.error; rec.answer = r.json?.answer; rec.provider = r.json?.provider; rec.fallbackHeader = r.headers["x-model-fallback"];
  rec.auto = { sentences: r.json?.answer ? sentences(r.json.answer) : 0, expectProvider: s.expectProvider, providerOk: r.json?.provider === s.expectProvider, suggestCode: r.json?.suggestCode };
  rec.contextTable = (() => { let t; walk(base.screen.children, (n) => { if (n.type === "table") t = { columns: n.columns, rows: n.rows }; }); return t; })();
  rec.protoId = base.protoId; rec.url = base.url;
  return rec;
}

async function runEdit(s) {
  const base = state[s.from];
  const rec = { id: s.id, type: "edit", from: s.from, transcript: s.transcript, expect: s.expect, latency: {} };
  if (!base) { rec.error = `dependency ${s.from} missing`; return rec; }
  const candidates = []; walk(base.screen.children, (n) => candidates.push({ id: n.id, label: labelOf(n), kind: "node" }));
  const pointer = { targetId: s.pointerNode, label: s.pointerLabel };
  const intent = await call("/api/route-intent", { transcript: s.transcript, candidates, pointer });
  rec.latency.intent = intent.ms; rec.intent = { status: intent.status, error: intent.error, result: intent.json, engine: intent.headers["x-intent-engine"] };
  const nodeId = (intent.json?.isCommand && intent.json?.targetId) || s.pointerNode;
  rec.nodeId = nodeId; rec.intentTargetMatches = nodeId === s.pointerNode;
  const edit = await call("/api/edit-node", { prompt: s.transcript, screen: base.screen, nodeId });
  rec.latency.edit = edit.ms; rec.edit = { status: edit.status, error: edit.error, summary: edit.json?.summary, nodes: edit.json?.nodes };
  if (!edit.json?.nodes) { rec.error = `edit failed: ${edit.error}`; return rec; }
  const screen = { ...base.screen, children: replaceIn(base.screen.children, nodeId, edit.json.nodes) };
  const saved = await savePrototype(screen, screen.title);
  rec.screen = screen; rec.protoId = saved.json?.id; rec.url = saved.json?.id ? `${VIEWER}/?p=${saved.json.id}` : undefined;
  // What changed, node by node (JSON diff by id).
  const before = new Map(), after = new Map();
  walk(base.screen.children, (n) => before.set(n.id, JSON.stringify(n.type === "container" ? { ...n, children: n.children.map((c) => c.id) } : n)));
  walk(screen.children, (n) => after.set(n.id, JSON.stringify(n.type === "container" ? { ...n, children: n.children.map((c) => c.id) } : n)));
  rec.diff = { removed: [...before.keys()].filter((k) => !after.has(k)), added: [...after.keys()].filter((k) => !before.has(k)), changed: [...before.keys()].filter((k) => after.has(k) && after.get(k) !== before.get(k)) };
  rec.latency.total = rec.latency.intent + rec.latency.edit;
  return rec;
}

async function runBuild(s) {
  const rec = { id: s.id, type: "build", prompt: s.prompt, latency: {} };
  const r = await call("/api/generate", { prompt: s.prompt });
  rec.latency.generate = r.ms; rec.status = r.status; rec.error = r.error; rec.summary = r.json?.summary; rec.screen = r.json?.screen;
  if (!r.json?.screen) return rec;
  const saved = await savePrototype(r.json.screen, r.json.screen.title);
  rec.protoId = saved.json?.id; rec.url = saved.json?.id ? `${VIEWER}/?p=${saved.json.id}` : undefined;
  const nodes = []; walk(r.json.screen.children, (n) => nodes.push(n));
  rec.auto = { nodeCount: nodes.length, types: [...new Set(nodes.map((n) => n.type))], ...structureCheck(r.json.screen) };
  return rec;
}

for (const s of cfg.scenarios) {
  const needed = only.length === 0 || only.some((o) => s.id.startsWith(o) || s.id.includes(o)) || [...cfg.scenarios].some((x) => only.some((o) => x.id.includes(o)) && x.from === s.id);
  if (!needed) continue;
  process.stdout.write(`${s.id} ... `);
  let rec;
  try { rec = s.type === "lift" ? await runLift(s) : s.type === "chat" ? await runChat(s) : s.type === "edit" ? await runEdit(s) : await runBuild(s); }
  catch (e) { rec = { id: s.id, type: s.type, error: String(e.stack ?? e) }; }
  try {
    const png = join(OUT, `${s.id}.png`);
    if (s.type === "chat") await renderChat(s.question, rec.answer ?? `(no answer: ${rec.error})`, `${rec.provider ?? "none"} · ${rec.latency?.ask}ms · on ${s.from}`, png);
    else if (rec.url) await render(rec.url, png);
    if (existsSync(png)) rec.png = png;
  } catch (e) { rec.renderError = String(e.message ?? e); }
  state[s.id] = { protoId: rec.protoId, screen: rec.screen, url: rec.url };
  writeFileSync(join(OUT, `${s.id}.json`), JSON.stringify(rec, null, 2));
  summary.push({ id: s.id, type: s.type, ok: !rec.error, latency: rec.latency, url: rec.url, png: rec.png, auto: rec.auto, error: rec.error });
  console.log(rec.error ? `ERROR ${String(rec.error).slice(0, 120)}` : `ok ${JSON.stringify(rec.latency)}`);
}
writeFileSync(join(OUT, "summary.json"), JSON.stringify({ api: API, viewer: VIEWER, at: new Date().toISOString(), summary }, null, 2));
browser.close();
