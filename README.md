# Create: pixels become software you own

Point at a table, chart, PDF or schedule, say "turn this into something I can track", and Create hands you a live app (editable table, chart, add-row form) with a real backend. DubHacks '26.

Google's pointer answers questions. Create hands you software you own, with a backend.

<!-- OWNER: product name decision (Create vs Lift) before submit; copy currently says Create. -->

**Status of the claims below.** Everything in this file was checked against the code on the `integrate` branch when written. Anything not run end to end is marked **verify before submit**. Measured numbers come from `docs/results/pointer.md` and `scripts/eval/results/`; nothing here is a vendor claim.

## See it in 30 seconds

<!-- OWNER: record a 30-second GIF of the demo path (hover a table, hold Option, say "track this", app opens, add a row, Backend tab updates) and save it as docs/screenshots/demo.gif. -->
<!-- OWNER: add screenshots to docs/screenshots/: lifted schedule app, QR card, Backend tab with a new row, pointer bubble, notch tray. -->

| Placeholder | File | Status |
| --- | --- | --- |
| 30-second demo GIF | `docs/screenshots/demo.gif` | OWNER: not recorded |
| Lifted app (table, chart, add-row form) | `docs/screenshots/lifted-app.png` | OWNER: not captured |
| QR card and Backend tab with a new row | `docs/screenshots/backend-tab.png` | OWNER: not captured |
| Notch tray | `docs/screenshots/notch-tray.png` | OWNER: not captured |

Existing screenshots: [docs/screenshots](docs/screenshots/README.md). Demo video script and shot list: `docs/pitch/`. Live demo walkthrough: `docs/demo-script.md`.

## What it does

- **Point and lift.** Hover a table, list, pricing cards or a chart, hold Option, say what you want. Create reads the data into a typed entity and `POST /api/lift` turns it into an app: editable table, bar or line chart, "Add row" form.
- **A real backend.** Rows go to `/api/forms/:appId`, stored in MongoDB when `MONGODB_URI` is set and in local files otherwise. The app's **Backend** tab polls every 3 seconds.
- **QR to a phone.** Scan, add a row from the phone, watch it land on the laptop.
- **Four ways to point.** Inside the app (hover, pin, hold Option), the Chrome extension (point, circle, crawl), the macOS notch tray (hold Option anywhere on screen), and **Lift from screen** (box a region of any window).
- **Chat and Work.** Chat answers questions about what you point at ("why does week 3 spike?"). Work builds and edits the app. Edits are queued and undoable.
- **Voice.** ElevenLabs Scribe realtime transcription, with browser speech as fallback.
- **Replay mode.** Ctrl+Shift+R answers model calls from a recorded run if a live step fails.

## Sponsor products wired

Detail and per-track evidence: `docs/sponsors.md`, `docs/devpost.md`.

| Product | What it does here |
| --- | --- |
| Claude (Anthropic) | Builds and edits apps; last-resort vision for locate and extract |
| Inkling via Thinking Machines Tinker | Default model for Chat when `TINKER_API_KEY` is set; Claude is the fallback |
| Perceptron Mk1.5 | At commit time, detects and reads tables, charts and PDFs (`/v1/detect` boxes, OCR); describes images for Chat |
| TypeSafe Jev | Resolves "this" and "that" (about 0.1 s) and answers image yes/no with a box |
| Gemini 3.8 Flash | Second vision and chat engine, used in commit mode when keyed |
| ElevenLabs | Scribe realtime voice and TTS (video narration) |
| MongoDB Atlas | Backend rows and share links, only when `MONGODB_URI` is set. OWNER: not set at the time of writing |

Tracks: DubHacks NEXT, Perceptron, SideShift, and MongoDB Atlas (only if the URI is set).

## Quickstart

Requirements: Node 22+, pnpm 9+, Chrome (extension), macOS 14+ with Xcode (notch tray only).

```bash
pnpm i
pnpm onboard      # checks Node, pnpm, ports and which keys are present
pnpm dev          # API on :3001 + web on :5173 (Vite takes the next free port if busy)
```

Open http://localhost:5173. `pnpm onboard --doctor` re-checks setup. `http://localhost:3001/api/health` shows which keys the server sees.

### Keys (names only, in `apps/server/.env`)

`ANTHROPIC_API_KEY`, `TINKER_API_KEY` (Inkling), `PERCEPTRON_API_KEY`, `TYPESAFE_API_KEY` (Jev), `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `MONGODB_URI` (optional), `MOCK_AI` (`1` = no model calls, canned pages), `PUBLIC_URL` (phone sharing), `PORT`. Tuning: `CLAUDE_MODEL`, `CLAUDE_BUILD_EFFORT`, `CLAUDE_EDIT_EFFORT`, `INKLING_MODEL`, `GEMINI_MODEL`, `PERCEPTRON_MODEL`. The server reads `.env` at startup, so restart after changing it. Never commit `.env`. Every key is optional: a missing key falls back to the next provider or a mock.

### Chrome extension

1. `chrome://extensions`, turn on Developer mode, **Load unpacked**, choose `apps/extension`.
2. Open the extension options and set the web origin to the port Vite printed.
3. Open a fixture from `apps/extension/demo/` (`route-44-schedule.html`, `dubhacks-schedule.html`, `dining-hours.html`, `pricing.html`, `chart.html`). For `file://` pages enable "Allow access to file URLs", or serve it: `python3 -m http.server -d apps/extension/demo 8080`.
4. Hold Option over the table, release, press Enter. A new tab opens with your app.

More in `apps/extension/README.md`. A hands-on run in a real Chrome profile has not been done: **verify before submit**.

### macOS notch tray

```bash
cd apps/notch
swift build -c release
./scripts/make-app.sh      # produces apps/notch/.build/Create Tray.app (ad-hoc signed)
```

Open `Create Tray.app` from Finder, not from Terminal or Xcode, or the permission grants attach to the host app. Grant **Screen Recording** and **Accessibility** (System Settings, Privacy & Security), then quit and reopen the app. The tray itself needs no permission; the Option-hold capture does. Hold Option for 400 ms over any app: the tray reads the element under the cursor, locates it, extracts and lifts it, and adds a card to the notch. Do not rebuild after granting, since a new binary can drop the grants. Details: `apps/notch/README.md`. Its last documented state is built but not launched: **verify before submit** on the demo Mac.

### Lift from screen

In the web app's composer choose **Lift from screen**, pick a screen or window to share, drag a box around a table or chart, and the crop is read through `POST /api/extract`. It uses the browser's screen-share prompt and works on PDFs and apps with no DOM. Chart values read from pixels are approximate; use a real table when exact numbers matter. Not re-run end to end for this README: **verify before submit**.

### Phone and QR

```bash
pnpm share:tunnel                                              # prints a trycloudflare.com URL (needs cloudflared)
PUBLIC_URL=https://<name>.trycloudflare.com pnpm --filter @create/server dev
```

Set `PUBLIC_URL` before lifting, or the app link points at localhost. Test on the venue wifi first (`docs/DEPLOY.md`). A QR scan from a physical phone has not been exercised: **verify before submit**.

## Architecture

```
 Sources of "this"                      One pipeline                      Output
 -----------------                      ------------                      ------
 Web app (hover/pin/Option) --+
 Chrome extension (DOM+crop) -+--> POST /api/locate ---+
 Notch tray (AX + screen) ----+     mode: hover|commit |   hover : DOM + AX + Jev          (<300 ms budget)
 Lift from screen (crop) -----+                        |   commit: + Perceptron /v1/detect  (8 s cap)
                                                       |           + Gemini + Claude last resort
                                                       v
                                             fuse(): rank boxes, "Which one?" if close
                                                       |
                         +-----------------------------+--------------------------+
                         v                             v                          v
                 POST /api/extract             POST /api/route-intent       POST /api/ask
                 pixels -> typed entity        Jev -> Haiku -> keywords     Inkling (default)
                 Perceptron / Gemini / Claude  "this" -> pointed element    -> Claude fallback
                         |                                                  + Perceptron image description
                         v
                 POST /api/lift  --> live app (table + chart + add-row form)
                                          |
                                          v
                              /api/forms/:appId  --> MongoDB Atlas | local files
                                          |
                                          v
                              Backend tab (3 s poll) + QR on a phone

 /api/tray <--> notch app (cards, drag out, open in Create)
 Every locate call records a stage-by-stage trace: GET /api/traces
```

Shared contract: `packages/shared/src/schema.ts` (Zod). A `Screen` is a tree of nodes (text, data, actions, media, forms, layout). Claude returns the tree through a `render_screen` tool call; the server sanitizes, validates and sends any errors back for one repair. To add an element type: add it to the schema, a renderer case in `apps/web/src/components/elements.tsx`, and inspector fields in `apps/web/src/editor/Inspector.tsx`.

```
packages/shared   Zod schemas, tree helpers, sanitizer, timeline
apps/server       Express API (pipeline/, extract/, lift/, ask/, forms/, tray/, routes/)
apps/web          Vite + React app (shell, composer, narrate, onboarding, settings, sync)
apps/extension    Chrome MV3 extension (Lift)
apps/notch        macOS Swift menu-bar agent (Create Tray)
scripts           onboard, tunnel, e2e/, eval/, video/
eval/pointer      Pointer eval corpus and runner
```

## API

All routes are under `/api`. Errors are `{ error: string }` with 400, 404, 422, 429, 502 or 503.

| Route | Purpose |
| --- | --- |
| `POST /locate` `{ input, utterance?, mode? }` | Find the pointed-at thing: box, kind, label, source, confidence, or an `ask` ("Which one?"). `mode` is `hover` or `commit`; omitted keeps the legacy chain |
| `GET /traces` | Recent locate traces (stage, provider, ms, ok) |
| `POST /extract` `{ image, hint? }` | Chart, table or image crop to a typed entity |
| `POST /lift` `{ entity, instruction? }` | Typed entity to a live app `{ id, url, formId, provider }` |
| `POST /forms/:appId`, `POST /forms/:appId/token`, `GET /forms/:appId` | Store a row; mint an owner token; list rows (Bearer) |
| `POST /ask` | Chat answer, optionally about a pointed-at crop. Inkling by default, Claude fallback |
| `POST /route-intent` `{ text, candidates, pointer? }` | Route a spoken line to an action and target (Jev, Haiku, keywords) |
| `POST /generate`, `POST /edit-node` | Build or refine a page (streams partial frames); rewrite one element |
| `POST /canvas-ops`, `POST /generate-sketch`, `POST /demo` | Sketch to edits or page; Narrate session to a clickable demo |
| `GET/POST /tray`, `GET /tray/:id/thumbnail`, `GET /tray/:id/snippet`, `POST /tray/:id/open`, `DELETE /tray/:id` | Notch tray items |
| `POST /import-element` | Extension snapshot to a Create prototype |
| `POST /prototypes`, `GET /prototypes/:id` | Save and load share links |
| `GET /voice-token`, `POST /transcribe` | Single-use ElevenLabs realtime token; batch speech to text |
| `POST /upload`, `GET /image`, `GET /image/resolve`, `GET /icons/search`, `GET /icons/svg` | Uploads, stock photos, icons |
| `GET /live`, `GET /live/:id` | Allow-listed live data |
| `POST /auth/signup`, `/auth/login`, `/auth/guest`, `/auth/logout`; `GET /auth/me`, `GET /usage` | Accounts and quota (see `docs/AUTH.md`) |
| `GET /health`, `GET /models` | Which keys are present and mock state; selectable models |

## Evaluation

```bash
pnpm eval:pointer                        # 30 labelled targets against a running server (eval/pointer/run.mjs)
EVAL_MODE=commit pnpm eval:pointer       # EVAL_MODE=hover|commit
node scripts/eval/run.mjs                # 12 golden prompts: generate, edit-node, route-intent, ask
BASE_URL=http://localhost:3002 node scripts/eval/run.mjs   # a real-mode server
node scripts/eval/run.mjs --only edit,chat --strict
node --env-file=apps/server/.env scripts/e2e/sync/run.mjs  # voice/pointer sync harness
node scripts/e2e/smoke.mjs               # headless smoke (lift, chart, add-row)
node scripts/e2e/extension.mjs           # extension e2e
pnpm typecheck && pnpm test              # tsc and vitest across workspaces
```

Start the server with `MOCK_AI=0` for real-model numbers; with `MOCK_AI=1` model providers are not called. The sync harness drives Chromium with a fake mic and a scripted pointer path to check that each spoken "this" binds to where the pointer was at that word. It has no `package.json` script, and no result from it is reported here: **verify before submit**.

## Results

Sources: `docs/results/pointer.md` (pointer), `scripts/eval/results/` (prompt eval), `docs/results/traces/` (per-call traces for the demo path, including the fallback recording). Reported as measured; the pointer target is not met.

**Pointer, 30 labelled targets, real server, real keys** (hit = IoU >= 0.5 and the box contains the cursor):

| Mode | Fused top-1 | Mean IoU | Latency (fused) |
| --- | --- | --- | --- |
| Hover (DOM, AX, Jev) | 66.7% (20/30) | 0.65 | p50 4 ms, p95 137 ms |
| Commit (adds Perceptron, Gemini, Claude) | 80.0% (24/30) | 0.75 | p50 2 ms, p95 5.1 s |

- The 90% target is **not met**. Web targets are 20/22 in both modes; PDF targets went from 0/8 to 4/8 in commit mode.
- Perceptron on PDFs (commit, 8 s cap): tables and charts hit (IoU 0.87 to 0.99); single cells, prices and one bar miss. Calls take 3.5 to 5.9 s, so Perceptron belongs at commit, not hover. On web screenshots it mostly timed out at this image size.
- In commit mode 6 of 30 answers are confidently wrong with no "Which one?" prompt (PDF boxes from Perceptron that miss). Not yet tuned.
- Per-provider hit rates, cost estimates and open defects: `docs/results/pointer.md`.

**Prompt eval, real mode** (`scripts/eval/results/2026-10-18T08-04-46-248Z.json`): 12 of 12 pass. Generation 11 to 26 s, edit-node about 2 s, route-intent 0.13 to 0.16 s (Jev), ask 3.1 to 4.6 s on Claude. Inkling answered in about 0.7 to 0.85 s in a separate live check recorded in the overnight notes (not part of the 12-case run). Chat answer quality on Inkling and Perceptron has not been measured: **verify before submit**.

**Gates reported by the pointer lane:** tsc clean for shared, server and web; server vitest 330 tests pass; extension e2e 23/23. Re-run before submitting; the working tree has uncommitted changes from other lanes.

## Privacy: what leaves your machine

- **Sent to our API only:** the page text or structured entity you pointed at, screenshot crops (the region you boxed, or the capture around the cursor), and your typed or spoken instruction. The server forwards what each request needs to the providers in the table above.
- **Nothing is sent until you act.** The extension and the tray capture only when you hold Option and commit. The server never fetches the page you lifted from.
- **Keys stay server-side.** No provider key is shipped to the browser, the extension or the tray. The one by-design exception is the ElevenLabs realtime token, which is single-use and minted by `GET /api/voice-token`.
- **Stored:** lifted apps, rows you add and share links, in MongoDB Atlas if `MONGODB_URI` is set, otherwise local files under `apps/server/.data/`. Locate traces (`.traces`, gitignored) record sizes, timings and results; `pipeline/trace.ts` has no image field and the sample traces in `docs/results/traces/` show `hasImage` and `imageBytes` only.
- Do not point at pages with secrets or personal data while demoing: crops go to third-party models.

## Known issues

- Pointer accuracy is 80% in commit mode against a 90% target (see Results).
- The notch tray and the extension have not been run by hand on the demo Mac and Chrome profile.
- Values read from a chart image are approximate.
- Lift links use `PUBLIC_URL`, then the request Origin, then `http://localhost:5173`.
- The Vercel route (`vercel.json`, `api/index.ts`) is untested; see `docs/DEPLOY.md`.

## Team

Sooraj Sambasivam, Abel Anand, pentaswan. By `git log` author: Sooraj Sambasivam 26 commits and Abel Anand 7 on the integrate branch; pentaswan has 3 commits on another branch. Commit counts understate real work (pair work, merged branches), so confirm roles with the team before submit.

## License

<!-- OWNER: choose a license (no LICENSE file exists) and add it before the repo is made public. The repo is currently private. -->
License: not yet chosen (OWNER).

## More docs

`docs/devpost.md` (submission text), `docs/sponsors.md` (per-sponsor one-pager), `docs/judging-qa.md` (likely judge questions), `docs/MORNING.md` (submission checklist), `docs/DEPLOY.md`, `docs/AUTH.md`, `docs/ONBOARDING.md`, `docs/research/` (judging playbook, competitors, usability), `DESIGN.md`.
