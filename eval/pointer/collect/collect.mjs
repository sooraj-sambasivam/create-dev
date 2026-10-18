#!/usr/bin/env node
// Collect web targets into eval/pointer/corpus. Usage: node collect.mjs [--only t01,t02] [--debug-dir DIR]
import { mkdirSync } from "node:fs";
import { openBrowser, setViewport, goto, sleep } from "./cdp.mjs";
import { pickAndMeasure, saveTarget, overlayCheck, clip } from "./lib.mjs";
import { WEB_TARGETS } from "./targets.mjs";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const dbg = args.includes("--debug-dir") ? args[args.indexOf("--debug-dir") + 1] : null;
if (dbg) mkdirSync(dbg, { recursive: true });
const b = await openBrowser({ port: Number(process.env.CDP_PORT) || undefined });
await setViewport(b);
const fails = [];
for (const t of WEB_TARGETS) {
  if (only && !only.some((o) => t.id.startsWith(o))) continue;
  try {
    await goto(b, t.url, { settle: t.settle || 3000, readyExpr: t.readyExpr });
    if (t.pre) { await b.ev(t.pre).catch(() => {}); await sleep(800); }
    await b.ev("window.scrollTo(0,0)");
    const rect = await pickAndMeasure(b, t.find);
    if (!rect) throw new Error("element not found: " + JSON.stringify(t.find));
    const meta = await saveTarget(b, t, rect);
    if (dbg) await overlayCheck(b, meta.box, meta.cursor, `${dbg}/${t.id}.png`);
    console.log("OK  ", t.id, JSON.stringify(meta.box), meta.boxClipped ? "(clipped)" : "");
  } catch (e) { fails.push(t.id); console.log("FAIL", t.id, String(e.message).slice(0, 200)); }
}
b.close();
if (fails.length) console.log("failed:", fails.join(","));
process.exit(0);
