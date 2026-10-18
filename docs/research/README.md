# Create: research index and next-6-hours actions

DubHacks '26. Internal submission target 5:30 AM; Devpost locks Sun 10:00 AM. Tags: [code] [demo] [owner-only]. Facts in the linked files carry their own source labels; items marked (S) here are my judgment.

## Index

| File | What it holds |
|---|---|
| `competitors.md` | Positioning vs Google Magic Pointer, Lovable Visual Edits, Replit Design Mode, Figma Make, Framer AI, Bolt, v0. Finding: we did not find a tool that combines sketch, voice, pointing and editing an existing site (absence in search results, so say "we didn't find one"). |
| `judging-playbook.md` | Rubric (Functionality 30, Track 30, Design 20, Creativity 20), proof moment per criterion mapped to demo-script timestamps, per-track checklists and pitches, 10 judge Q&A, 30 s and 2 min pitches, open team decisions. |
| `pointer-ux.md` | AI-pointer rules audit. Gaps: no keyboard/click alternative (WCAG 2.5.1/2.5.7), no `aria-live`, no Escape abort, no undo on the Done chip, no "still working" state. |
| `release-checklist.md` | Pre-public security scan. Secrets clean. FAIL: AI trailers in 8 commits, missing rate limits on expensive routes, no LICENSE. WARN: unauthenticated `GET /api/forms/:appId`. |
| `../pitch/storyboard.md`, `video-shotlist.md`, `slides.md` | 9-beat 2:00 storyboard, exact prompts and fallbacks per shot, 5 slides. Chat/Code modes and Backend are not shown (roadmap only). |
| `../../scripts/eval/` | `node scripts/eval/run.mjs`: 12 cases. Mock run: 7 pass, 5 warn, 0 fail. Real-key content checks never run. |

## Top 10 actions, ranked by judge impact per minute

1. [owner-only] Pick title track and sponsored slots now (Chef's Choice suggested (S); Perceptron + SideShift), and ask the Perceptron and TypeSafe tables what counts for them. About 10 min; it decides which demo beats matter and avoids claiming an unconfirmed track.
2. [demo] Record the required 2:00 video from `video-shotlist.md` using the repeat-verbatim lines, with the Ctrl+Shift+R replay and pre-recorded run as fallback. No video means not judged, and it is the cheapest insurance.
3. [code] Rerun `node scripts/eval/run.mjs` with real keys (after the other agents finish) and confirm the `x-intent-engine` header shows Jev and `perceptron+claude`. Proves Functionality and sponsor use; fix any FAIL before filming.
4. [demo] Rehearse the 0:25-0:45 pointer edit, the 1:05-1:15 undo and "Which one?", and the 1:15-1:35 sketch three times at the demo resolution. The rubric weights these most. Fix known glitches (brand text wrap, bubble covering nav, fan under Run log at 1440x900) or choose a framing that avoids them.
5. [code] Run the extension once in real Chrome. The README says it has never been run there. Keep the 1:45-1:55 beat only if it works; otherwise use the phone share.
6. [code] Add the pointer accessibility minimum: click-to-pin and a toggle-to-talk or text input path, an `aria-live` mirror for the bubble, Escape to abort. Lifts Design and the accessibility Q&A; cheapest items first.
7. [owner-only] Decide MongoDB: make Atlas the real store for shares and form submissions, or drop the track. Do not claim it if the demo runs on local files.
8. [code] Add rate limiters to `generate`, `generate-sketch`, `canvas-ops`, `demo`, `transcribe`, `intent`, `upload`, set `trust proxy`, and set vendor spend caps. Prevents a public demo URL from draining credits.
9. [demo] Get one real-user test (someone not on the team points at the page) and log dated pivots from git history. Needed for DubHacks NEXT; do not claim a study we did not run.
10. [owner-only] Run the history cleanup (or publish a fresh orphan repo) with teammate agreement, add LICENSE and `.env.*` ignore, then make the repo public. The trailer commits are a policy violation, but the rewrite is destructive: no force-push without explicit approval.

## Open decisions (from the playbook)

Title track; MongoDB yes or no; extension in real Chrome; third sponsored slot; GoDaddy domain (skip if it does not resolve to a working demo by 5:30 AM).
