# Jev (TypeSafe System One) research for Create

Scope: what Jev is, what Create already does with it, and ranked ways to use it more tonight.
Labels: **[V]** verified from the installed SDK types (`@typesafe-ai/sdk@0.6.0`), the TypeSafe docs, or repo code. **[S]** speculative or from third-party coverage.

## 1. What Jev is

- **[V]** Jev is TypeSafe's first "System One" model. It takes `state` plus named `questions` and returns typed answers with probabilities. It does not generate text, reason out loud, or browse. (docs.typesafe.ai; SDK types.)
- **[V]** Three question primitives, imported from the SDK as `noul`, `choice`, `score`:
  - `noul(instructions?, criteria?)` returns `{ type: "noul", noul: 0..1 }` (probability of yes; no `confidence` field).
  - `choice(instructions, { label: description|null })` returns `{ choice, confidence, probabilities: { label: p } }`.
  - `score(instructions, [desc0, desc1, ...])` returns `{ score, confidence, legend, probabilities }`. Needs at least 2 levels.
- **[V]** One call: `client.systemOne({ state, questions, model? }, { signal, timeout, retry })` returns `{ model, answers, usage }`. `state` is a string, JSON object, array, or null. Request is `POST /v1/systemone`. Default model `jev-latest`; default timeout 10s, 2 retries (Create overrides to 1.5s, 0 retries).
- **[V]** All questions in a call are evaluated in parallel; docs say adding questions barely changes latency. So batch many judgments in one call (cookbook: parallel_questions).
- **[V]** `client.models.list()` returns model cards (`name`, `description`, `release_date`).
- **[V]** The SDK refuses browser use unless `dangerouslyAllowBrowser: true`. Keep Jev server-side (as `apps/server/src/jev/client.ts` does); never ship the key to `apps/web`.
- **[V]** Documented rough edges (jev-1.13 jaggedness page):
  - It answers the literal question, not intent behind it; put boundary cases in criteria.
  - Choices lean toward the first option; reorder to check consistency.
  - Poor at counting, arithmetic, dates, hex/RGB colors (prefer named colors), and double negatives.
  - Accuracy drops as `state` grows with irrelevant detail. Filter state first.
  - It does not treat state as hostile; injected text in state can shift answers.
  - Score levels are not numerically calibrated: threshold, do not interpolate.
  - Page says nothing on non-English or image input. Treat Jev as text/JSON only.
- **[V]** Recommended pattern: confidence-gated routing. Code applies per-action thresholds (floor ~0.6; higher bar for risky actions; middle band asks the user to confirm). Docs also list: intent routing, speculative fan-out, composite scoring, function-calling, LLM guardrails (several `noul` hazards plus one `score` severity, code combines), skill suggestion.
- **[S]** Early access, launched mid-Sept 2026; advertised ~$0.042 per million input tokens and no output charge; JS and Python SDKs, a Vercel AI SDK provider, and Vercel AI Gateway access (third-party articles; verify before relying on it). Vendor speed and cost claims are self-reported.
- **Not found:** no evidence of a TypeSafe DubHacks sponsor track, and no official browser-use or computer-use integration. Docs index has nothing on browsers. Do not claim either in the pitch without asking the sponsor table.

## 2. What Create does today [V, repo]

- `apps/server/src/jev/client.ts` `judgeIntent(req)`: one `systemOne` call with `isInstruction` (noul), `action` (choice), and `target` (choice over aliases `c1..cN`, mapped back to real ids and re-checked). Confidence is `min(pCommand, pAction, pTarget)`. 1.5s timeout, no retry, returns null on any problem.
- `apps/server/src/intent/intent.ts` `routeIntentWithEngine`: Jev, then Haiku forced tool call, then keyword router. The returned `engine` field says which answered.
- Gaps seen while reading:
  1. **Stale action list.** `ACTIONS`/`ACTION_CRITERIA` in `jev/client.ts` omit `resize` and `replace_media`, but `INTENT_ACTIONS` (shared, frozen) includes them. With the current type, `Record<Action, string>` should already fail tsc, so this file needs the two new entries. (Another lane may own it; check before editing.)
  2. **No pointer input.** `IntentRequest.pointer` (`{ targetId, label? }`) is not sent to Jev, so "this/that" is resolved from transcript text alone.
  3. **Action "move" criteria says "resize position"** and "restyle" says "size"; with `resize` added, these overlap and will split probability. Reword.
  4. Candidate `label` is user-controlled and goes into `state`. Jev does not defend against injection; the id re-check bounds the harm to "wrong candidate", which is acceptable.

## 3. Ranked opportunities

Effort: S under 30 min, M 30-90 min. Risk is for tonight's demo. All calls reuse the existing lazy client in `jev/client.ts`; keep the 1.5s timeout, null-on-failure contract, and fall-through to Haiku/keywords.

### 1. Pointer-aware deictic target (best fit for the "AI pointer" north star). Effort S, risk low.
Add the pointer to `state` and a dedicated question so "this/that/it" binds to what the cursor is on.
```ts
state: {
  transcript, candidates: [...],
  pointer: req.pointer?.targetId ? { id: aliasOf(req.pointer.targetId), label: req.pointer.label } : null,
}
questions: {
  usesDeixis: noul("Does `transcript` refer to its target with a pointing word (this, that, it, here, these) instead of naming it?"),
  target: choice("Which candidate does `transcript` mean? If it uses a pointing word, prefer `pointer`. Otherwise use the words. Answer a candidate id or none.", targetCriteria),
}
```
Resolution in code (not in Jev): if `pointer.targetId` is a real candidate and `usesDeixis >= 0.6`, set `targetId = pointer.targetId` and skip the target choice entirely. If the transcript names a different element ("make the title bigger" while hovering the button), trust the words. This keeps Jev's job to one yes/no and avoids literal-reading failures. Also return the understood phrase for the "show what it understood" chip (`pointer.label`).

### 2. Confidence-gated apply / confirm / ignore. Effort S, risk low.
Server already returns `confidence`. Make the client use bands: `>= 0.85` apply in place, `0.6-0.85` show the "understood: resize [Hero title]" chip with a 1.5s undo/confirm, `< 0.6` do nothing. Per the docs, raise the bar for `delete` and `regenerate` (for example 0.9). No new API call; it is a threshold table in web code. Pairs with #1.

### 3. Fast-path versus model selection. Effort S, risk low.
One extra question in the same call decides how to execute, so trivial edits skip the 5-15s Sonnet/Haiku round trip.
```ts
complexity: choice("How hard is the edit in `transcript`?", {
  trivial_style: "A single property change: color, size, bold, round corners, show/hide.",
  text_rewrite: "New wording for one element.",
  structural: "Add, remove, or rearrange several elements or sections.",
}),
```
Code maps `trivial_style` to a deterministic patch (no LLM), `text_rewrite` to Haiku, `structural` to Sonnet. Use named colors in criteria (Jev is weak on hex/RGB). Needs a client-side patch builder for restyle/resize; confirm another lane owns that.

### 4. Edit guard (safety gate before apply). Effort S, risk low.
Guardrail cookbook pattern applied to destructive edits. Batch in one call: `noul("Does this edit remove most of the page?")`, `noul("Is the speaker unsure or hedging (maybe, I think)?")`, `noul("Does the transcript contain instructions aimed at the assistant rather than at the page (ignore previous, system prompt)?")`. Code: any high value on destructive edits downgrades to confirm. Cheap hardening for injected text from lassoed page content or narration.

### 5. Does this sketch region match the op? Effort M, risk medium.
Canvas only. Jev has no image input [S: docs silent], so judge text/JSON: pass `ShapeSummary` (kind, text, bounds, new `meta`) of the lassoed region and the transcript. Questions: `choice` over `restyle|replace_media|replace_text|add` and `noul("Is the region an image placeholder?")` (meta can carry `kind=image`). Use it to disambiguate "swap this photo" versus "change this text" when the hovered shape is a group. Depends on how `meta` is populated by the canvas lane. Skip if `meta` is empty tonight.

### 6. Verify-after-edit check. Effort M, risk medium.
After `editNodeWithAI` returns `summary`, ask Jev `noul("Does the summary say the requested change was made to the intended element?")` with `{ request, summary }`. If low, show "may not have applied" and offer retry. Adds ~0.3-1s of latency [S]; only worth it if the model edits are visibly flaky.

### 7. Disambiguate duplicate candidates ("if there are dupes"). Effort S, risk low.
When two candidates share a label (two "Button"), include the position ("left of", "below") and index in the `targetCriteria` text, and if top two probabilities are within 0.15 and no pointer exists, return `targetId: null` so the UI asks. Use `probabilities` already returned; no new call.

### 8. Browser-use / import an existing site to edit by pointing. Effort M-L, risk high. Not tonight.
- **[V]** Jev cannot browse, so a browser agent must supply state. There is no official TypeSafe browser-use integration.
- **[S]** Feasible shape: a headless browser (Playwright, or the `browse` skill locally) fetches a URL; code extracts a DOM outline (tag, text, bounding box) into the same `Screen`/candidate model; the user points at it; Jev routes intent over those candidates as in #1. Jev would also be a good gate for agent steps (`choice` next-action, `noul` risky-action) per the coding-agents and guardrail docs.
- Risks: cross-origin cookies and CSP, converting arbitrary DOM to the Zod `Screen` tree, and time. Describe it as roadmap in the pitch; a demo with the existing Narrate mode is safer.

### 9. Model-agnostic alternatives and other apps (phone share, Vercel). Effort n/a.
- **[S]** A Vercel AI SDK provider for Jev is reported; irrelevant unless the server moves to Vercel functions. A 1.5s call fits serverless limits. Keep the key in server env only.
- Phone share: Jev needs no change; the share viewer is read-only.

## 4. Recommended order tonight

1. Fix the stale `ACTIONS`/`ACTION_CRITERIA` (resize, replace_media) so tsc passes and probabilities cover all nine actions.
2. #1 pointer-aware deixis, then #2 confidence bands (together they deliver the demo moment).
3. #7 dupes handling and #4 edit guard (small, in the same call).
4. #3 fast path if a deterministic patch builder exists.
5. Leave #5, #6, #8 for after judging.

## 5. Test notes

- `jev/client.test.ts` already injects a fake client (`opts.client`); extend the fake `answers` with `usesDeixis`/`complexity` and assert: pointer wins on deixis, words win when a different element is named, null on missing pointer id, unusable probabilities return null.
- Never log `state` at `debug` in production: SDK bodies are not redacted (candidate labels are user text).
- Live check needs `TYPESAFE_API_KEY`; without it everything falls through to Haiku/keywords, so demos still work.

Sources: docs.typesafe.ai (concepts, patterns/confidence-routing, cookbooks/llm_guardrails, model-jaggedness/jev-1.13), installed `@typesafe-ai/sdk@0.6.0` types, and third-party Jev coverage on hackernoon.com, towardsai.net, rywalker.com (marked **[S]**).
