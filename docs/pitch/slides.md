# Create: 5-slide outline

## 1. Problem
- Changing a website means describing it in a paragraph: "the third card, no, the left one, make it bigger".
- People point and say "fix this" to each other. Software makes you leave the page for a prompt box.
- Who suffers: shop owners and non-coders who just need hours and a menu online.
- Line: Point at it. Say it. It changes.

## 2. Demo
- Embed the 2:00 video (`storyboard.md`).
- Three frames: bakery page from one prompt; hover title + "Make this bigger"; sketch to page.
- Callout: bubble shows what Create understood; asks "Which one?" instead of guessing.

## 3. How it works (text diagram)
```
 type / speak / draw / point+narrate
              |
              v
   /api/route-intent  (Jev -> Haiku -> keywords)
     action + target (pointed element wins on "this"/"that")
              |
   +----------+-----------+
   |                      |
 /api/edit-node       /api/canvas-ops (Perceptron reads sketch)
 /api/generate        Claude writes edit ops
   |                      |
   +----------+-----------+
              v
   JSON component tree (Zod-validated, no raw HTML)
              v
   one React renderer -> live editable page -> share / publish HTML
```
- One schema for AI output, user edits, and saved shares.
- Chrome extension posts a structural snapshot to `/api/import-element`, returns a Create link.

## 4. Sponsor tech
- TypeSafe Jev: routes each spoken line to action + target, about 60-200 ms (per `docs/demo-script.md`); deictic words let the pointed element win.
- Perceptron: reads sketch shapes and positions before Claude writes edits.
- ElevenLabs Scribe: realtime transcription via single-use server-minted token; browser speech fallback.
- MongoDB Atlas (MLH): share links and per-app form submissions (verify before submit); local files without it.
- Tracks: DubHacks NEXT, Perceptron, SideShift, MongoDB Atlas.
- Team: Sooraj Sambasivam, Abel Anand (page engine, streaming, icons, live data), pentaswan (canvas, sketch vision prototype).
- Claude (Sonnet 5.5 / Haiku 5.5): page and edit generation.
- Every sponsor is optional at runtime; mock mode runs the full UI with no keys.

## 5. What's next: pointer everywhere
- Click-to-point with no modifier key; pointing inside the canvas.
- Extension today: point at any site, get an editable copy (verify in real Chrome before claiming). Next: the pointer inside any page, then desktop-wide, e.g. a photo on the desktop (listed in `docs/devpost.md`).
- Multi-page sites and collaborative editing.
- Shipping tonight, verify before submit: Chat | Code modes, per-app Backend with form submissions in MongoDB, onboarding, AI pointer click-to-pin. Show only what is confirmed in the browser; otherwise present as roadmap.
- Close: Point at it. Say it. It changes.
