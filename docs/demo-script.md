# Demo script: Create (repo `create-dev`)

Theme: **Point at it. Say it. It changes.** Target: 2:00. Narrate for non-coders and small
businesses: say "page", "website", "your customers", never "component" or "API".

**Length:** the team decision allows up to two minutes (B2); this script is written for 2:00. OWNER:
confirm the length limit and the track name on the DubHacks hacker guide before recording.
If three minutes are allowed, use the spare time as buffer, not for extra features.

**Presenter:** OWNER: assign who speaks and who drives the mouse. Everyone presents or records (T3).

## Before recording

- [ ] `pnpm install`, then `pnpm dev`. Open http://localhost:5173 (default web port).
- [ ] `GET http://localhost:3001/api/health` shows `mock:false` and the keys present
      (Anthropic required; Jev, Perceptron, ElevenLabs optional). Keys live in `apps/server/.env`
      and are never committed.
- [ ] Browser (Chrome) at laptop width, light theme, microphone permission granted in advance.
- [ ] Start from an empty app (new chat, no page).
- [ ] Narrate is on and the pointer bubble shows when you hover the page. Do one dry run.
- [ ] Phone route for the share step is tested (see `docs/integration.md`, "Share links on a phone").
- [ ] Replay is primed: run this exact script once in record mode (the default) in the same browser
      profile, since replay reads the recording from that browser. Keep that video as the backup.

## Timeline (2:00)

| Time | Beat | On-screen steps | Say |
| --- | --- | --- | --- |
| 0:00-0:10 | Hook | Empty app, composer visible. | "Most website builders make you describe a change in a paragraph. We just point and talk." |
| 0:10-0:25 | Make a page | Type: `A website for a neighborhood bakery: a hero photo, three menu items with prices, opening hours, and an order button.` Press Go. Cut to the recorded clip if the wait runs past 10 seconds. | "Type what you want. Claude builds a real page." |
| 0:25-0:45 | Point + "make this bigger" | Open the radial fan, choose **Narrate**. Hover the page title. The bubble reads the element's label. Hold **Option** and say: `Make this bigger.` Release. The title grows in place. | "Now I point at the title and say it. The bubble shows what it understood, and it changes right there." |
| 0:45-1:05 | Point + "swap this photo" | Hover the hero photo. Hold Option and say: `Swap this photo for a cupcake.` The photo is replaced. | "Same move for a photo. No menus, no prompt box." |
| 1:05-1:15 | Undo and ask | Press Cmd+Z to undo. Hover where two items overlap and say `Make this red.` If the bubble asks "Which one?", click the right item. | "It never guesses silently. If it is unsure, it asks. Undo is one key." |
| 1:15-1:35 | Sketch | Open the fan, choose **Canvas**. Draw a wide header box, two side-by-side cards, a small button box. Press Generate. Watch the preview pane. | "Or draw it. Perceptron reads the sketch, and Claude turns it into your page." |
| 1:35-1:45 | Voice | Open the fan, choose **Mic**. Say: `Add a contact section with a phone number.` Press Go. | "Speech goes in live through ElevenLabs." |
| 1:45-1:55 | Share on a phone | Click **Share**, copy the link, open it on the phone. | "Share a read-only link. It opens on any phone." |
| 1:55-2:00 | Close | Show the four inputs: type, say, draw, point. | "Point at it. Say it. It changes." |

Timing notes:

- A Sonnet page takes about 14 to 20 seconds. Start the generation, then cut to the recorded clip of
  the same step. Keep the same prompt text so the cut is seamless.
- Pointer edits should land in a few seconds. Jev routes the spoken line in about 60 to 200 ms.
  Most of the wait is the edit itself. Bigger and smaller are applied with no model call.
- Hover on the target before you start speaking and keep the pointer still until the bubble shows
  the label. The target is read when the first words arrive.
- Shift+drag lassos several elements. Use it only if there is time; it is not in the 2:00 script.
- Claim only what the build shows. If the sketch preview only fills in after Generate finishes,
  say "it builds the page" and do not say "live". **Check on the day.**

## Backup plan

Use the first option that works. Do not stop to debug on stage.

1. **Replay mode (Ctrl+Shift+R).** Answers the model, voice and intent calls from the recorded run
   in this browser. A small dot titled "Replay on" shows while it is on. Turn it off before the next
   live step. The share step is not covered by replay.
2. **Recorded video.** The full run of this script, recorded before judging. Play the clip for the
   step that failed, then return to the live app.
3. **Mock mode (`MOCK_AI=1`).** The UI, editor, canvas, pointer and share flows work without model
   calls. Edits use simple built-in rules (bigger, smaller, colour, remove) and pages are canned.
   Use it when a key is capped or the network is down. Say so if it is shown.
4. **Share step fails.** Show Publish, which downloads one self-contained HTML file, and open that
   file on the phone. Say "a single HTML file".

If the voice step fails, type the same sentence into the composer and say "typed here, same result."
If the pointer misses its target, click the element to select it and use the ✦ box (press `/`).
