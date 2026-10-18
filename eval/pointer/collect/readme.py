#!/usr/bin/env python3
# Regenerate corpus/README.md and corpus/index.json from the target.json files. Run: python3 -I readme.py
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); C = os.path.join(HERE, "..", "corpus")
rows = []
for d in sorted(os.listdir(C)):
    p = os.path.join(C, d, "target.json")
    if os.path.exists(p): rows.append(json.load(open(p)))
json.dump([{"id": r["id"], "dir": r["id"], "app": r["app"], "kind": r["kind"], "label": r["label"], "utterance": r["utterance"], "box": r["box"], "cursor": r["cursor"], "imageSize": r["imageSize"], "hasDom": bool(r["files"].get("dom")), "hasAx": bool(r["files"].get("ax"))} for r in rows], open(os.path.join(C, "index.json"), "w"), indent=1)
n_dom = sum(1 for r in rows if r["files"].get("dom")); n_ax = sum(1 for r in rows if r["files"].get("ax"))
L = ["# Pointer corpus", "", f"{len(rows)} labelled targets. Each directory holds `shot.png` (1440x900, dpr 1), `shot_small.png` (longest side <= 1568 px, the Jev limit), `target.json`, and where available `dom.json`, `ax.json`, `full.png` / `full_small.png` (top 2400 px of the whole page, for web targets).", "",
"## Ground truth", "",
"- `box` is `{x,y,w,h}` in `shot.png` pixels (top-left origin). `cursor` is a point inside the box (deterministic 40-60% offset). `boxClipped` is true when the element is larger than the viewport and the box was clipped to it.",
"- Web targets (`t*`): box = the target element's DOM `getBoundingClientRect()` after scrolling it into view in the Playwright Chromium (CDP), viewport 1440x900. `dom.json` = `DomInfo` (capture contract) for the element under the cursor, with a trimmed HTML snapshot of its table/figure container. `ax.json` = CDP accessibility tree (`Accessibility.getFullAXTree` + `DOM.getBoxModel` frames), the 50 nodes nearest the cursor, shaped as `AxNode`. Google Sheets pages render inside an iframe, so their `ax.json` may be thin or absent.",
"- Native-PDF targets (`n*`): the PDFs in `../fixtures/` are printed from local HTML with `Page.printToPDF`. **No real Preview window capture or AX frames**: the cmux-cua computer-use daemon was unavailable and this shell has no Screen Recording grant (`screencapture -l` failed). Instead each PDF page is rendered with CoreGraphics (the renderer Preview uses) at 96 dpi and composited on a Preview-style gray 1440x900 canvas; the box is the print-layout DOM rect plus the page offset. These carry no `dom.json` or `ax.json`. Re-do them with real Preview AX frames once the notch app has Screen Recording and Accessibility.",
"- Not covered (not installed here): Excel and the Slack app. Slack is represented by its public pricing page, Google Sheets by two public published sheets, Notion by a public notion.site page (the owner's workspace was not touched).",
"- Live pages (transit, pricing, Wikipedia, Our World in Data) change over time. The stored screenshot and box are authoritative, so do not re-fetch the page to re-derive them.", "",
f"Totals: {n_dom} with dom.json, {n_ax} with ax.json.", "",
"## Targets", "", "| id | app | kind | target | utterance | box (x,y,w,h) | source |", "|---|---|---|---|---|---|---|"]
for r in rows:
    b = r["box"]; src = r.get("url") or r.get("source", ""); src = src.replace("|", "/")
    L.append(f"| {r['id']} | {r['app']} | {r['kind']} | {r['label']}{' (clipped)' if r.get('boxClipped') else ''} | \"{r['utterance']}\" | {b['x']},{b['y']},{b['w']},{b['h']} | {src} |")
L += ["", "## Rebuild", "", "```", "node eval/pointer/collect/collect.mjs            # web targets (needs the cached Playwright Chromium; network)", "node eval/pointer/collect/print-fixtures.mjs     # fixtures/*.html -> *.pdf + layout.json", "swiftc -O eval/pointer/collect/pdf2png.swift -o $TMPDIR/pdf2png && for n in schedule pricing chart invoice; do $TMPDIR/pdf2png eval/pointer/fixtures/$n.pdf eval/pointer/fixtures/$n.page.png; done", "python3 -I eval/pointer/collect/native.py        # native-PDF targets", "python3 -I eval/pointer/collect/readme.py        # this file + index.json", "python3 -I eval/pointer/collect/verify.py OUT_DIR [id-prefix]   # draw boxes on shots for review", "```", ""]
open(os.path.join(C, "README.md"), "w").write("\n".join(L))
print(len(rows), "targets")
