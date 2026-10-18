# Demo quality

Real server on :3002 (MOCK_AI=0), 15 scenarios in `scripts/eval/demo/scenarios.json`, run with `node scripts/eval/demo/run.mjs --round <name>`. Outputs live in the scratchpad `demo-quality/round0..3`. Scores are one reader's rubric reading of the PNG and JSON, not an automated metric. Server vitest 361/361 and `tsc --noEmit` clean (server and web).

## Rubric (0-5)
- Lift: D data fidelity (rows and values match the source), S structure (table, chart, form wired, columns match fields), C copy (clean title, headers, summary, no request echo), V visual (minimal, readable).
- Chat (Ch): grounded in the table and chart, correct, at most 3 sentences, honest when data is missing, right provider.
- Edit (E): the target changes as asked, nothing else changes, short summary.
- Build: S, C, V as above, plus example rows agree with the chart.

## Round by round (lift D/S/C/V; chat Ch; edit E)
| id | r0 | r1 | r2 | r3 |
|---|---|---|---|---|
| L01 timetable | 1/2/3/2 | 2/3/4/3 | 2/3/4/3 | 2/3/4/3 |
| L02 sales | 4/2/3/4 | 5/5/4/5 | 5/5/4/5 | 5/5/4/5 |
| L03 pricing | 4/2/4/4 | 5/4/4/4 | 5/4/4/5 | 5/4/4/5 |
| L04 invoice | 3/4/1/2 | 5/5/4/4 | 5/5/4/4 | 4/5/4/4 |
| L05 life expectancy | 2/4/2/3 | 3/4/4/4 | 3/4/4/4 | 3/4/4/4 |
| C01 sales | 1 | 5 | 5 | 5 |
| C02 chart | 3 | 4 | 4 | 4 |
| C03 busiest stop | 4 | 4 | 4 | 4 |
| E01 bigger | 5 | 5 | 5 | 5 |
| E02 blue | 0 | 3 | 3 | 3 |
| E03 rename | 4 | 4 | 4 | 4 |
| E04 delete | 5 | 5 | 5 | 5 |
| B01 bakery | S3 C3 V2 | S4 C4 V4 | S4 C5 V4 | S4 C5 V4 |
| B02 sign-up | S3 C4 V4 | S3 C4 V4 | S4 C5 V5 | S4 C5 V5 |
| B03 tutoring | S2 C3 V3 | S2 C3 V3 | S3 C4 V3 | S4 C5 V5 |

## Round 4 (demo-fixes lane, real :3002, 15/15 ran)
Outputs in the scratchpad `demo-quality/round4`. Scores are the same rubric; B01-B03 and L02-L03 were not re-scored (latency only, same prompts).
| id | r4 | note |
|---|---|---|
| L01 timetable | 4/4/4/3 | locate now returns the whole table (scope container, was one row). 8 rows from the 1440x900 viewport shot (all that is visible); 20 rows when the crop comes from the corpus full-page capture (what a scroll capture would give). Title "Lynnwood to Federal Way stops" (was "track this train"). Many cells are ":" placeholders on the source page. |
| L04 invoice | 5/5/4/4 | title "Invoice line items and subtotal", no request echo; 7 rows |
| L05 life expectancy | 3/4/4/4 | 13 rows, value column "Life Expectancy, 2023" |
| E02 blue | 5 | edit sets style.color on the chart; bars render #2563eb (the chart title takes the color too) |
| C01 / C02 / C03 | 5 / 4 / 4 | providers inkling / claude / gemini; 2.4 / 1.8 / 2.3 s |
| B01 / B02 / B03 latency | | 12.8 / 10.1 / 12.0 s |

What changed: `pipeline/container.ts` (a lift verb such as track, turn, make, build beats a row noun; an explicit "row" or "entry" still picks the row); `extract/extract.ts` and `lift/clean.ts` (a missing or echoed title becomes "Extracted data", which the lift step replaces with a title derived from the data; titles made only of the request's words count as echoes); `ai/claude.ts` (every tool_use block in a turn gets a tool_result on repair, the likely cause of the 400; not reproduced live, since repairs succeeded in this run); `ask/ask.ts` (default Inkling failure now sets `x-model-fallback`, and the answer carries provider "claude"); `POST /api/traces` (dev only, 204, appends to `client-YYYYMMDD.jsonl`); `LiveBlocks.tsx` (chart series 0 uses the node or style color); `CanvasMode.tsx` (library folds to its icon when the preview opens below 1500px, preview width capped so the drawing area stays at least 540px and the page frame at least 480px; canvas e2e 22/22).

## Final prompts, in brief
- `lift/clean.ts` and `entityToScreen`: strip "(row n)" labels, type columns from values, plot one series, exclude total rows, never use a title that echoes the request.
- `lift/polish.ts`: plain sentence-case copy, summary under 16 words naming what the data covers.
- `extract/extract.ts`: exact labels, header row in columns, axis columns named by what labels are, value columns carry the unit, year in the title, no repeated labels.
- `ask/ask.ts`: table rows and chart series in context, cite the element once, at most 3 sentences, say what is missing, 400 max tokens.
- `ai/prompt.ts`: booking, sign-up and tracker pages are one focused app screen; marketing pages 5-6 short sections, at most 3 cards per row; 3-5 example rows matching the chart; edit-node changes only the target; chart color edits use #2563eb, #dc2626, #16a34a.

## Canonical demo set (`scripts/eval/demo/demo-set.json`)
Rounds 1-3 are the three consecutive runs. Latencies in ms, r1/r2/r3.
1. L02 lift. Target: Google Sheets Category/Sales/% of Total table. Say "turn this into something I can track and add to". Expect a "Sales share by category" app: table A $100, B $140, C $440, D $340, Total $1,020; Sales chart without the Total; 3-field add-row form. Scores 5/5/4/5 in all three. 3158/2905/3243.
2. C01 chat (Inkling default), pointing at the chart. Ask "Which category is biggest, and what share of the total is it?" Expect Category C, $440, 43.1%, cites table and chart, 3 sentences. Ch 5 in all three. 1028/1414/1219.
3. E01 edit, pointing at the title. Say "make this bigger". Expect only the title to grow (4xl), "Title is now larger." E 5 in all three. 1777/1768/2021.
4. E04 edit, pointing at the footer of a pre-lifted pricing page. Say "delete this". Expect footer gone; table, chart, form stay. E 5 in all three. 1056/895/1081.
5. B02 build. Prompt "a sign-up sheet for study nights". Expect a focused "Study night sign-up" screen with form, table and chart on 3 matching example rows. S4 C5 V5 in rounds 2 and 3 only (round 1: S3 C4 V4, 12934 ms); latency 12934/5600/5514. Weakest pick: two clean runs, not three.

Phone add-row and the pointer "make this blue" beat are not in the set; see below.

## Known weak spots to avoid on stage
- A table taller than the viewport is read only as far as the screenshot shows (8 rows on the Sound Transit timetable). Full rows need a scroll capture in the extension; the eval uses the corpus full-page image for L01.
- L01 cells on the live page are mostly ":" placeholders, so its table is sparse.
- Any PDF lift (L03, L04) spends 4-5s in locate. Pre-lift and open by `?p=<id>`.
- L05 chart lift varies run to run (6 or 13 rows).
- E02 recolors the chart title as well as the bars.
- B01 is S4/V4 with a 10-13s build.
- The edit-node repair fix (tool_result for every tool_use) is untested against the live API; first-call edits have succeeded in every run.
- The composer still shows the coffee shop demo and the other two (web, not in this lane).
