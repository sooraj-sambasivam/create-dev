#!/usr/bin/env node
// Prompt eval harness. No dependencies (Node 20+). See README.md.
// Usage: node scripts/eval/run.mjs [--only a,b] [--strict]   (env: BASE_URL, EVAL_TIMEOUT_MS)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE_URL || "http://localhost:3001").replace(/\/$/, "");
const TIMEOUT = Number(process.env.EVAL_TIMEOUT_MS) || 90000;
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? (args[onlyArg + 1] || "").split(",").filter(Boolean) : [];

const spec = JSON.parse(readFileSync(join(here, "prompts.json"), "utf8"));
const resolveBody = (b) => JSON.parse(JSON.stringify(b), (_k, v) => (typeof v === "string" && v.startsWith("$") && spec.screens[v.slice(1)] ? spec.screens[v.slice(1)] : v));

const walk = (nodes, out = []) => {
  for (const n of Array.isArray(nodes) ? nodes : []) {
    out.push(n);
    if (n && Array.isArray(n.children)) walk(n.children, out);
  }
  return out;
};
const textOf = (nodes) => nodes.map((n) => [n.text, n.label, n.title, n.alt, ...(Array.isArray(n.items) ? n.items.map((i) => (typeof i === "string" ? i : i?.text ?? i?.label ?? "")) : [])].filter((s) => typeof s === "string").join(" ")).join(" ").toLowerCase();

/** Returns { hard: [], soft: [], info: {} }. hard = contract failures, soft = content failures (WARN under mock). */
function check(c, json, ms) {
  const hard = [], soft = [], info = {};
  const e = c.expect || {};
  if (e.maxLatencyMs && ms > e.maxLatencyMs) hard.push(`latency ${ms}ms > ${e.maxLatencyMs}ms`);

  if (c.endpoint === "/api/generate" || c.endpoint === "/api/edit-node") {
    const isGen = c.endpoint === "/api/generate";
    if (typeof json?.summary !== "string") hard.push("missing string `summary`");
    const top = isGen ? json?.screen?.children : json?.nodes;
    if (!Array.isArray(top)) { hard.push(isGen ? "missing screen.children[]" : "missing nodes[]"); return { hard, soft, info }; }
    const all = walk(top);
    info.nodes = all.length;
    const bad = all.filter((n) => !n || typeof n.id !== "string" || typeof n.type !== "string");
    if (bad.length) hard.push(`${bad.length} node(s) without id/type`);
    const ids = all.map((n) => n.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) hard.push(`duplicate ids: ${[...new Set(dup)].slice(0, 3).join(",")}`);
    if (e.minNodes != null && all.length < e.minNodes) hard.push(`nodes ${all.length} < min ${e.minNodes}`);
    if (e.maxNodes != null && all.length > e.maxNodes) hard.push(`nodes ${all.length} > max ${e.maxNodes}`);
    const types = new Set(all.map((n) => n.type));
    info.types = [...types].sort();
    for (const t of e.requireTypes || []) if (!types.has(t)) soft.push(`missing node type ${t}`);
    for (const group of e.anyOfTypes || []) if (!group.some((t) => types.has(t))) soft.push(`none of [${group}]`);
    const txt = textOf(all) + " " + String(json.summary || "").toLowerCase() + " " + String(json?.screen?.title || "").toLowerCase();
    for (const p of e.textMatches || []) if (!new RegExp(p, "i").test(txt)) soft.push(`text lacks /${p}/`);
  } else if (c.endpoint === "/api/route-intent") {
    if (typeof json?.isCommand !== "boolean") hard.push("isCommand not boolean");
    if (typeof json?.action !== "string") hard.push("action not string");
    if (typeof json?.confidence !== "number") hard.push("confidence not number");
    if (!("targetId" in (json || {}))) hard.push("targetId missing");
    if (e.isCommand != null && json?.isCommand !== e.isCommand) hard.push(`isCommand ${json?.isCommand} != ${e.isCommand}`);
    if (e.targetId && json?.targetId !== e.targetId) hard.push(`targetId ${json?.targetId} != ${e.targetId}`);
    if (e.action && !e.action.includes(json?.action)) hard.push(`action ${json?.action} not in [${e.action}]`);
    info.action = json?.action; info.targetId = json?.targetId;
  } else if (c.endpoint === "/api/ask") {
    const a = json?.answer;
    if (typeof a !== "string") hard.push("answer not string");
    else {
      if (a.trim().length < (e.answerMinChars || 1)) hard.push(`answer too short (${a.trim().length})`);
      for (const p of e.answerMatches || []) if (!new RegExp(p, "i").test(a)) soft.push(`answer lacks /${p}/`);
      info.answer = a.slice(0, 120);
    }
    if (!["claude", "perceptron+claude", "mock"].includes(json?.provider)) hard.push(`bad provider ${json?.provider}`);
    if (e.noEdit && (json?.screen || json?.nodes || json?.ops)) hard.push("ask must not return edits");
    info.provider = json?.provider;
  }
  return { hard, soft, info };
}

async function health() {
  try { const r = await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; } catch { return null; }
}

const h = await health();
if (!h) { console.error(`Cannot reach ${BASE}/api/health. Start the server (pnpm dev) or set BASE_URL.`); process.exit(2); }
const mock = h.mock === true;
console.log(`Target ${BASE}  mode=${mock ? "MOCK" : "REAL"}  model=${h.model ?? "?"}\n`);

const cases = spec.cases.filter((c) => !only.length || only.some((o) => c.group === o || c.id.includes(o)));
const results = [];
for (const c of cases) {
  const t0 = performance.now();
  const rec = { id: c.id, group: c.group, endpoint: c.endpoint, status: "PASS", httpStatus: null, ms: 0, reasons: [], info: {} };
  try {
    const res = await fetch(BASE + c.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(resolveBody(c.body)), signal: AbortSignal.timeout(TIMEOUT) });
    rec.ms = Math.round(performance.now() - t0);
    rec.httpStatus = res.status;
    rec.info.engine = res.headers.get("x-intent-engine") || undefined;
    const raw = await res.text();
    if (res.status === 404) { rec.status = "PENDING"; rec.reasons.push("endpoint 404 (not landed yet)"); }
    else if (!res.ok) { rec.status = "FAIL"; rec.reasons.push(`HTTP ${res.status}: ${raw.slice(0, 120)}`); }
    else {
      let json; try { json = JSON.parse(raw); } catch { json = null; }
      if (json == null) { rec.status = "FAIL"; rec.reasons.push("non-JSON body"); }
      else {
        const { hard, soft, info } = check(c, json, rec.ms);
        Object.assign(rec.info, info);
        rec.reasons.push(...hard, ...soft.map((s) => (mock ? "(mock) " : "") + s));
        if (hard.length) rec.status = "FAIL";
        else if (soft.length) rec.status = mock && !strict ? "WARN" : mock ? "WARN" : "FAIL";
      }
    }
  } catch (err) {
    rec.ms = Math.round(performance.now() - t0);
    rec.status = "FAIL"; rec.reasons.push(err?.name === "TimeoutError" ? `timeout > ${TIMEOUT}ms` : String(err?.message || err));
  }
  results.push(rec);
  console.log(`${rec.status.padEnd(7)} ${c.id.padEnd(30)} ${String(rec.ms).padStart(6)}ms`);
}

const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
console.log("\n" + [pad("case", 30), pad("endpoint", 18), pad("status", 8), pad("http", 5), pad("ms", 7), pad("nodes", 6), "notes"].join(" "));
for (const r of results) console.log([pad(r.id, 30), pad(r.endpoint, 18), pad(r.status, 8), pad(r.httpStatus ?? "-", 5), pad(r.ms, 7), pad(r.info.nodes ?? "-", 6), r.reasons.join("; ").slice(0, 90)].join(" "));

const count = (s) => results.filter((r) => r.status === s).length;
const summary = { total: results.length, pass: count("PASS"), warn: count("WARN"), fail: count("FAIL"), pending: count("PENDING") };
console.log(`\n${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail, ${summary.pending} pending of ${summary.total}`);

mkdirSync(join(here, "results"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = join(here, "results", `${stamp}.json`);
writeFileSync(out, JSON.stringify({ timestamp: new Date().toISOString(), base: BASE, mode: mock ? "mock" : "real", health: { mock: h.mock, model: h.model, hasAnthropic: h.hasAnthropic, hasTypesafe: h.hasTypesafe }, strict, summary, results }, null, 2));
console.log("Wrote " + out);
process.exit(summary.fail > 0 || (strict && summary.warn > 0) ? 1 : 0);
