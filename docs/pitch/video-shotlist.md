# Create: video shot list

Pre-flight (from `docs/demo-script.md`): `pnpm dev`; `GET http://localhost:3001/api/health` shows `mock:false` and keys; Chrome at laptop width, light theme, mic permission granted; start from empty app; Narrate dry run done; run the exact script once in record mode in the SAME browser profile so replay has a recording. Keep that screen capture as backup. Close the right panel (fan items can sit under the Run log at 1440x900).

Replay: **Ctrl+Shift+R** toggles replay mode (dot titled "Replay on"). It answers model, voice and intent calls from the recording; intent and canvas-ops replay only on an exact request match, so say/type the utterances below verbatim. Turn it off before the next live step. Share is not covered by replay.

| # | Time | Shot | Exact input | Expected result | If it fails |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00-0:10 | Empty app, wide | none | Composer visible | Reload page |
| 2 | 0:10-0:25 | Composer close-up | Type: `A website for a neighborhood bakery: a hero photo, three menu items with prices, opening hours, and an order button.` Press Go | Page streams in | Ctrl+Shift+R, resubmit same text; or cut to recorded clip |
| 3 | 0:25-0:45 | Fan, then title hover | Fan > Narrate. Hover title, wait for bubble label. Hold Option, say: `Make this bigger.` Release | Bubble: label, words, Editing, Done. Title grows | Ctrl+Shift+R, repeat verbatim. Pointer missed: click element, press `/`, type "make this bigger" in the AI box. Voice failed: type same sentence, say "typed here, same result" |
| 4 | 0:45-1:05 | Hero photo hover | Hold Option, say: `Swap this photo for a cupcake.` | Photo replaced, bubble Done | Ctrl+Shift+R, repeat verbatim; if no photo match the app says so, retry once |
| 5 | 1:05-1:15 | Undo, overlap hover | Cmd+Z. Hover overlap, say: `Make this red.` | Undo reverts; bubble may ask "Which one?", click item, turns red | Skip the ask half; show undo only |
| 6 | 1:15-1:35 | Canvas draw | Fan > Canvas. Draw header box, two side-by-side cards, small button box. Generate | Page built from sketch | Ctrl+Shift+R (exact canvas-ops match needed, so redraw the recorded shapes); else play recorded clip |
| 7 | 1:35-1:45 | Mic | Fan > Mic. Say: `Add a contact section with a phone number.` Go | Contact section added | No Scribe key falls back to browser speech; else type the sentence |
| 8 | 1:45-1:55 | Extension (GATED) | Alt+Shift+P or toolbar icon on a normal site, click element, type `make this mine but darker`, Enter | New tab at `<web origin>/?p=<id>` with editable copy | DROP the beat. Use phone share: Share, copy link, open on phone (`pnpm share:tunnel`). Share fails: Publish, open the downloaded single HTML file on the phone |
| 9 | 1:55-2:00 | Four-inputs montage | none | Type, say, draw, point | Static end card |

Global fallbacks, in order: (1) Ctrl+Shift+R replay; (2) pre-recorded full-run video for the failing step; (3) `MOCK_AI=1` (UI, editor, canvas, pointer work with canned pages and simple rules: bigger, smaller, colour, remove; say so if shown). Do not debug on camera.

Optional shot (verify before submit): Chat | Code toggle to Chat, point at a figure, ask `What does this number mean?`; back to Code, submit the page form in Preview, open Backend panel and show the entry. If any step fails, cut the shot; do not debug on camera.
