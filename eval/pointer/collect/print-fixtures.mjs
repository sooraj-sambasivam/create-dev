#!/usr/bin/env node
// Print the local HTML fixtures to PDF with Chromium (Page.printToPDF) and record print-layout rects of the targets.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openBrowser, setViewport, goto } from "./cdp.mjs";

const FX = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const MARGIN = 0.6 * 96; // px at 96 dpi; @page margin 0.6in, Letter = 816x1056 px
const SPECS = {
  schedule: { n01: "#timetable", n02: "#arr1" },
  pricing: { n03: "#plans", n04: "#proprice" },
  chart: { n05: "#chart", n06: "#bar-q4" },
  invoice: { n07: "#items", n08: "#total" },
};
const b = await openBrowser();
await setViewport(b, Math.round(816 - 2 * MARGIN), 1056);
const layout = {};
for (const [name, targets] of Object.entries(SPECS)) {
  await goto(b, "file://" + join(FX, name + ".html"), { settle: 500 });
  await b.send("Emulation.setEmulatedMedia", { media: "print" });
  const rects = {};
  for (const [tid, sel] of Object.entries(targets)) {
    const r = await b.ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:r.x+${MARGIN},y:r.y+scrollY+${MARGIN},w:r.width,h:r.height}})()`);
    rects[tid] = r;
  }
  const pdf = await b.send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
  writeFileSync(join(FX, name + ".pdf"), Buffer.from(pdf.data, "base64"));
  layout[name] = { page: { w: 816, h: 1056, unit: "css px @96dpi (Letter)" }, rects };
  await b.send("Emulation.setEmulatedMedia", { media: "" });
  console.log("printed", name, JSON.stringify(rects));
}
writeFileSync(join(FX, "layout.json"), JSON.stringify(layout, null, 1));
b.close(); process.exit(0);
