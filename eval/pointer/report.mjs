// Markdown summary for eval:pointer results. Usage: node eval/pointer/report.mjs <results.json>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
const num = (v, f = 0) => (v == null || Number.isNaN(v) ? "n/a" : v.toFixed(f));

export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

/** Aggregate one provider's per-call rows into the summary row. */
export function summarizeProvider(rows) {
  const scored = rows.filter((r) => !r.skipped);
  const ok = scored.filter((r) => !r.error);
  const lat = ok.map((r) => r.ms);
  const costs = scored.map((r) => r.costUsd ?? 0);
  return {
    calls: scored.length,
    top1: scored.filter((r) => r.top1).length,
    top1Pct: scored.length ? scored.filter((r) => r.top1).length / scored.length : null,
    meanIoU: scored.length ? scored.reduce((a, r) => a + (r.iou ?? 0), 0) / scored.length : null,
    p50: percentile(lat, 50),
    p95: percentile(lat, 95),
    errors: scored.filter((r) => r.error).length,
    asks: scored.filter((r) => r.ask && !r.result).length,
    silentFailures: scored.filter((r) => !r.error && !r.result && !r.ask).length,
    usdPer100: scored.length ? (100 * costs.reduce((a, b) => a + b, 0)) / scored.length : null,
  };
}

export function renderMarkdown(res) {
  const L = [];
  L.push(`# Pointer eval ${res.startedAt}`, "");
  L.push(`Corpus: ${res.targetCount} targets. API: ${res.api}. Concurrency ${res.concurrency}, timeout ${res.timeoutMs} ms, retries 0.`);
  L.push(`Hit rule: IoU >= 0.5 AND predicted box contains the cursor. Costs are estimates (see PRICING in run.mjs).`, "");
  L.push("## Per provider", "");
  L.push("| Provider | Calls | Top-1 | Mean IoU | p50 ms | p95 ms | Errors | Which one? | Silent fails | $/100 calls |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const [name, p] of Object.entries(res.providers)) {
    if (p.status !== "ran") {
      L.push(`| ${name} | - | ${p.status === "no-key" ? "no key" : p.status} | - | - | - | - | - | - | - |`);
      continue;
    }
    const s = p.summary;
    L.push(
      `| ${name} | ${s.calls} | ${pct(s.top1, s.calls)} | ${num(s.meanIoU, 2)} | ${num(s.p50)} | ${num(s.p95)} | ${s.errors} | ${s.asks} | ${s.silentFailures} | $${num(s.usdPer100, 3)} |`,
    );
  }
  L.push("", "## Per stage (full chain on a subset)", "");
  L.push("| Stage | Endpoint | Budget ms | n | p50 ms | p95 ms | Errors | Within budget (p50) |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const [stage, s] of Object.entries(res.stages ?? {})) {
    const within = s.p50 == null ? "n/a" : s.p50 <= s.budgetMs ? "yes" : "NO";
    L.push(`| ${stage} | ${s.endpoint} | ${s.budgetMs} | ${s.n} | ${num(s.p50)} | ${num(s.p95)} | ${s.errors} | ${within} |`);
  }
  if (res.chain) {
    L.push("", `End-to-end locate+read+intent: p50 ${num(res.chain.p50)} ms, p95 ${num(res.chain.p95)} ms over ${res.chain.n} targets (target p50 < 2500 ms).`);
  }
  return L.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = process.argv[2];
  if (!f) {
    console.error("usage: node eval/pointer/report.mjs <results.json>");
    process.exit(2);
  }
  console.log(renderMarkdown(JSON.parse(readFileSync(f, "utf8"))));
}
