# Morning report — Create (DubHacks '26)

## ✅ Ready to submit (09:25)
- **Final video:** `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/video-v2/create-demo-final.mp4` (2:00, George narration, problem-first). Upload to YouTube/Vimeo (unlisted) and paste the link in Devpost.
- **Fallback video:** `.../scratchpad/video-alt/create-demo-george-clean.mp4` (1:20).
- **Devpost text:** `docs/devpost.md` (problem-first; tagline "Point at it. Say it. Own it."). Sponsor pages: `docs/sponsors.md`. Judge Q&A: `docs/judging-qa.md`.
- **Code:** `integrate` 4d3252c; clean `main` published (1e957e5): 0 attribution trailers, tree identical, authors kept. All gates green at freeze: shared 42, server 361, web 724 tests, build, smoke 20/20.
- **Live demo:** use http://localhost:5176 (real AI). 5175 is the mock used by tests.
- **Tracks:** DubHacks NEXT, Perceptron, SideShift; MongoDB only if you add MONGODB_URI (otherwise remove that paragraph).
- **Repo visibility:** still private — your call.

## ⏱ Hard timeline (set 08:40; Devpost due 10:00)
- **Now → 09:15** — final wave runs in parallel: sync wired into Narrate/extension/notch, demo fixes (chart recolor, full-table lift, titles, edit repair), crafted minimal UI pass with 3 variants, video drivers + ElevenLabs George voice.
- **09:15 freeze** — commit everything green; stop unfinished lanes.
- **09:15–09:35** — final video render; all gates; publish clean `main` (attribution trailers stripped, authors kept — dry run verified: 0 trailers, identical tree).
- **09:40** — you get: final MP4, Devpost text (`docs/devpost.md`), sponsor pages, checklist. You submit by 10:00.
- **Fallback video (now):** `/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/video/create-demo-draft.mp4` (80 s, placeholder voice).


_Updated overnight. Submit to Devpost by 10:00._

## Done so far (as of 01:20)
- **Product**: two looks (Paper / Luminous-magenta) chosen in onboarding and Settings; composer with real controls (Chat|Work, model + effort incl. Inkling, Approve for me, attach, Files, Plugins, Lift from screen); radial Go fan; thread with run line, result cards, action row, context card; one composed frame with a floating context panel.
- **Pointing**: in-app pointer (hover, pin, hold Option), Chrome extension (point, circle, crawl), notch tray app, Lift from screen — one `/api/locate` pipeline with "Which one?" instead of guessing; per-stage traces.
- **Lift**: point at a table/chart/list → live app (table + chart + add-row form), live rows, QR, Backend tab.
- **Sponsor models live**: Claude (Anthropic), Inkling (Thinking Machines via Tinker, ~0.7 s), Perceptron Mk1.5 (detect IoU ~0.88–0.98, 3–4 s; chat ~0.7 s), TypeSafe Jev (~0.1 s).
- **Proof**: real-mode eval 12/12; pointer corpus (30 real targets) — web 20/22 top-1 after the accuracy pass; PDFs pending Perceptron in the commit stage (running now).

## Update 01:55
- **Look:** back to the minimal look (Paper/Luminous removed at your request).
- **Keys live:** Claude, Inkling (default Chat), Perceptron (commit stage), Jev, Gemini, ElevenLabs (realtime Scribe + TTS with default voices George/Sarah/Brian — free plan blocks library voices). Missing: MongoDB.
- **Pointer accuracy (30 real targets):** hover 20/30 (p50 4 ms), commit 24/30 (Perceptron lifts PDFs 0/8 → 4/8; p95 ~5 s). Real demo path: all steps green, 16.3 s end to end.
- **Committed:** 6cabf7b.

## Update 02:45
- **Committed 49f95e7** (all gates green: shared 42, server 358, web 694 tests, build, smoke 20/20).
- **Accounts + demo limits:** guest one-click + email/password; daily limits per user/IP (guest 10 builds / 20 lifts / 40 chat; admin bypass via DEMO_ADMIN_EMAILS). Mongo store untested until MONGODB_URI is set.
- **Composer:** Go button was unclickable (fan hover bridge sat on top) — fixed; Files, Plugins, Lift from screen, Speak/Sketch/Narrate all verified by a new e2e (19/19).
- **Tabs:** Backend only when the app has a backend; Inspect only when a page exists. Provider tags on Chat answers.
- **Sync (cursor ⇄ voice ⇄ screen):** live ElevenLabs Scribe binds 100% of "this/that/here" to the right target, timing error p95 35 ms (target ≤ 150 ms). Browser speech fallback 90.9%. Integration into Narrate/extension/notch running now (H2).
- **Demo quality:** 15 real scenarios × 4 rounds; locked demo set: sales lift (~3 s), Inkling chat (~1.2 s), "make this bigger" (~1.9 s), "delete this" (~1 s), study sign-up build (~5.5 s). Avoid on stage until fixed: "make this blue" on charts, timetable lift (one row), PDF lifts (5–7 s).
- **Submission kit:** devpost.md, README, sponsors.md, judging-qa.md (fact-checked).

## In progress
- Stage G (your 01:35 list): accounts + demo limits, composer controls end to end, conditional Backend/Inspect tabs, better Pip, canvas QA, agent cursor stress (20+ runs), press-drag lasso → tray with snippet + code, horizontal notch tray.
- Next: demo video draft (screen capture + voiceover), submission kit, clean main.

## Needs you (morning)
1. Optional: MongoDB (`MONGODB_URI`) for the Atlas prize and persistent accounts.
2. Pick the voiceover voice (default George; samples were sent).
3. Re-enable **Screen Recording** + **Accessibility** for "Create Tray" (System Settings → Privacy & Security) after the overnight rebuild.
4. Decide: make the repo public.
5. Record/polish the demo video with me, then submit on Devpost.

## Submission checklist
Docs: `docs/sponsors.md` (one sheet per sponsor, printable), `docs/judging-qa.md` (15 judge questions). Both mark unverified claims "verify before submit"; search for that phrase and clear or delete each.

- [ ] Product name: Create or Lift (OWNER). Update `docs/devpost.md` and `README.md`.
- [ ] MongoDB: set `MONGODB_URI`, submit a row from a phone, screenshot the Atlas collection, add it to Devpost. If not set, remove the MongoDB Atlas track and the sponsor claim (`docs/sponsors.md` section 7).
- [ ] Tracks on Devpost: DubHacks NEXT, Perceptron, SideShift (max 3 sponsored side tracks, 1 title track); MongoDB Atlas only if the previous item is done.
- [ ] Ask the Perceptron table if a non-robot entry is eligible; ask TypeSafe whether they have a track. Get answers in writing.
- [ ] Video: paste the 2-minute link into `docs/devpost.md`; open the Devpost View page and confirm it plays. No video means not judged.
- [ ] Repo public? (OWNER decision; not done automatically.) Confirm Devpost repo link works logged out.
- [ ] Team on Devpost: Sooraj Sambasivam, Abel Anand, pentaswan; all three invited and confirmed.
- [ ] Re-grant Screen Recording and Accessibility to the notch app (System Settings, Privacy and Security).
- [ ] Set `PUBLIC_URL` (tunnel) and scan the QR from a physical phone on venue wifi.
- [ ] Rehearse on saved pages with the real server; keep replay mode (Ctrl+Shift+R) armed.
- [ ] Update test counts and accuracy numbers in `docs/devpost.md` to the latest run in `docs/results/pointer.md` (80.0% commit, 66.7% hover, 90% target not met).
- [ ] Disclose AI coding tools and libraries on Devpost (MLH 70/30 rule).
- [ ] Print `docs/sponsors.md` sheets for NEXT, Perceptron, SideShift.
- [ ] Submit before 10:00 Sunday; Devpost locks then.
- [ ] Devpost fields: title, tagline, description (paste from `docs/devpost.md`), Built with, links (video, repo), tracks, team, image gallery. Preview the public page.
- [ ] Screenshots: save 3 to 5 in `docs/screenshots/` (lifted app, Backend tab with a phone row, Chat answer, pointer label, notch tray, Atlas collection if connected) and upload them to Devpost. The demo GIF in `README.md` is also not recorded.
- [ ] Fact-check pass done on 2026-10-18: grep `verify before submit` in `README.md` and `docs/*.md`, then clear or delete each hit. Known open: Replay is a small dot, not a banner; pentaswan's sandbox and sketch commits are not on `integrate`; Perceptron chat speed is unmeasured; sync harness results are not quotable.
- [ ] Final smoke on the last commit: `pnpm test`, typecheck for shared, server and web, `pnpm eval:pointer`, `scripts/e2e/smoke.mjs`, `scripts/e2e/extension.mjs`, then the demo path once in real mode and once in replay. Update test counts in the docs.
- [ ] README license: choose one before the repo goes public.
