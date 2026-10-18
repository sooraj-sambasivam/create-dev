#!/usr/bin/env node
// pnpm eval:pointer  -- runs every locate provider over the labelled corpus and reports IoU, top-1, latency, cost.
//
// Corpus: eval/pointer/corpus/manifest.json
//   { "targets": [{ "id", "app", "kind", "hint"?, "utterance"?, "screenshot": "x.png", "imageSize"?: {w,h},
//                   "cursor": {x,y}, "box": {x,y,w,h}, "ax"?: "x.ax.json", "dom"?: "x.dom.json" }] }
//   Files are relative to the corpus dir. cursor and box are in screenshot pixels. ax = AxNode JSON, dom = DomInfo JSON.
//
// Env: EVAL_API (default http://localhost:3001), EVAL_CORPUS (manifest path), EVAL_PROVIDERS (comma list),
//      EVAL_LIMIT (max targets), EVAL_CHAIN_N (targets for full chain, default 10).
// Never prints keys: only GET /api/health boolean flags are read, and the script never reads .env.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { percentile, summarizeProvider, renderMarkdown } from "./report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = (process.env.EVAL_API ?? "http://localhost:3001").replace(/\/$/, "");
const MANIFEST = resolve(process.env.EVAL_CORPUS ?? (existsSync(join(HERE, "corpus", "manifest.json")) ? join(HERE, "corpus", "manifest.json") : join(HERE, "corpus", "index.json")));
const CONCURRENCY = 3;
const TIMEOUT_MS = 10_000;
const CHAIN_N = Number(process.env.EVAL_CHAIN_N ?? 10);

// Mirror of STAGE_BUDGET_MS in packages/shared/src/capture.ts (kept literal so this script needs no build step).
const STAGE_BUDGET_MS = { capture: 120, locate: 300, read: 1500, intent: 300, act: 800 };

// Cost estimates. USD per call when the API returns no token counts; USD per 1M tokens when it does
// (trace.usage = { inputTokens, outputTokens }). These are placeholders to be corrected against vendor invoices.
const PRICING = {
  perceptron: { perCall: 0.002, perMTokIn: 0.5, perMTokOut: 1.5 },
  jev: { perCall: 0.001, perMTokIn: 0.3, perMTokOut: 0.9 },
  gemini: { perCall: 0.0015, perMTokIn: 0.3, perMTokOut: 2.5 },
  claude: { perCall: 0.006, perMTokIn: 3, perMTokOut: 15 },
  dom: { perCall: 0 },
  ax: { perCall: 0 },
  fused: { perCall: 0.004 }, // sum of the model providers it actually calls is not visible; rough mid estimate
};
// provider -> /api/health flag required to run it (null = always available)
const KEY_FLAG = { dom: null, ax: null, fused: null, perceptron: "hasPerceptron", jev: "hasTypesafe", gemini: "hasGemini", claude: "hasAnthropic" };
const ALL_PROVIDERS = ["dom", "ax", "perceptron", "jev", "gemini", "claude", "fused"];

const iouOf = (a, b) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
};
const contains = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

function pngSize(buf) {
  if (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  return null;
}

function loadCorpus() {
  if (!existsSync(MANIFEST)) {
    console.error(`No corpus manifest at ${MANIFEST}. Record targets first (see header of eval/pointer/run.mjs).`);
    process.exit(2);
  }
  const dir = dirname(MANIFEST);
  const raw = JSON.parse(readFileSync(MANIFEST, "utf8"));
  // index.json (from the corpus collector) is an array of {id, dir, hasAx, hasDom, ...}; each dir holds shot.png, ax.json, dom.json.
  // The ground-truth label is NOT sent as a hint (it would leak the answer); only the spoken utterance is.
  let targets = Array.isArray(raw)
    ? raw.map((e) => ({ ...e, screenshot: `${e.dir}/shot.png`, ax: e.hasAx ? `${e.dir}/ax.json` : undefined, dom: e.hasDom ? `${e.dir}/dom.json` : undefined }))
    : raw.targets;
  if (process.env.EVAL_LIMIT) targets = targets.slice(0, Number(process.env.EVAL_LIMIT));
  return targets.map((t) => {
    const buf = readFileSync(join(dir, t.screenshot));
    const mime = t.screenshot.endsWith(".jpg") || t.screenshot.endsWith(".jpeg") ? "jpeg" : "png";
    return {
      ...t,
      imageSize: t.imageSize ?? pngSize(buf),
      image: `data:image/${mime};base64,${buf.toString("base64")}`,
      axTree: t.ax ? JSON.parse(readFileSync(join(dir, t.ax), "utf8")) : undefined,
      domInfo: t.dom ? JSON.parse(readFileSync(join(dir, t.dom), "utf8")) : undefined,
    };
  });
}

async function call(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const r = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const text = await r.text();
    const ms = performance.now() - t0;
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
    if (!r.ok) return { ms, error: `HTTP ${r.status}: ${String(json?.error ?? text).slice(0, 160)}` };
    return { ms, json };
  } catch (e) {
    return { ms: performance.now() - t0, error: e?.name === "AbortError" ? `timeout ${TIMEOUT_MS}ms` : String(e?.message ?? e).slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

function costOf(provider, json) {
  const p = PRICING[provider] ?? { perCall: 0 };
  const u = json?.trace?.usage ?? json?.usage;
  if (u && p.perMTokIn != null && (u.inputTokens || u.outputTokens)) {
    return ((u.inputTokens ?? 0) * p.perMTokIn + (u.outputTokens ?? 0) * p.perMTokOut) / 1e6;
  }
  return p.perCall;
}

function buildInput(provider, t) {
  const base = { source: "app", cursor: t.cursor, imageSize: t.imageSize, hint: t.hint, utterance: t.utterance };
  if (provider === "dom") return t.domInfo ? { ...base, dom: t.domInfo } : null;
  if (provider === "ax") return t.axTree ? { ...base, ax: t.axTree } : null;
  if (provider === "fused") return { ...base, image: t.image, ax: t.axTree, dom: t.domInfo };
  return { ...base, image: t.image };
}

async function runLocate(provider, t) {
  const input = buildInput(provider, t);
  if (!input) return { target: t.id, app: t.app, provider, skipped: "no input for this target" };
  const providers = provider === "fused" ? undefined : [provider];
  const { ms, json, error } = await call("/api/locate", providers ? { input, providers } : { input });
  const row = { target: t.id, app: t.app, provider, ms: Math.round(ms), costUsd: error ? 0 : costOf(provider, json) };
  if (error) return { ...row, error, top1: false, iou: 0 };
  const r = json?.result ?? null;
  row.result = r ? { box: r.box, label: r.label, kind: r.kind, source: r.source, confidence: r.confidence } : null;
  row.ask = json?.ask ?? null;
  row.traceStages = json?.trace?.stages;
  row.iou = r ? iouOf(r.box, t.box) : 0;
  row.top1 = !!r && row.iou >= 0.5 && contains(r.box, t.cursor);
  return row;
}

async function pool(items, worker, n = CONCURRENCY) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await worker(items[k]); } }));
  return out;
}

const stageSummary = (rows, endpoint, budget) => {
  const ok = rows.filter((r) => !r.error).map((r) => r.ms);
  return { endpoint, budgetMs: budget, n: rows.length, p50: percentile(ok, 50), p95: percentile(ok, 95), errors: rows.filter((r) => r.error).length };
};

async function runChain(t) {
  const loc = await runLocate("fused", t);
  const label = loc.result?.label ?? t.hint ?? "";
  const ex = await call("/api/extract", { image: t.image, hint: label || undefined });
  const intent = await call("/api/route-intent", {
    transcript: t.utterance ?? `change this ${t.kind ?? "element"}`,
    candidates: [{ id: t.id, label: label || t.id, kind: "node" }],
    pointer: { targetId: t.id, label: label || undefined },
  });
  return {
    target: t.id,
    locate: { ms: loc.ms, error: loc.error },
    read: { ms: Math.round(ex.ms), error: ex.error },
    intent: { ms: Math.round(intent.ms), error: intent.error },
    totalMs: loc.ms + Math.round(ex.ms) + Math.round(intent.ms),
    silentFailure: !loc.error && !loc.result && !loc.ask,
  };
}

async function main() {
  const health = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).then((r) => r.json()).catch(() => null);
  if (!health) { console.error(`API not reachable at ${API}`); process.exit(2); }
  const flags = Object.fromEntries(Object.entries(health).filter(([k, v]) => k.startsWith("has") && typeof v === "boolean"));
  const wanted = process.env.EVAL_PROVIDERS ? process.env.EVAL_PROVIDERS.split(",") : ALL_PROVIDERS;
  const targets = loadCorpus();
  console.log(`corpus ${targets.length} targets; health flags ${JSON.stringify(flags)}; mock=${health.mock}`);

  const providers = {};
  for (const name of wanted) {
    const flag = KEY_FLAG[name];
    if (flag && !flags[flag]) { providers[name] = { status: "no-key", flag }; console.log(`${name}: no key (${flag}=false), skipped`); continue; }
    const rows = await pool(targets, (t) => runLocate(name, t));
    const summary = summarizeProvider(rows);
    providers[name] = { status: "ran", summary, rows };
    console.log(`${name}: top1 ${summary.top1}/${summary.calls} meanIoU ${summary.meanIoU?.toFixed(2)} p50 ${summary.p50}ms errors ${summary.errors}`);
  }

  // Full chain (locate -> read -> intent) on a subset, sequential to avoid inflating latency.
  const chainRows = [];
  for (const t of targets.slice(0, CHAIN_N)) chainRows.push(await runChain(t));
  const stages = chainRows.length ? {
    locate: stageSummary(chainRows.map((r) => r.locate), "POST /api/locate (fused)", STAGE_BUDGET_MS.locate),
    read: stageSummary(chainRows.map((r) => r.read), "POST /api/extract", STAGE_BUDGET_MS.read),
    intent: stageSummary(chainRows.map((r) => r.intent), "POST /api/route-intent", STAGE_BUDGET_MS.intent),
  } : {};
  const totals = chainRows.map((r) => r.totalMs);
  const chain = chainRows.length ? { n: chainRows.length, p50: percentile(totals, 50), p95: percentile(totals, 95), silentFailures: chainRows.filter((r) => r.silentFailure).length, rows: chainRows } : null;

  const startedAt = new Date().toISOString();
  const results = { startedAt, api: API, mock: health.mock, healthFlags: flags, concurrency: CONCURRENCY, timeoutMs: TIMEOUT_MS, targetCount: targets.length, pricing: PRICING, stageBudgetMs: STAGE_BUDGET_MS, providers, stages, chain };
  const dir = join(HERE, "results");
  mkdirSync(dir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(results, null, 2));
  const md = renderMarkdown(results);
  writeFileSync(join(dir, `${stamp}.md`), md);
  console.log("\n" + md + `\n\nwrote eval/pointer/results/${stamp}.{json,md}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
