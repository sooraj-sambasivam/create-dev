# Create pointer: results (one page)

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
