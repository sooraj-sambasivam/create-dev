# Create

**Tagline:** Point at it. Say it. Own it.
**Subtitle:** Point at a table, chart or schedule you cannot edit, say what you want, and get a live app you own.

**Tracks:** DubHacks NEXT · Perceptron · SideShift · MongoDB Atlas (only if `MONGODB_URI` is set; OWNER)
**Team:** Sooraj Sambasivam, Abel Anand, pentaswan
**Video:** OWNER: paste the video link. **Repo:** OWNER: public flip is still undecided (ask in the morning).
**Atlas screenshot:** OWNER: add it if MongoDB is connected; otherwise delete the MongoDB track and the Atlas paragraph.

Status key: **(verify before submit)** means built and covered by tests or a server run, but not confirmed by hand in the final setup. Confirm it or delete the claim. Numbers come from runs on 2026-10-18 (see `docs/results/pointer.md`, `scripts/eval/results/`, `docs/results/traces/`).

## Inspiration

The information people need lives in places they cannot change: a bus timetable, a pricing page, a PDF, someone else's spreadsheet, a dashboard in another app. To use it, people copy and paste it, retype it, or wait for an engineer to build something.

AI tools do not fix this. They make you leave your work and describe it in a chat box, and the answer is text you read once.

In May 2026, Google DeepMind wrote that the mouse pointer had barely changed in more than half a century (secondary coverage in `docs/research/competitors.md`; verify before submit: link the primary post), and showed one that understands what is under it: you point, say "compare these" or "fix this", and the pointer supplies the "this". We liked that you can just point and say "this".

We wanted to push it one step. In Google's version the pointer answers questions, and the timetable is still something you can read and not change. You cannot add a row, sort it your way, chart it or let a friend contribute. We wanted pointing to end with software you keep: an app with a table, a chart and a form that stores what people add.

## What it does

The data you need is on a page you cannot edit. Create lets you point at it and say what you want. You get a live table, a chart and a form that you own, backed by a real database. Then you change the app by pointing and talking ("make this bigger"), and Chat answers questions about whatever you point at, using the app's own rows.

**Point at a table, chart or list, say "turn this into something I can track", and get a live app.**

- **Lift.** Hold Option over a table, chart, list or schedule. Create outlines it and names it. Say or type what you want. A new tab opens with an editable table, a chart and an "Add row" form. Rows are stored for real.
- **Live rows via QR.** The app page shows a QR code. Someone scans it, adds a row on their phone, and the row appears in the app's Backend tab on the laptop (the tab polls every 3 seconds). (verify before submit: scan from a physical phone on venue wifi)
- **Pointer + voice inside the app.** Hover an element, hold Option, say "make this bigger". A bubble shows what Create understood, and undo is one key. If two elements are about equally likely it asks "Which one?" and does not guess.
- **Chat.** Ask about what you point at ("why does week 3 spike?"). The answer uses the app's rows and a crop of the pointed-at region. Inkling (Thinking Machines) is the default Chat model, with Claude as the fallback, and Gemini 3.8 Flash is selectable as a second engine.
- **Work.** Describe an app in a sentence and Claude builds it; the page appears progressively as it streams. The composer has Chat and Work modes, a model and effort picker, "Approve for me" and a per-element AI box.
- **Chrome extension.** Point at a table or chart on any page, or circle a region, or crawl the same site.
- **Notch tray.** A small macOS app. Hold Option anywhere on the screen, point, and the capture lands in a tray you can open in Create. (verify before submit: it needs Screen Recording and Accessibility permissions re-granted after the last rebuild)
- **Lift from screen.** The same pipeline for things that are only pixels, such as a PDF in Preview or a screenshot.

Values read from an image are approximate, and the app says so. Exact numbers come from page tables.

## How we built it

- **One capture pipeline.** Every way of pointing (in-app, extension, notch tray, lift from screen) calls the same `POST /api/locate`. It tries the accessibility tree and the page DOM first (about 1 to 8 ms), then pixel models in parallel: Perceptron, TypeSafe Jev and Gemini, with Claude vision as a last resort. A confidence-weighted fusion picks one box, and it asks "Which one?" when two candidates are close. A confident structural hit skips the pixel models.
- **Two modes.** Hover runs only structure and Jev so the label appears inside a 300 ms budget. Commit (the user pressed Enter) adds Perceptron `/v1/detect` with an 8 s cap.
- **Per-stage budgets and traces.** The stages are capture 120 ms, locate 300 ms, read 1500 ms, intent 300 ms and act 800 ms (`STAGE_BUDGET_MS`). Each call writes a trace with per-stage and per-provider timings and no image bytes. Three are checked in under `docs/results/traces/`.
- **Typed entity, then typed Screen.** The pointed-at thing becomes `{kind, title, columns[], rows[≤500]}`, validated with Zod. The server turns it into a Screen: a JSON component tree defined in a shared package, with table and chart nodes bound to a form's stored rows. The model never writes raw HTML, and Claude writes only the title and summary, never the rows.
- **Models, one job each.**
  - Claude (Anthropic) builds and edits apps.
  - Inkling, through Thinking Machines Tinker, answers Chat.
  - Perceptron Mk1.5 detects and reads tables, charts and PDFs at commit time, and describes images for Chat.
  - TypeSafe Jev resolves "this" and "that" (about 0.1 s) and answers image yes/no plus box questions.
  - Gemini 3.8 Flash is the second vision and chat engine.
  - ElevenLabs Scribe gives realtime voice with a server-minted single-use token, and text-to-speech narrates the demo video.
- **Storage.** `POST /api/forms/:appId` stores a row; reads need a token. MongoDB when `MONGODB_URI` is set (OWNER), local files otherwise.
- **Stack.** Vite, React 19, Tailwind 4, zustand, Express, a Manifest V3 extension, a Swift notch app, tldraw for the canvas.

## Challenges

- **Timing and sync.** The hand moves before the sentence ends, so "this" must bind to where the pointer was when the word was spoken, not where it is when speech finishes. We resolve the target at the start of speech, and we built a timeline and a test harness (`scripts/e2e/sync/`) to measure binding accuracy. In our sync test on live Scribe, 33 of 33 deictic words bound to the correct target, with timing error p95 of 35 ms (measured harness run, `scratchpad/sync/report.md`; it is a scripted test, not a user study). (verify before submit)
- **Table versus cell.** Under the cursor is usually a cell. "Track this" means the table. We now return the enclosing table, row and cell and choose by what you said. The DOM provider alone went from 10/22 to 17/22 on web targets.
- **Latency budgets.** Perceptron detection takes 3 to 8 s on our images, which is far over a 300 ms label budget. So hover never calls it. The commit step does, with an 8 s cap (the old 4 s cap cut off most calls, and PDF hits went from 1/8 to 4/8 when we raised it).
- **Honest numbers.** Our first pointer eval scored 36.7% and our target was 90%. We kept the table and fixed what the data pointed at. We are still short (below).
- **Live demo risk.** Model calls take seconds. We record a full run and keep a replay mode (Ctrl+Shift+R). Replay covers generate, intent, ask, locate, extract and lift, and a small dot (tooltip "Replay on") shows while it is active; it is easy to miss on camera. (verify before submit: the dot and the full-path replay on the final build)

## Accomplishments

All figures are from a real-mode server (`MOCK_AI=0`, live keys) on 2026-10-18 unless noted.

- **Real-mode eval: 12/12 pass** (`scripts/eval/results/2026-10-18T08-04-46-248Z.json`). Generating a page takes 11 to 26 s, an element edit about 2 s, Jev routing about 0.13 to 0.16 s, and Chat 3.1 to 4.6 s.
- **Pointer top-1 on 30 labelled targets: hover 20/30 (66.7%), commit 24/30 (80.0%).** Mean IoU 0.65 and 0.75. Web targets 20/22 in both modes; PDF targets 0/8 in hover and 4/8 in commit. The 90% target is not met. Hover latency: p50 4 ms, p95 137 ms. Commit p95 is about 5.1 s on the PDF targets that wait for Perceptron.
- **Demo path, end to end: 16.3 s** (`docs/results/traces/demo-path-real.json`): locate 8.0 s, Perceptron read 1.4 s, lift 1.5 s, row submit instant, Chat about the chart 3.5 s (Inkling), "make this bigger" 1.8 s.
- **Sync: 33/33 deictic words bound correctly in our sync test on live Scribe, timing error p95 35 ms** (measured harness run, `scratchpad/sync/report.md`; scripted utterances, not a user study).
- **Known risk:** in commit mode, 6 of 30 answers are wrong without a "Which one?" prompt, mostly PDF boxes from Perceptron that nothing contradicts.
- **Tests at the last recorded run:** server 330 tests pass, TypeScript clean for shared, server and web; the extension e2e passed 23/23 earlier in the night. (verify before submit: rerun all gates on the final commit)
- The corpus is small: 30 targets, so one target is 3.3 points, and web targets were captured by the same lane that tuned the rules. Treat 20/22 as optimistic.

## What we learned

- Pointing is worth more when it ends in something you keep than in an answer you read once.
- Show what the system understood before it acts. People trust a visible "Table, 12 rows" label enough to try again.
- Put the cheap, exact source first (accessibility tree, DOM) and use pixels only when you must. It is faster and it was more accurate on our data.
- Measure each model alone before trusting a fusion rule. Jev was a poor locator on its own (1 to 4 of 30) but a very fast intent router, so it now routes and no longer leads.
- A strict shared schema let three people's work meet without glue code.

## What's next

- **A desktop app** so pointing works outside the browser without a sideloaded extension, with the notch tray built in.
- **Gemini Live** for streaming voice and screen understanding while you point.
- **Browser agents** that act on the page you pointed at, using the same locate pipeline.
- **Fine-tune on pointer data with Tinker**, using the traces and corrected "Which one?" choices, to close the PDF and single-cell gap.
- Hosted backend with accounts, and a "remix in Create" button on shared apps.

## Built with

Claude (Anthropic) · Inkling via Thinking Machines Tinker · Perceptron Mk1.5 · TypeSafe Jev · Gemini 3.8 Flash · ElevenLabs Scribe and TTS · MongoDB Atlas (OWNER: only if connected) · tldraw · React 19 · Vite · Tailwind CSS 4 · zustand · Zod · Express · Chrome extension (Manifest V3) · Swift (notch tray) · TypeScript · pnpm

AI tools used while building: Claude Code. (Disclose per DubHacks and MLH rules.)

## Track evidence

**DubHacks NEXT.** Pointing already exists as an idea: Google's pointer answers. Ours turns a read-only table, chart or PDF into an app you own, in one spoken sentence, with no prompt box and no setup. It is checkable: the real-mode demo path runs in 16.3 s from a schedule on screen to an app with a stored row (`docs/results/traces/demo-path-real.json`), and the headless smoke test lifts a schedule, renders the table and chart, submits a row and reads it back from the store. The pointer is one pipeline shared by the app, the extension, the notch tray and screen lift, and it says "Which one?" rather than act on a close call.

**Perceptron.** Perceptron Mk1.5 is the eyes at commit time. `/v1/detect` finds tables and charts in PDFs and screenshots, and schema OCR reads a chart crop into a typed entity (`apps/server/src/extract/`). On our 8 PDF targets it lifted top-1 from 0/8 (Jev alone) to 4/8: the schedule table (IoU 0.99), pricing table (0.99), invoice items (0.99) and revenue chart (0.87) hit, and single cells (one price, one bar, an invoice total) missed. Its chat model also describes images for Chat (wired in code; its speed and answer quality were not measured in the pointer eval; verify before submit before quoting a time). Limits: detection takes 3 to 8 s on our images and mostly timed out on web screenshots, so we use it for PDFs and charts at commit and not on hover. OWNER: confirm with the Perceptron table that a non-robot entry is eligible.

**SideShift.** Every portal, PDF and screenshot is read-only; people who need a small tracker end up in a spreadsheet. A lifted app arrives with a form, a store, a Backend tab and a QR code, so a person can have something shareable in about 16 seconds. The plan: Create is the free pointer, and a hosted backend at about $9 to 19 per month is the business, with a "remix in Create" button on every shared app. These prices are hypotheses. We have no users and no revenue. OWNER: check the SideShift brief and trim this paragraph to its wording.

**MongoDB Atlas (OWNER: include only if `MONGODB_URI` is set and a row shows up in Atlas).** Each row a person adds is a document: per-app form submissions are stored newest first, capped at 200 per app, and app ids are validated against `^[A-Za-z0-9_-]{1,40}$` before any query (`apps/server/src/forms/store.ts`). Lifted apps and share links use the same database (`apps/server/src/store/prototypes.ts`). Both stores have tests and fall back to local files when the variable is unset. As of the last status note, `MONGODB_URI` was not set, so nothing here has been run against Atlas. (verify before submit: a real submission in the Atlas collection, plus a screenshot)

## Team

Credit is from `git log` across all branches (41 human-authored commits: Sooraj 31, Abel 7, pentaswan 3; the repo also holds 6 automated scaffold commits, and pentaswan's three are on side branches, not on `integrate`).

- **Sooraj Sambasivam:** 26 of the 33 commits on `integrate`. The capture pipeline and `/api/locate`, fusion and traces, Jev intent routing, Perceptron, Gemini and Inkling wiring, lift and extract, the extension, the notch tray, the composer shell, Chat and Work, Backend and QR, replay mode, the eval harness and corpus.
- **Abel Anand:** 7 commits and the early website builder: the page engine (Screen schema, renderer, visual editor, text and voice modes), streaming generation as partial JSON, the icons proxy and the live-data element.
- **pentaswan:** the drawing canvas with typed page ops, a vision provider registry that routes a sketch to Perceptron or other models, and a sandboxed runner for AI-written backend functions, which shaped the Backend idea. Sooraj merged the canvas work into the app. pentaswan's sandbox commit is not on `integrate` (no sandbox runner in the tree), so do not claim it as shipped. A sketch route (`apps/server/src/sketch/`, `canvasOps/perceptron.ts`) does exist on `integrate`, but the 3 pentaswan commits are not there, so confirm who wrote it before crediting. (verify before submit with the team)

## Demo

The video follows the real-mode demo path: a schedule on screen, hold Option, "turn this into something I can track", the live app, a row added from a phone via QR, a Chat question about the chart, "make this bigger" with undo. Replay (Ctrl+Shift+R) is the fallback for any flaky model call and shows a small dot while on; say so aloud in the video.
