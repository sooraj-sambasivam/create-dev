# Pointer + voice UX: 10 rules for Create

Date: 2026-10-17. Code checked read-only: `apps/web/src/modes/narrate/overlay/` (PointerBubble, HoldToTalk, pointerCommand, pointerLogic, usePagePointer, Lasso, NarrateOverlay).

## Sources and confidence

Verified (fetched this session):
- DeepMind AI pointer post, https://deepmind.google/blog/ai-pointer . Four principles: maintain the flow (no "AI detours"), show and tell (visual + semantic context around the pointer), "this" and "that" (shorthand like "Fix this"), turn pixels into actionable entities. The post says nothing about latency.
- Gemini in Chrome "Magic Pointer": point at or select page content and ask, e.g. compare selected products, explain jargon. https://www.androidauthority.com/magic-pointer-gemini-in-google-chrome-3666405/ (from search snippet, not a full fetch).
- Nielsen, response-time limits: 0.1 s feels instantaneous, 1 s keeps the train of thought (show working state beyond it), 10 s is the attention limit (progress + cancel). https://www.nngroup.com/articles/response-times-3-important-limits/
- WCAG 2.2 SC 2.5.7 Dragging Movements (AA): anything done by dragging needs a single-pointer non-drag alternative. https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- WCAG SC 2.5.1 Pointer Gestures: path/multi-finger gestures need a simple alternative. https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html

Unverified (fetch failed or tool returned from general knowledge; confirm before citing on stage):
- Bolt 1980, "Put-That-There: Voice and gesture at the graphics interface", SIGGRAPH. ACM page returned 403 (https://dl.acm.org/doi/10.1145/965105.807503). Widely known claim: pronoun ("that") is resolved by the pointing gesture at the moment of speech. Speculation on exact wording.
- Apple visionOS HIG "Eyes", https://developer.apple.com/design/human-interface-guidelines/eyes . The fetch summarized from memory: system shows hover highlight, apps never see raw gaze before selection, targets about 60 pt, look-and-pinch confirms. Speculative until re-read.
- Multimodal deixis literature (Oviatt "Ten myths of multimodal interaction", CACM 1999; Bolt) : users speak and point nearly simultaneously and gesture usually precedes or overlaps the spoken referent. Not fetched; speculation.
- "Instant" thresholds beyond Nielsen (about 100 ms perceived causality, 400 ms Doherty threshold): not fetched this session.

## The 10 rules and status in current code

1. Show what "this" will bind to before the user speaks (hover outline + label chip). Source: DeepMind "this/that", Apple hover highlight (unverified).
   MET. PointerBubble draws a 2px outline and "Heading · Welcome" chip on hover, pin shows "Pinned · ...".

2. Bind the referent at utterance start, not at end. Source: Bolt (unverified), deixis literature (unverified).
   MET. HoldToTalk snapshots `bound` on keydown (pin, else hover within 1500 ms); `usePagePointer.resolveAt(t)` keeps a ring buffer for narrate.

3. Feedback within 100 ms of any input; working state if over 1 s. Source: Nielsen.
   PARTLY MET. Chip appears on keydown (listening) and rAF-throttled hover, then "Understanding..." and "Editing...". MISSING: no measured budget for keydown-to-chip, and final-to-intent is only `console.info`-logged, not asserted (pointerCommand.ts). No progress/cancel for slow edits (10 s rule).

4. Stage latency visibly: route fast (intent), then apply. Keep intent step 60-200 ms (TypeSafe Jev target in task brief). Source: Nielsen; vendor claim.
   MET (instrumented). pointerCommand logs final->intent, intent->applied, total. Missing: surface in a dev overlay or test to prove the target for judges.

5. Never act on low confidence or ambiguity; ask a short disambiguation. Source: DeepMind "meets users without interrupting flow" (inference), general mixed-initiative practice (speculation).
   MET. MIN_INTENT_CONFIDENCE 0.5, "Which one?" with up to 4 candidates, spoken answer matched by `matchOffered` with 15 s TTL, "Point at something first" on no target.

6. Questions answer, commands edit; do not mutate on a question. Source: DeepMind examples (explain vs transform).
   MET. Chat mode always `runAsk`; Code mode routes, and `action === "ask"` goes to `runAsk`. Answer chip offers "Switch to Code".

7. Make every edit visibly confirmed and easy to undo. Source: Nielsen (feedback), general practice.
   PARTLY MET. "Done · summary" chip for 2.5 s. MISSING: no undo affordance in the overlay (undo may exist elsewhere in screenStore; not checked).

8. Push-to-talk with a release that always ends capture, plus a cancel key. Source: general voice UX (speculation).
   PARTLY MET. keyup, window blur release listening. Option-key hold is the only trigger; Escape closes Narrate (NarrateOverlay.tsx:226) but not a hold-to-talk or in-flight command (no abort in pointerCommand; `isDone()` is hardwired false in HoldToTalk).

9. Provide a non-voice and non-hover path (motor/voice-impaired, keyboard). Source: WCAG 2.5.1 / 2.5.7 (verified); Apple look-and-pinch fallback (unverified).
   MISSING. Hold-Option is hold-based (a sustained press), mouse hover is required for targeting, Lasso is a drag with no click alternative seen. Needs: toggle mode (press once to start/stop), type-instead-of-speak input, keyboard element cycling (Tab/arrow to move target), click-to-pin as the pointing fallback.

10. Announce state to assistive tech and respect reduced motion. Source: WCAG 4.1.3 Status Messages (not fetched; speculation on exact text).
   PARTLY MET. `useReducedMotion` disables transitions in PointerBubble and bar. MISSING: PointerBubble root is `aria-hidden="true"` with no `aria-live` region, so screen readers never hear Listening/Done/answer text. Narrate bar does use `aria-live="polite"`.

## Score

MET: 1, 2, 4 (instrumented only), 5, 6. PARTLY: 3, 7, 8, 10. MISSING: 9.

## Suggested fixes in priority order (do not edit now; other agents own the files)
1. Rule 9: add toggle-to-talk and a text input path to HoldToTalk; click-to-pin as the pointing fallback.
2. Rule 10: a visually hidden `aria-live="polite"` sibling mirroring `phaseText(phase)` and the answer text.
3. Rule 8: Escape cancels listening and sets an abort flag so `isDone()` returns true.
4. Rule 7: add "Undo" to the done chip (extend the 2.5 s timer while hovered).
5. Rule 3/4: show a "Still working..." state after about 1 s in `editing`; add a latency test.
