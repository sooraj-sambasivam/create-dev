#!/usr/bin/env python3
# Build the 8 native-PDF targets: page render (CoreGraphics, 96 dpi) composited on a Preview-style 1440x900 canvas.
# Ground truth = print-layout DOM rects (fixtures/layout.json) offset by the page position. Run: python3 -I native.py
import json, os, subprocess
from datetime import datetime, timezone
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); FX = os.path.join(HERE, "..", "fixtures"); CORPUS = os.path.join(HERE, "..", "corpus")
layout = json.load(open(os.path.join(FX, "layout.json")))
PAGE_X, PAGE_Y = (1440 - 816) // 2, 24  # page centred in the viewer, 24 px top gap
T = [
 ("n01-pdf-schedule-table", "schedule", "n01", "table", "Route 44 weekday timetable", "track this schedule", "Preview (PDF, rendered)"),
 ("n02-pdf-schedule-arrival", "schedule", "n02", "text", "6:41 arrival time at University District Station", "when does the first bus arrive?", "Preview (PDF, rendered)"),
 ("n03-pdf-pricing-table", "pricing", "n03", "table", "Starter / Pro / Team pricing table", "track this pricing", "Preview (PDF, rendered)"),
 ("n04-pdf-pricing-pro-price", "pricing", "n04", "text", "Pro plan price $12 / month", "what does this plan cost?", "Preview (PDF, rendered)"),
 ("n05-pdf-revenue-chart", "chart", "n05", "chart", "Quarterly revenue bar chart", "what does this chart show?", "Preview (PDF, rendered)"),
 ("n06-pdf-revenue-q4-bar", "chart", "n06", "chart", "Q4 bar (72M) in the revenue chart", "why is this bar so high?", "Preview (PDF, rendered)"),
 ("n07-pdf-invoice-items", "invoice", "n07", "table", "Invoice 2041 line items table", "track this invoice", "Preview (PDF, rendered)"),
 ("n08-pdf-invoice-total", "invoice", "n08", "text", "Total due $1,165.92", "pay this amount", "Preview (PDF, rendered)"),
]
import hashlib
def jit(i, s): return 0.4 + 0.2 * (int(hashlib.sha256((i + s).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF)
for tid, fx, key, kind, label, utt, app in T:
    d = os.path.join(CORPUS, tid); os.makedirs(d, exist_ok=True)
    canvas = Image.new("RGB", (1440, 900), (226, 226, 228))
    page = Image.open(os.path.join(FX, fx + ".page.png")).convert("RGB")
    canvas.paste(page, (PAGE_X, PAGE_Y)); canvas.save(os.path.join(d, "shot.png"))
    r = layout[fx]["rects"][key]
    box = {"x": round(PAGE_X + r["x"]), "y": round(PAGE_Y + r["y"]), "w": round(r["w"]), "h": round(r["h"])}
    cur = {"x": round(box["x"] + box["w"] * jit(tid, "x")), "y": round(box["y"] + box["h"] * jit(tid, "y"))}
    subprocess.run(["sips", "-Z", "1568", os.path.join(d, "shot.png"), "--out", os.path.join(d, "shot_small.png")], capture_output=True)
    json.dump({"id": tid, "app": app, "kind": kind, "label": label, "utterance": utt, "url": None,
        "source": f"eval/pointer/fixtures/{fx}.pdf (printed from {fx}.html via Page.printToPDF)",
        "groundTruth": "layout-mapped: print-layout DOM rect + page offset on a CoreGraphics render; no Preview AX frame (cmux-cua daemon unavailable, Screen Recording not granted to this shell)",
        "viewport": {"w": 1440, "h": 900, "dpr": 1}, "imageSize": {"w": 1440, "h": 900}, "box": box, "boxClipped": False, "cursor": cur,
        "collectedAt": datetime.now(timezone.utc).isoformat(), "files": {"shot": "shot.png", "shotSmall": "shot_small.png", "dom": None, "ax": None}},
        open(os.path.join(d, "target.json"), "w"), indent=1)
    print("OK", tid, box)
