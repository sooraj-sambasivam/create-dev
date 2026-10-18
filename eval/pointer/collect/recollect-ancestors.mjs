#!/usr/bin/env node
// Re-collect dom.json / ax.json (now with `ancestors`) for the web targets against the same URLs/selectors.
// Ground truth is never touched: shot*.png, full*.png, box and cursor stay as stored. If the live page no longer puts the target
// at the stored box (tolerance TOL px), the target is marked stale in target.json and its old dom/ax files are kept as they were.
// Usage: node recollect-ancestors.mjs [--only t01,t02]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { openBrowser, setViewport, goto, sleep } from "./cdp.mjs";
import { pickAndMeasure, domAtCursor, axNearCursor, clip, CORPUS } from "./lib.mjs";
import { WEB_TARGETS } from "./targets.mjs";

const TOL = 12;
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const b = await openBrowser({ port: Number(process.env.CDP_PORT) || undefined });
await setViewport(b);
const report = [];
for (const t of WEB_TARGETS) {
  if (only && !only.some((o) => t.id.startsWith(o))) continue;
  const dir = join(CORPUS, t.id), tp = join(dir, "target.json");
  if (!existsSync(tp)) { report.push({ id: t.id, status: "missing" }); continue; }
  const meta = JSON.parse(readFileSync(tp, "utf8"));
  let status = "ok", reason = "";
  try {
    await goto(b, t.url, { settle: t.settle || 3000, readyExpr: t.readyExpr });
    if (t.pre) { await b.ev(t.pre).catch(() => {}); await sleep(800); }
    await b.ev("window.scrollTo(0,0)");
    const rect = await pickAndMeasure(b, t.find);
    if (!rect) throw new Error("element not found");
    const now = clip(rect), old = meta.box;
    const drift = Math.max(Math.abs(now.x - old.x), Math.abs(now.y - old.y), Math.abs(now.w - old.w), Math.abs(now.h - old.h));
    if (drift > TOL) throw new Error(`box moved ${JSON.stringify(now)} vs stored ${JSON.stringify(old)}`);
    const dom = await domAtCursor(b, meta.cursor);
    const ax = await axNearCursor(b, meta.cursor, t.label).catch(() => null);
    if (!dom) throw new Error("no element under stored cursor");
    writeFileSync(join(dir, "dom.json"), JSON.stringify(dom, null, 1));
    if (ax && ax.children.length) writeFileSync(join(dir, "ax.json"), JSON.stringify(ax, null, 1));
    meta.files = { ...meta.files, dom: "dom.json", ax: ax && ax.children.length ? "ax.json" : meta.files?.ax ?? null };
    meta.ancestorsCollectedAt = new Date().toISOString();
    meta.ancestors = { dom: dom.ancestors?.map((a) => a.kind) ?? [], ax: ax?.ancestors?.map((a) => a.kind) ?? [] };
    delete meta.stale; delete meta.staleReason; delete meta.staleCheckedAt;
  } catch (e) {
    status = "stale"; reason = String(e.message).slice(0, 200);
    meta.stale = true; meta.staleReason = reason; meta.staleCheckedAt = new Date().toISOString();
  }
  writeFileSync(tp, JSON.stringify(meta, null, 1));
  report.push({ id: t.id, status, reason, ancestors: meta.ancestors });
  console.log(status.toUpperCase().padEnd(6), t.id, reason, status === "ok" ? JSON.stringify(meta.ancestors) : "");
}
b.close();
console.log(`stale: ${report.filter((r) => r.status !== "ok").map((r) => r.id).join(",") || "none"}`);
process.exit(0);
