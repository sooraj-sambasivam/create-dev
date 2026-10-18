# Sponsor sheets: Create (DubHacks '26)

One page per sponsor. Print one-sided, one sheet per table. Every number comes from `docs/results/pointer.md`, `scripts/eval/results/2026-10-18T08-04-46-248Z.json` (real-mode run, 12/12 pass) or `docs/results/traces/demo-path-real.json`. Anything not measured says so. Items marked **verify before submit** are not confirmed in this repo today.

**Product:** Create. Point at a table, chart, list or PDF, say "turn this into something I can track", get a live app with a table, chart, add-row form and a backend, shareable by QR.
**Team:** Sooraj Sambasivam (integration, product, pointer, Lift, Chat, extension, notch tray), Abel Anand (page engine: schema, renderer, visual editor, streaming generation, icons proxy, live-data element), pentaswan (drawing canvas, sketch vision route prototype, sandboxed backend-functions prototype; his 3 commits are on side branches, not `integrate`, and the sandbox runner is not in the shipped tree: verify before submit).
**Honesty line for every table:** fused pointer accuracy is 80.0% (24/30) in commit mode and 66.7% (20/30) in hover mode on our 30-target corpus. Our 90% target is not met. No users, no revenue yet.

Pipeline in one line: `hover (DOM + accessibility tree + Jev, under 300 ms)` -> `commit on Enter/Option release (adds Perceptron detect, Gemini, Claude fallback, fused by confidence, "Which one?" when unsure)` -> `/api/extract` (typed table/chart entity) -> `/api/lift` (live app) -> `Chat` (Inkling) and `edit` (Claude + Jev routing).

---

## 1. Perceptron (Mk1.5) : track: Perceptron

**What we use.** `perceptron-mk1.5` through `/v1/detect` (boxes and points) and chat completions (visual descriptions, OCR into a JSON schema).

**Where in the pipeline.**
- Commit-stage locate (`/api/locate`, `mode: "commit"`): finds the table, chart or cell in a screenshot when there is no DOM or accessibility tree (PDFs, images). 8 s cap. Hover mode deliberately skips it to hold the 300 ms label budget.
- `/api/extract`: reads a cropped chart or table image into `{kind, title, columns, rows}` with a JSON schema. First provider, then Claude vision, then a mock.
- `/api/ask`: when you point at an image and ask a question, a Perceptron description of the image is added to the system prompt.
- Canvas sketches: reads a sketch before edit ops are written.

**Measured (real server, real keys, 30-target corpus; `docs/results/pointer.md`).**
- On the 8 PDF targets in commit mode, Perceptron alone hits **4/8**; fused PDF accuracy went from 0/8 to 4/8 once Perceptron got an 8 s window instead of 4 s.
- Hits are tables and charts: schedule table IoU 0.99, pricing table 0.99, invoice items 0.99, revenue chart 0.87. Misses are single cells (a price, a total, one bar).
- Detect takes 3.5 to 5.9 s on PDFs. On web screenshots 16 of 30 calls hit the 8 s cap, so it is not our web locator.
- Demo path (`demo-path-real.json`): extract through Perceptron took 1.4 s and returned a typed entity with 8 columns.
- Chat completions answer in about 0.7 s (spot check from overnight notes, not in the eval; verify before submit).
- Placeholder cost in the eval harness: $0.002 per detect call. Not a vendor invoice; do not quote.

**Not measured / limits.** Perceptron chat answer quality; extract accuracy on charts (values from images are approximate and we say so). Perceptron alone is 6/30 overall.

**2-sentence pitch for Perceptron judges.** Perceptron is the part of Create that sees pixels where the web page gives us nothing: it boxes the table in a PDF at IoU up to 0.99 and reads a chart crop into typed rows, which is what lets "turn this into something I can track" work on a document that was read-only. We measured it honestly, 4 of 8 PDF targets hit and 16 of 30 web calls timed out, and we use it where it earns its place, at commit time rather than on hover.

**20-second demo beat.** (0-5 s) Open a PDF with a schedule table. Hold Option and hover: the label bubble is slow or generic (no DOM). (5-12 s) Press Enter to commit; a box snaps onto the whole table. (12-20 s) The lifted app opens with those rows; show the `perceptron` provider in the extract response or trace (`/api/extract` reports `provider`). Verify before submit that the on-screen label text exists in the UI. Say once: "tables and charts hit; a single cell can miss, and then it asks Which one?"

**Ask them (Saturday):** is a non-robot vision entry eligible for the track? (`docs/research/judging-playbook.md` flags the track text as thin.) Verify before submit.

---

## 2. TypeSafe (Jev) : sponsor tech, no track claimed

**What we use.** Jev 1.14 for two small judgments: resolving "this/that/here" to the element the pointer was on, and the first pixel-level yes/no plus box.

**Where in the pipeline.**
- `/api/route-intent`: spoken line plus pointer-aware candidates -> `{action, targetId}`. Deictic words let the pointed element win; otherwise the words choose. Fallback chain: Jev -> Claude Haiku -> keywords.
- `/api/locate` hover path: runs with DOM and accessibility tree inside the 300 ms label budget.
- `/api/extract`: an image yes/no step.

**Measured.**
- Real-mode eval: intent "resize the hero title" -> `{engine: jev, action: resize, targetId: hero-title}` in **131 ms**; non-command chatter -> `action: none` in 158 ms (`scripts/eval/results/2026-10-18T08-04-46-248Z.json`).
- Pointer eval: Jev p50 111 to 117 ms, p95 171 to 176 ms per call. Placeholder cost $0.001 per call.
- As a pixel locator on its own Jev is weak: 1 to 2 of 30 hits, 0/8 on PDFs, with boxes on a coarse grid. We give it prior 0.45 and a "Which one? Best guess" prompt when it is the only answer. We do not claim otherwise.

**2-sentence pitch for TypeSafe judges.** "This" and "that" are exactly the small common-sense judgments a typed primitive is good at: Jev turns a half-spoken command and a pointer position into a typed `{action, target}` in about 0.13 s, fast enough that the edit starts while you are still talking. We kept it on the one job it is reliable at and measured that it is not a pixel locator, rather than stretching it.

**20-second demo beat.** (0-5 s) In the lifted app, point at the page title and hold Option. (5-10 s) Say "make this bigger." The bubble shows the target ("Heading") within a fraction of a second; the route-intent response reports `engine: jev` (verify before submit whether the engine is also visible on screen). (10-15 s) The heading grows; press undo. (15-20 s) Say "what a nice day" and show nothing happens (`action: none`): chatter is not a command.

**Ask them:** whether TypeSafe has a track or prize (none found in prework). Do not claim one unless confirmed.

---

## 3. Inkling via Thinking Machines (Tinker) : default Chat model

**What we use.** Inkling, served through Tinker's OpenAI-compatible endpoint, answers Chat by default when `TINKER_API_KEY` is set. Claude is the fallback if Inkling returns nothing. The answer shows which model replied.

**Where in the pipeline.** `/api/ask`: question + the app's data + (if you pointed) a crop and its Perceptron description -> answer. Also selectable in the composer's model picker next to Sonnet, Haiku and Gemini.

**Measured.**
- Overnight real-mode checks: Inkling about 0.7 to 0.85 s per answer versus 3 to 4.5 s on Claude for the same question (`scripts/eval/results/...08-04-46-248Z.json`: Claude ask 3.1 s and 4.6 s).
- Demo path (`demo-path-real.json`): "chat about the chart" answered by `inkling` in 3.5 s end to end, 270 characters. The gap to 0.7 s is the image/description step in front of it.
- Answer quality of Inkling is **not measured**; there is no graded comparison with Claude. Say that.

**2-sentence pitch for Thinking Machines judges.** Chat in Create is a question you ask about the thing under your pointer, and it needs to feel like conversation, so Inkling is the default and answers in under a second on text. Claude stays behind it as the fallback, and the UI says which model answered so the claim is checkable.

**20-second demo beat.** (0-6 s) In the lifted app switch to Chat, point at the chart. (6-12 s) Ask "why does week 3 spike?" (12-20 s) The answer appears with the provider shown (responses report `provider: inkling`; verify before submit the on-screen "Inkling" label); open the model picker and show Inkling selected by default, Claude one click away.

---

## 4. Google Gemini (3.8 Flash)

**What we use.** `gemini-3.8-flash` as a second vision engine and a selectable Chat model.

**Where in the pipeline.** Commit-stage `/api/locate` (bounding boxes, 0-1000 normalized), an extract provider, and the Chat model picker. Not used on hover.

**Measured.**
- Live check overnight: responds in about 2.3 s.
- In the pointer eval it timed out on 29 to 30 of 30 locate calls at our 3.5 s provider cap, so it contributed **1/30** hits. The cap, not the model, is the likely cause; we did not re-run with a longer cap. Treat Gemini as wired and live, but not yet a measured contributor to accuracy.
- Placeholder cost: $0.0015 per call (harness number, not an invoice).

**2-sentence pitch for Google judges.** Google's pointer vision showed a pointer that supplies "this"; Create keeps that idea and ends in software you own, with Gemini as a second set of eyes on the screen crop next to Perceptron and Claude. We built it as one engine among several behind a confidence-fused pipeline, so a slow or wrong model shows up as "Which one?" instead of a silent wrong answer.

**20-second demo beat.** (0-5 s) Open the model picker and choose Gemini. (5-15 s) Point at the chart, ask "what is the biggest value?" (15-20 s) The answer comes back from Gemini (the response reports the provider; verify before submit the on-screen label). Do not claim Gemini boxes help our locate accuracy; show it as the chat/vision choice.

---

## 5. ElevenLabs : voice

**What we use.** Scribe realtime speech-to-text. The server mints a single-use token (`GET /api/voice-token`), the browser streams mic audio to ElevenLabs directly, and the transcript fills the composer or the Narrate command. Browser speech recognition is the fallback.

**Text to speech.** Verified live overnight with ElevenLabs default voices only (George, Sarah, Brian; library voices return 402 on the free plan). In the code, TTS is **not** wired into the app: "read aloud" uses the browser's `speechSynthesis`. ElevenLabs TTS is used for the demo-video narration. **Verify before submit** that the video, not the app, is where we say TTS appears.

**Measured.** Token mint works against the real key. We have **no latency or word-error numbers** for Scribe. The cursor-to-voice sync harness (`scripts/e2e/sync/`, target at least 95% binding and p95 timing error at most 150 ms) was specified overnight; check `docs/results/` for numbers before quoting any. Verify before submit.

**2-sentence pitch for ElevenLabs judges.** Pointing needs the words and the hand to land on the same instant, so Create uses Scribe realtime's streaming transcript to bind "this" to where the pointer was when you said it. The key stays on the server, the browser gets a single-use token, and the narration in our demo video is ElevenLabs voice.

**20-second demo beat.** (0-5 s) Hold Option over the page title. (5-12 s) Say "make this bigger and blue" while the live transcript appears word by word. (12-20 s) The bubble shows the heard words, then Editing, then Done. Mention that the same Scribe stream drives the extension and Chat.

---

## 6. SideShift : Best Startup Idea

**What we use.** Not a product integration: the track is judged on the idea. Our pitch lives in `docs/devpost.md`.

**The idea.** Every portal, PDF and screenshot is read-only. Create is the free pointer; the business is a hosted backend for the apps people lift ($9 to $19 a month is our proposal, untested), with a "remix in Create" button on every shared app.

**Evidence available now.**
- A real end-to-end loop: point -> typed entity -> live app -> QR -> a phone submits a row -> the Backend tab shows it. Demo path on the real server: **16.3 s** end to end, all steps green (`demo-path-real.json`: locate 8.0 s, extract 1.4 s, lift 1.5 s, chat 3.5 s, edit 1.8 s).
- Quotas already exist per guest per day (10 builds, 20 lifts, 40 chats; accounts get 3x) in `apps/server/src/quota/limits.ts`, which is the shape a paid tier would sit on.
- Placeholder unit cost under one cent per lift (harness prices, not invoices). Verify before submit.

**Not true yet.** No users, no revenue, no pricing test, no hosted-backend account system beyond demo accounts. Say so in the first sentence of Q&A.

**2-sentence pitch for SideShift judges.** People already have the data they want to act on, a bus schedule, a roster, a price list, but it is locked in a page they cannot edit; Create turns it into a shared, writable app in one spoken sentence. The free pointer is distribution, the hosted backend is the business, and the "remix in Create" button on every shared app is the loop; we have no users yet and this is what we would test first.

**20-second demo beat.** (0-6 s) Lift a schedule: the app opens with table, chart and form. (6-12 s) Show the QR; a judge scans and adds a row. (12-18 s) The Backend tab flashes the new row (3 s poll). (18-20 s) Say: "free pointer, hosted backend, remix button; no users yet."

---

## 7. MongoDB Atlas (MLH) : OWNER decision

**Status today.** Wired in code, **not live**: `MONGODB_URI` is not set on the dev machine (per `docs/MORNING.md`). Without it, forms and share links use local JSON files. **Do not claim this track unless `MONGODB_URI` is set and a real row appears in the Atlas collection.** (OWNER)

**What we use.** Per-app form submissions (`apps/server/src/forms/store.ts`: newest first, capped at 200 per app, app ids validated against `^[A-Za-z0-9_-]{1,40}$`), lifted apps and share links (`apps/server/src/store/prototypes.ts`), accounts and quota counters (shared client in `apps/server/src/store/mongo.ts`). Each page is a JSON component tree, a natural fit for documents.

**Measured.** Nothing against a real Atlas cluster. Tests cover the Mongo and file stores. Verify before submit.

**If MONGODB_URI gets set (checklist).** Submit a row from the phone, screenshot the Atlas collection with the row, add the screenshot and collection name to `docs/devpost.md`, confirm the Backend tab still shows it.

**2-sentence pitch for MongoDB judges (use only if live).** Every page Create generates is a JSON tree, and every row a person adds is a document, so Atlas is the backend a lifted app is born with: scan the QR, add a row, and it is in the collection. App ids are validated before any query, reads need a per-app token, and each app is capped at 200 stored rows.

**20-second demo beat (only if live).** (0-8 s) Phone adds a row. (8-14 s) Backend tab shows it. (14-20 s) Switch to Atlas, refresh the collection, the same document is there.

---

## 8. Anthropic (Claude) : builds the apps

**What we use.** Sonnet 5.5 for app generation and edits, Haiku 5.5 for the one-line title/summary polish in Lift and as the second intent fallback, Claude vision as the last locate fallback.

**Measured (real mode, 12/12 pass).** Generate 11 to 26 s per app (streamed in partials), edit-node about 2 s, Chat on Claude 3.1 and 4.6 s. Lift itself is deterministic: rows never go through a model, only the title and summary line (1.5 s on the demo path). Claude vision as a locate fallback: 7/30 in commit mode, 4/8 on PDFs.

**2-sentence pitch.** Claude writes the app and edits it by pointing; the page is a validated JSON component tree, not raw model HTML, so every AI edit is undoable and safe to render. Lift keeps the data path out of the model on purpose, so the numbers in your table are the numbers on the page.

**20-second demo beat.** Type "a bakery order tracker" in the composer, watch the page stream in progressively, then point at a button and say "make this green" and show the 2 s edit and undo.
