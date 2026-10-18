# Create: 2-minute demo storyboard

Source of truth: `README.md`, `docs/devpost.md`, `apps/extension/README.md`, `docs/demo-script.md`. Chat | Code modes and per-app Backend ship tonight; they appear only as the optional beat below and only after they are confirmed in the browser (verify before submit). Extension is untested in real Chrome (README), so its beat is gated.

Theme line: **Point at it. Say it. It changes.** Voice: plain words for shop owners ("page", "website"), never "component" or "API".

| Time | Beat | On-screen action | Voiceover | What it proves to judges |
| --- | --- | --- | --- | --- |
| 0:00-0:10 | Hook | Empty app, composer visible. | "Website builders make you describe a change in a paragraph. We just point and talk." | The problem and the pitch in one breath. Inspired by the DeepMind AI pointer. |
| 0:10-0:25 | Make a page | Type the bakery prompt, press Go. Cut to the recorded clip if the wait passes 10 s. | "Type what you want. Claude builds a real page." | Real generation into a validated JSON component tree (Zod), not raw model HTML. |
| 0:25-0:45 | Point + "make this bigger" | Radial fan, **Narrate**. Hover title, bubble shows label. Hold Option, say "Make this bigger." Title grows in place. | "I point at the title and say it. The bubble shows what it understood, and it changes right there." | Hero feature. Pointer supplies "this", voice supplies the change. TypeSafe Jev routing (60-200 ms per `docs/demo-script.md`). |
| 0:45-1:05 | Point + "swap this photo" | Hover hero photo, hold Option, say "Swap this photo for a cupcake." | "Same move for a photo. No menus, no prompt box." | Single-element edit, not a page regenerate. Photo checked server-side so it never lies about a swap. |
| 1:05-1:15 | Undo and ask | Cmd+Z. Hover overlap, say "Make this red." Bubble may ask "Which one?"; click the right item. | "It never guesses silently. If unsure, it asks. Undo is one key." | Trust: deixis resolution, ambiguity handling, queued undoable edits. |
| 1:15-1:35 | Sketch | Fan, **Canvas**. Draw wide header box, two side-by-side cards, small button box. Generate. | "Or draw it. Perceptron reads the sketch, Claude turns it into your page." | Perceptron vision sponsor tech; sketch lands in the same tree. |
| 1:35-1:45 | Voice | Fan, **Mic**. Say "Add a contact section with a phone number." Go. | "Speech goes in live through ElevenLabs." | ElevenLabs Scribe realtime (browser speech fallback exists). |
| 1:45-1:55 | Extension OR phone share | GATE: only if extension verified in real Chrome. Click icon on any site, click element, type "make this mine but darker"; Create tab opens. ELSE: Share, copy link, open on phone. | "Point at any website and pull it into Create." / "Share it to your phone." | Pointer beyond our own page (extension), or read-only share link (MongoDB optional store). |
| OPTIONAL | Chat + Backend | Chat mode, point at a figure, ask what it means; submit the page's form; open Backend panel to show the stored entry. | "Chat answers about anything you point at. The form is real: it lands in your backend." | MongoDB Atlas track: real submissions stored. Gate: confirmed in browser. |
| 1:55-2:00 | Close | Show four inputs: type, say, draw, point. | "Point at it. Say it. It changes." | One format, four inputs. |

Budget notes
- Sonnet page takes about 14 to 20 s: start generation, cut to recorded clip with the same prompt.
- Hold the pointer still until the bubble shows the label; the target is read when the first words arrive.
- Known glitch: after "bigger" the brand text may wrap and the bubble may cover a nav link. Use a short title.
- Do not say "live" for the sketch unless the preview fills before Generate finishes. Check on the day.
- Spare time is buffer, not extra features. Shift+drag multi-select is not in the 2:00.
