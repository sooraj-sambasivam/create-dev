# Judging Q&A: Create (DubHacks '26)

Fifteen questions judges are likely to ask, with short honest answers. Numbers come from `docs/results/pointer.md`, the real-mode eval (`scripts/eval/results/2026-10-18T08-04-46-248Z.json`) and `docs/results/traces/demo-path-real.json`. **Verify before submit** marks anything not confirmed in this repo today. Rule for every answer: say what is measured, say what is not.

**One-sentence answer to "what is it?"** Point at a table, chart, list or PDF, say "turn this into something I can track", and Create gives you a live app with a table, chart, add-row form and a backend you can share by QR.

---

**1. Is the mic always listening? What happens to my voice?**
No. Voice starts when you hold Option or press the mic, and stops when you release. While on, the browser streams audio straight to ElevenLabs Scribe using a single-use token the server mints, so the ElevenLabs key never reaches the browser. If Scribe is unavailable the browser's own speech recognition is used, which goes to the browser vendor under their policy. The Create server receives the transcript text, not the audio. Verify before submit: that the server does not log transcripts beyond the request, and that the notch app has no always-on listener.

**2. Are you recording my screen?**
No continuous recording. Hovering uses the page's DOM and the accessibility tree, and the hover path also runs TypeSafe Jev on pixels (`HOVER_PIXEL` in `apps/server/src/pipeline/locate.ts`), so a capture can be sent to our server while you hover if the client attaches one; verify before submit exactly what the extension and notch app attach on hover. Perceptron, Gemini and Claude vision only see pixels at commit (Enter / release, or "Lift from screen"). The macOS notch app needs Screen Recording and Accessibility permission, which you grant explicitly. Traces keep per-stage timings and no image bytes. Verify before submit: server-side retention of uploaded crops (we have not written a retention policy) and that uploads are not persisted.

**3. Where is my data stored, and who sees it?**
Rows you add live in the app's store: MongoDB if `MONGODB_URI` is set, otherwise local JSON files. Right now MongoDB is not set on our dev machine, so a live demo uses files (see Q13). Reads of an app's rows need a per-app token, app ids are validated against `^[A-Za-z0-9_-]{1,40}$`, request bodies are size-limited, and each app keeps at most 200 rows. Share links are read-only. We have no privacy policy and no audit; this is a hackathon build.

**4. How is this different from v0 or Lovable?**
They start from a prompt or a Figma frame and generate a new app; Lovable's Visual Edits let you click an element in its own preview. Create starts from something that already exists on a page you do not own, and hands back an app with a backend. Pointing is how you say "this", and the pointer reads what is under it. We have not benchmarked v0 or Lovable and some cells in our comparison are unverified (`docs/research/competitors.md`); do not claim they cannot do it. The honest claim is that we did not find a tool doing point -> typed entity -> live app with a store in one step, and a search not finding one is not proof.

**5. How is this different from Google's Magic Pointer / Gemini in Chrome?**
Magic Pointer, announced by Google DeepMind on 2026-05-12, makes the pointer supply "this" for answers and actions: compare these products, visualize this couch. Create uses the same idea but ends in an app you own, with rows you can add to and a share link. Google answers; we produce an editable, stored artifact. We do not have Google's distribution, models or polish, and Gemini is one of our engines. Chat mode in Create does answer questions too, so the difference is the lift, not that we cannot answer.

**6. How accurate is the pointer?**
On our 30 hand-labelled targets, fused top-1 is 80.0% (24/30) in commit mode and 66.7% (20/30) in hover mode. Web pages 20/22 in both; PDFs 4/8 in commit, 0/8 in hover. Our 90% target is **not met**. Hit means IoU at least 0.5 and the box contains the cursor. Caveats: 30 targets is small (one target is 3.3 points), the corpus was re-collected by the same lane that tuned the rules so 20/22 on web is probably optimistic, and the 8 PDF targets are CoreGraphics renderings, not real Preview captures.

**7. What happens when it is wrong?**
Ambiguity produces a "Which one?" prompt instead of a guess, and edits are queued and undoable. But it is not zero-silent-failure: in commit mode, 6 of 30 fused answers were wrong with no prompt, mostly PDF boxes from Perceptron that miss (a price cell, a total, one bar) and so have nothing to disagree with. In hover mode it was 2 silent wrong. We know and did not fix it.

**8. How fast is it?**
Hover labels: p50 4 ms, p95 137 ms, max 147 ms (inside the 300 ms budget) because they use DOM and the accessibility tree. Commit on a web page: p50 2 ms via the structural fast path. Commit when pixels are needed (PDFs): p95 5.1 s, because Perceptron detect takes 3.5 to 5.9 s. "This" resolves with Jev in about 0.13 s (131 ms in the real-mode eval). Full demo path on the real server: 16.3 s from locate to a lifted app, a Chat answer and an edit. Generating a full page from a prompt takes 11 to 26 s.

**9. What does a lift cost you? What would it cost at scale?**
We do not have an invoice. The eval harness uses placeholder per-call prices ($0.002 Perceptron detect, $0.001 Jev, $0.0015 Gemini, $0.006 Claude vision), so one commit lift is on the order of a cent or less before the Haiku title polish; **treat as an estimate**, not a measured bill. Rows never go through a model, so cost does not scale with row count. Generating a whole page with Sonnet is the expensive path and is capped by quota: guests get 10 builds, 20 lifts and 40 chats a day, accounts 3x, plus a per-IP cap and per-minute rate limits. Verify before submit: real spend from provider dashboards.

**10. What is the business model?**
Every portal, PDF and screenshot is read-only. The pointer is free; the product is a hosted backend for the apps people lift, proposed at $9 to $19 a month (not tested with anyone), and every shared app carries a "remix in Create" button, which is the growth loop. We have no users, no revenue and no pricing test. First experiment: put a lifted bus schedule in front of 10 UW students and see whether anyone adds a row.

**11. Is it accessible?**
Partly, and we should not oversell it. What is in the code: Escape cancels pointing, a live region announces bubbles, undo is a key, toggle-to-talk exists so you do not have to hold a key, there is browser read-aloud on thread answers (browser `speechSynthesis`), and motion respects reduced-motion in CSS. What is not done: no screen-reader audit, no full keyboard path for pointing, no WCAG claim. Voice-first pointing could help people who cannot type or use a mouse precisely, but we have not tested with any such users. Verify before submit that each listed item still works in the final build.

**12. What is real and what is mocked?**
Real on the live server (`MOCK_AI=0`, keys present): Claude generation and edits, Inkling Chat, Perceptron detect and extract, Jev routing, Gemini calls, ElevenLabs realtime token. The real-mode eval passes 12 of 12 checks. Real storage: yes, but files unless `MONGODB_URI` is set. Mocked: with `MOCK_AI=1` (our test/e2e server on :3001) model answers are canned; that mode exists so tests and the demo fallback run with no keys. Replay mode (Ctrl+Shift+R) answers recorded calls; it covers generate, ask, route-intent, locate, extract and lift. We will say when the demo is running in replay. Tests: server vitest 30 files / 330 tests passed at last run, tsc clean (`docs/results/pointer.md`).

**13. Are you using MongoDB Atlas, really?**
Only if `MONGODB_URI` is set at demo time. The code for forms, share links, accounts and quota counters supports Atlas and falls back to files, and has tests, but we have not yet confirmed a row in a real Atlas collection. **OWNER:** if it is not set by submission, drop the MongoDB track and answer "we built for it, we did not deploy it". Do not claim otherwise.

**14. What breaks?**
- Pixel-only targets: single cells in PDFs (price, total, one bar) often miss. Perceptron times out on 16 of 30 calls at 8 s, mostly web screenshots.
- Gemini timed out on nearly all locate calls at our 3.5 s cap, so it is not helping accuracy yet.
- Values read from a chart image are approximate; exact numbers only from DOM tables.
- The extension and notch app were rehearsed on our sample pages; arbitrary sites with strict CSP, login walls or shadow DOM may fail. Demo uses saved or public pages.
- The mic in third-party pages is the riskiest part; there is a typed input as fallback.
- Phone links need `PUBLIC_URL` set (a tunnel), or the QR points at localhost.
- Vercel deploy is untested.
- The 90% accuracy target is not met.

**15. What did you build versus reuse, and who did what?**
Libraries and services: React, Vite, Tailwind, tldraw, Zod, Express; sponsor APIs (Claude, Inkling via Tinker, Perceptron, TypeSafe Jev, Gemini, ElevenLabs). AI coding tools were used to write code; we disclose that per MLH practice. By git history: Sooraj Sambasivam (31 commits) built integration and product: composer shell, pointer and Narrate, locate pipeline, Lift, extension, notch tray, Chat, onboarding, eval corpus; Abel Anand (7 commits) built the page engine: Screen schema, renderer, visual editor, streaming generation, icons proxy, live-data element; pentaswan (3 commits, on side branches, not on `integrate`) built the drawing canvas, a sketch-to-screen vision route and a sandboxed backend-functions prototype that shaped the Backend idea; the sandbox runner is not in the shipped tree, so do not call it a feature. The repo began from a scaffold with automated commits; counts are from `git log` at 2026-10-18 and will be higher after merge. Verify before submit that all three teammates are on the Devpost team and attend judging.

---

## Quick numbers card (read before judging)

| Claim | Number | Source |
|---|---|---|
| Fused pointer, commit | 24/30 (80.0%), web 20/22, PDF 4/8 | pointer.md |
| Fused pointer, hover | 20/30 (66.7%), p95 137 ms | pointer.md |
| Silent wrong, commit | 6 of 30 | pointer.md |
| Jev route-intent | 131 ms | eval 08-04-46 |
| Perceptron detect (PDF) | 3.5 to 5.9 s; extract 1.4 s | pointer.md, demo-path-real |
| Demo path real | 16.3 s, all steps green | demo-path-real |
| Real-mode eval | 12/12 pass | eval 08-04-46 |
| Quotas (guest/day) | 10 build, 20 lift, 40 chat | quota/limits.ts |
| Users / revenue | none | us |
