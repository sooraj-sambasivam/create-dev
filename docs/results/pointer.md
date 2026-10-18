# Create pointer: results (one page)

## Latest run: hover vs commit modes (real server :3002, real keys)

Runs `eval/pointer/results/2026-10-18T08-27-49-235Z.{json,md}` (`EVAL_MODE=hover`) and `2026-10-18T08-31-15-215Z.{json,md}` (`EVAL_MODE=commit`), both `pnpm eval:pointer` against `http://localhost:3002` (`mock=false`, Perceptron, Jev, Gemini and Anthropic keys present). Same 30 targets and hit rule as below (IoU >= 0.5 and the box contains the cursor). `LocateRequest.mode` is new and additive: **hover** runs DOM, AX and Jev only (no Perceptron, Gemini or Claude) so it stays inside the 300 ms label budget; **commit** adds Perceptron `/v1/detect` with an 8 s cap (was 4 s), Gemini when keyed, waits for Perceptron before fusing, and keeps the Claude last resort. Omitting `mode` keeps the old chain. Lift and the extension's Enter-commit pass `mode: "commit"`.

**Fused top-1: hover 66.7% (20/30), commit 80.0% (24/30). The 90% target is still not met.** Mean IoU 0.65 -> 0.75. Web targets 20/22 in both modes. PDF targets 0/8 -> 4/8.

| Provider (called alone) | Hover run | Commit run | p50 / p95 ms (hover; commit) | Cost / call* |
|---|---|---|---|---|
| DOM (22 web) | 17/22 (IoU 0.75) | 17/22 | 1 / 7; 2 / 6 | $0 |
| AX (22 web) | 14/22 (IoU 0.65) | 14/22 | 2 / 2; 2 / 4 | $0 |
| Jev (30) | 2/30 (0/8 PDF) | 1/30 (0/8 PDF) | 111 / 176; 117 / 171 | $0.001 |
| Perceptron /v1/detect (30) | 3/30 (1/8 PDF), 24 of 30 hit the 4 s cap | 6/30 (**4/8 PDF**), 16 of 30 hit the 8 s cap | 4004 / 4009; 8003 / 8008 | $0.002 |
| Gemini (30) | 0/30 (all 30 timed out at 3.5 s) | 1/30 (29 timed out) | 3507 / 3511; 3507 / 3512 | $0.0015 |
| Claude vision (30) | 0/30 (not called in hover) | 7/30 (4/8 PDF) | 2 / 4; 2630 / 3184 | $0.006 |
| **Fused** | **20/30** | **24/30** | **4 / 137**; **2 / 5133** | $0.004 |

*Cost is the placeholder per-call price in `eval/pointer/run.mjs`, not a vendor invoice. Treat totals as estimates only.

**Perceptron on the 8 PDF targets (commit, 8 s cap):** n01 schedule table hit (IoU 0.99), n02 arrival miss, n03 pricing table hit (0.99), n04 pro price miss, n05 revenue chart hit (0.87), n06 Q4 bar miss, n07 invoice items hit (0.99), n08 invoice total miss. Tables and charts hit; single cells (price, total, one bar) miss. PDF calls took 3.5 to 5.9 s, so the old 4 s cap was cutting off most of them (hover/4 s: 1/8). On web screenshots Perceptron mostly timed out even at 8 s (16 of 30 calls overall), so it is not a web locator at this image size.

**Latency per mode (fused, 30 targets):**
- Hover: p50 4 ms, p95 137 ms, max 147 ms. Inside the 300 ms label budget on every target. Chain (locate + read + intent, first 10 targets): locate p50 107 ms, total p50 1.7 s.
- Commit: p50 2 ms (22 web targets take the structural fast path), p95 5.1 s, max 5.4 s on the 8 PDF targets that wait for Perceptron. Chain locate p50 3.8 s, total p50 5.5 s. Commit is the "user pressed Enter" path, not the hover path; it does not meet the 300 ms locate budget when pixels are needed and was never meant to.

**Risk to know about:** in commit mode, 6 of 30 fused answers are wrong with no "Which one?" prompt (the PDF Perceptron boxes that miss are returned alone, so nothing disagrees with them). In hover mode it is 2 silent wrong plus 8 wrong-with-prompt. Commit trades more hits for more confident misses on PDFs. Not tuned in this lane.

**Chat (`/api/ask`):** with `TINKER_API_KEY` set and no model chosen, the default is now Inkling, with Claude as the fallback when Inkling returns nothing. Image questions now get a Perceptron (`perceptron-mk1.5`) visual description in the system prompt whenever `PERCEPTRON_API_KEY` is set. Covered by unit tests with fetch mocked (server vitest 30 files, 330 tests pass; tsc clean for shared, server, web). Answer quality and latency of Inkling and Perceptron chat were not measured here.

**Eval harness changes:** `EVAL_MODE=hover|commit` sends `mode` with every locate; the per-call timeout is now 20 s so the 8 s Perceptron cap can finish; the results JSON records `mode`. A first hover attempt was discarded because the :3002 dev server restarted mid-run (30 "fetch failed" rows); the numbers above are from clean reruns.

---

## Latest run (container lane + Jev small copy + fusion tuning)

Eval run `eval/pointer/results/2026-10-18T08-16-45-287Z.{json,md}` (`pnpm eval:pointer`), same 30 targets, same hit rule (IoU >= 0.5 and the box contains the cursor). The server ran with `MOCK_AI=1`. Perceptron had a key this time and was measured; Gemini had no key (not run); Claude vision answered "unavailable" (0/30, no real call).

**Fused top-1: 36.7% (11/30) before, 66.7% (20/30) after. The 90% target is still not met.** Mean IoU 0.42 -> 0.65. Web targets alone: 20/22 (90.9%). PDF targets: 0/8.

| Provider | Before | After | Notes |
|---|---|---|---|
| DOM (22 web) | 45.5% (10/22) | 77.3% (17/22) | returns container, row and cell, ordered by the utterance |
| AX (22 web) | 31.8% (7/22) | 63.6% (14/22) | same, boxes clipped to the capture |
| Jev (30) | 6.7% (2/30) | 3.3-13.3% (1-4/30 over 5 runs) | now gets a small copy when the image is over 1568px; corpus images are 1440x900 so the oversize path is covered by a unit test only. Run to run noise is about 3 hits |
| Perceptron (30) | not run | 6.7% (2/30) | p50 4005 ms: every call hit the 4000 ms cap, so it never helps inside the label budget |
| Fused | 36.7% (11/30) | 66.7% (20/30) | |

Fused by app (hits / targets): Sound Transit 3/3, Google Sheets 5/5, Notion 5/5, Slack pricing 2/2, Vercel 1/1, Wikipedia 3/4, Our World in Data 1/2, Preview PDF 0/8. Before: Sheets 3/5, Slack 2/2, Vercel 1/1, Notion 2/5, Wikipedia 2/4, Sound Transit 1/3, OWID 0/2, PDF 0/8.

**Label latency (fused, 30 targets):** p50 3 ms, p95 397 ms, max 4005 ms. 22 of 30 targets take the structural fast path (1 to 8 ms). The 8 PDF targets have no DOM or AX, so they wait for the pixel providers (325 to 397 ms; one hit the 4 s Perceptron cap). Locate-stage subset (10 targets, mostly PDF): p50 339 ms, p95 4006 ms against the 300 ms budget, so the budget is not met whenever pixels are needed. read p50 1 ms, route-intent p50 62 ms (mock AI, no real speech).

**Silent failures (wrong box returned with no "Which one?"):** 7 before this tuning pass (5 PDF boxes from Jev plus t14 and t22); 2 after (t14, t22). The harness counter only counts "no box and no prompt" and reports 0 in both cases, so it understates this; the number above is computed from the result rows. Fused asks "Which one?" on 4 of 30 targets and also on several hits (t02, t05, t07, t08, t10, t16 return the right box with a prompt because the runner-up scores close).

**What changed in the data path:**
- DOM and AX now return the enclosing table, row or list as well as the cell, ordered by the utterance ("track this" prefers the container; value questions prefer the cell). Corpus `dom.json`/`ax.json` were re-collected with `ancestors`; boxes, cursors and screenshots are unchanged.
- Fusion: boxes with a structural `scope` no longer pay the non-data penalty; the "huge box" penalty no longer applies to DOM rects (a DOM rect is the element itself; an image or chart that fills its crop was being dropped, which broke the extension chart e2e once Perceptron was live); a Jev-only winner now carries a "Which one? Best guess" prompt, because Jev alone is right on 1 to 4 of 30. Source priors are unchanged (AX 1, DOM 0.9, Perceptron 0.85, Gemini 0.75, Claude 0.7, Jev 0.45): the data does not support moving them, since Perceptron and Jev are both near the floor and Gemini and Claude were not measured. Trying to also drop the huge-box penalty for AX cut fused to 14/30, so it stays for AX.
- Eval harness: it now waits out HTTP 429 from the server's 120 per minute locate rate limit (wait not counted as latency). Without that, 14 of 30 fused calls errored in one run.

**Remaining failures (10 of 30):**
- 8 PDF targets: no DOM or AX; Jev is the only pixel model that answered and its boxes are coarse. n01 and n03 (tables) reach IoU 0.3 to 0.4. Needs real Preview AX frames or a working Perceptron/Gemini.
- t14 ("track this", ground truth is the row): the container spec maps "track this" to the table, the corpus label says row. Label and spec disagree; not tuned to the label.
- t22 ("explain this chart title"): returns the chart text box at IoU 0.32; cause not investigated.
- Caution: 4 corpus utterances sit close to the heuristics in `container.ts` (row nouns, value words), and the corpus was re-collected by the same lane that wrote the rules, so 20/22 on web is optimistic. 30 targets: one target is 3.3 points.

**Gate:** tsc clean for shared, server and web; server vitest 29 files, 324 tests pass; web vitest `src/replay` 26 pass; `scripts/e2e/extension.mjs` 23/23 pass (one fail, the chart Enter step, before the DOM fix above).

---

## Previous run (2026-10-18T07-46-49Z), for comparison

Create's AI pointer finds what you are pointing at on any Mac app, reads it, and acts on it. Eval run `eval/pointer/results/2026-10-18T07-46-49-269Z.{json,md}`: 30 labelled targets, hit = IoU >= 0.5 and the box contains the cursor. Reproduce with `pnpm eval:pointer`.

**Status: the 90% target is not met. Measured fused top-1 is 36.7% (11/30), and only three providers could run. Perceptron, Gemini and Claude vision were not tested because this server has no keys for them. Nothing below is a vendor claim.**

## Per sponsor model

| Model | Job in the pipeline | Top-1 | Mean IoU | p50 / p95 ms | Cost / 100 calls* | Status |
|---|---|---|---|---|---|---|
| Perceptron perceptron-mk1.5 | `/v1/detect` boxes + points, OCR with json_schema (locate, read) | not run | - | - | - | no key on server |
| TypeSafe Jev 1.14 | image + box judgments (locate on pixels, then intent) | 6.7% (2/30) | 0.08 | 150 / 224 | $0.10 | ran; weakest locator, boxes sit on a coarse grid; 0/8 on PDFs |
| Gemini gemini-3.8-flash | bounding boxes [ymin,xmin,ymax,xmax] 0-1000 (locate) | not run | - | - | - | no key on server |
| Inkling (Tinker) | chat answers (`/api/ask`) | not measured | - | - | - | wired; not part of the locate eval |
| Claude vision | last-resort locate fallback | not run | - | - | - | no key on server |
| Baselines: DOM (22 web targets) | structural, from the Chrome extension | 45.5% | 0.55 | 1 / 11 | $0 | ran |
| Baselines: AX (22 web targets) | structural, from the accessibility tree | 31.8% | 0.34 | 1 / 2 | $0 | ran |
| **Fused (AX + DOM + Jev)** | the shipped chain | **36.7%** | **0.42** | **85 / 158** | $0.40 | 6 "Which one?", 13 wrong boxes |

*Cost figures are placeholders in `eval/pointer/run.mjs`, not vendor prices. Do not quote them.

## Chosen default chain, and why

1. AX and DOM run first (about 1 ms). A hit at confidence 0.85 or more skips the pixel providers.
2. Perceptron, Jev and Gemini then run in parallel. Fusion waits 250 ms after the first result. Claude vision runs only if nothing scores 0.4 or more.
3. Source priors: AX 1, DOM 0.9, Perceptron 0.85, Gemini 0.75, Claude 0.7, Jev 0.45.

Why: only the structural-first order and Jev's low weight (cut from 0.7 to 0.45) come from data. The Perceptron and Gemini priors are untested defaults and may change once their keys are in. A box covering over 60% of the capture is down-weighted to 0.4x (AX returned a whole-window box on 6 of 22 web targets).

## Targets from the plan

| Target | Measured | Verdict |
|---|---|---|
| Top-1 >= 90% | 36.7% | not met |
| Label < 300 ms after hover | locate p50 83 ms, p95 93 ms (structural fast path only, no Perceptron/Gemini in the chain); extension hover-to-label 7 ms in its e2e | met on the fast path; not measured with pixel providers |
| Spoken command to done < 2.5 s p50 | not measured. locate+read+intent was 138 ms p50, but the server ran with `MOCK_AI=1` and no real speech | unverified |
| Zero silent failures | 0 results with no box and no prompt, but 13 of 30 returned a confident wrong box with no "Which one?" (for example t01, t04, t06, t14) | not met by the plan's wording |

## Where it fails (fused top-1 by app)

Google Sheets 3/5, Slack pricing 2/2, Vercel 1/1, Notion 2/5, Wikipedia 2/4, Sound Transit 1/3, Our World in Data 0/2, Preview PDF 0/8.

- Table versus cell: DOM and AX return the element under the cursor (a cell), but "table" and "row" targets expect the enclosing element. The fix is for the extension's `dom` payload to also send the enclosing table rect. Not done: the stored `dom.json` files lack the field, so it could not be measured.
- PDFs: no AX or DOM, so Jev is the only provider that can answer, and it got 0/8.
- Notion, OWID, Wikipedia: DOM text boxes too large or too small.

## Corpus provenance

30 targets in `eval/pointer/corpus/` (index in `index.json`, details in its `README.md`): screenshot, accessibility dump and DOM where available, and the true box per target. 22 web targets were captured in Playwright Chromium at 1440x900 (Sound Transit, two public Google Sheets, a public Notion page, Wikipedia, Our World in Data, Slack and Vercel pricing pages). The true box is the element's `getBoundingClientRect()`.

Limits:
- No Excel and no Slack app (not installed). Slack is represented by its public pricing page. No private Notion workspace was read.
- The 8 Preview targets are PDFs rendered with CoreGraphics on a Preview-style canvas, not real Preview captures. They have no AX frames. They must be redone once the notch app has Screen Recording and Accessibility.
- 30 targets is small: one target is 3.3 points.
- The notch app was not launched in this run (it needs the owner's one-time Screen Recording and Accessibility grants).

## Traces and fallback

- `docs/results/traces/trace-1-hit-google-sheets-total.json`, `trace-2-ask-preview-pdf-table.json`, `trace-3-demo-path-transit-schedule.json`: per-stage timings, no image bytes.
- Demo-path run log: `docs/results/traces/fallback-run.json`. Recording: `docs/results/traces/fallback-recording.json`.
- Re-record and replay: `node scripts/e2e/record-fallback.mjs` (`--record-only` / `--replay-only`). Replay covers `/api/generate` and `/api/route-intent`. It does not cover `/api/ask` (Chat), `/api/locate`, `/api/extract` or `/api/lift`, so those still need the server.
