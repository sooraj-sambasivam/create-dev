# Create

**Tagline:** Point at it. Say it. It changes.

Repository: `create-dev`. The product is called **Create** in the UI.

**Track:** OWNER: pick the track(s) on the DubHacks hacker guide before submitting.
**Video:** OWNER: paste the 2-minute video link here. **Repo:** OWNER: confirm the repo is public.

## Inspiration

Describing a change in words is slow. You say "the third card, no, the one on the left, make it
bigger" and the tool still guesses. People already do this with each other: they point and say
"fix this". Google DeepMind's AI pointer idea is the same move for software: the pointer supplies
the "this" and the "that", the voice supplies the change, and the edit happens in place with no
detour into a prompt box.

We built that for websites. Small businesses and non-coders need a page, and the fastest way to
change a page is to hover on the part you mean and say what you want.

## Who it is for

Non-coders and small businesses: a shop owner who needs a page for opening hours and a menu, not a
developer who needs a framework.

## What it does

**Point at it. Say it. It changes.** Hover any element on the live page and talk:

- "Make this bigger." The heading under your pointer grows.
- "Swap this photo for a cupcake." The image under your pointer is replaced.
- "Fix that." The element is rewritten in place.

A bubble follows the pointer and shows what Create understood (for example, "Heading: Welcome"),
then the words it heard, then Editing, then Done. If two elements are equally close, it asks
"Which one?" instead of guessing. Shift+drag still lassos several elements at once.

Pointing is one of four ways in. Type in the composer, or open the radial fan to pick Mic, Canvas
or Narrate:

- **Type:** describe the page in a prompt. Claude builds it.
- **Say (Mic):** speak to it. Live ElevenLabs transcription fills the same prompt box.
- **Draw (Canvas):** sketch layout on a tldraw canvas. The drawing becomes a page, or refines the
  page you already have. A side preview pane shows the live output.
- **Point and narrate (Narrate):** hover or lasso what you mean and talk. The session becomes a
  clickable demo page.

Every mode produces the same JSON component tree. One React renderer shows it as a live page, and
the editor lets you click to select, drag to move, double-click to type, and ask AI to change one
element with the ✦ box. Light and dark themes. When it is done, publish the page as a single HTML
file or share a read-only link that opens on a phone.

## How we built it

- **Pointer layer:** a passive pointer tracker resolves the element under the pointer at the moment
  you start speaking (not when you finish, since the hand has moved by then). Every element carries
  a stable id and label, so a pixel position becomes a typed target. The target, the pointer and
  your words go to the intent router, and the result is applied through the same store actions as
  a manual edit, so undo works.
- **TypeSafe Jev (intent routing):** Jev routes each spoken command, deciding the action
  (restyle, resize, move, delete, add, replace text, replace media, regenerate) and which element
  "this" means, in about 60 to 200 ms. If Jev is unavailable, Claude Haiku 5.5 routes the line. If
  that fails too, keyword rules do. The server re-checks that the chosen target is one of the
  candidates it was given.
- **Perceptron (sketch reading):** Perceptron reads the canvas sketch and says what each shape is
  and where it sits. Claude then writes typed edit operations from that reading, which are
  validated before they reach the page. Without a Perceptron key, Claude reads the sketch alone.
- **Claude:** Sonnet 5.5 generates whole pages. Haiku 5.5 handles fast single-element edits and is
  the intent fallback. The model returns the tree through a tool call, and the server validates it
  before it reaches the browser.
- **ElevenLabs:** Scribe realtime transcription in the browser through a single-use token minted on
  the server, with batch transcription as a fallback. With no ElevenLabs key, voice falls back to
  browser speech recognition.
- **MongoDB Atlas (optional):** the share-link store (`MONGODB_URI`). With no connection string,
  shares are saved as local files, so the app runs without a database.
- **Canvas:** tldraw. Shapes are reduced to a small summary, with a PNG of the selection.
- **Page format:** a JSON component tree defined with Zod schemas in a shared package. The same
  schemas validate AI output, user edits, and saved shares. There is no raw model HTML.
- **Photos and icons:** Openverse stock photos scored against titles and tags, and Iconify icons.
  The server corrects guessed icon names before the page is returned.
- **App:** Vite, React 19, Tailwind 4, zustand and motion on the web. Express on the server. The
  server runs on port 3001 and the web app on port 5173.

## Challenges

- **Resolving "this".** The hand moves before the sentence ends, and two elements can overlap the
  pointer. We resolve at utterance start, prefer the smallest element under the pointer, and ask
  "Which one?" when it is still ambiguous, instead of silently doing nothing.
- **Trust in AI output.** The model sometimes invents a photo, a link, or an icon name. The server
  checks every photo search, retries with simpler wording, and tells the user when nothing matched.
- **One format for four inputs.** Sketches, speech, pointing and typing all land on the same tree.
  The schema is the single source of truth and each mode calls the same store actions.
- **Keeping edits local.** Changing one element should not regenerate the page. Single-element edits
  go through their own endpoint with a small payload and keep the user's manual styles.
- **Live demo risk.** Model calls take seconds and a live run can fail. Keys stay on the server and
  are never committed. We record a full run before judging, and if the live run fails we switch to
  replay mode (Ctrl+Shift+R), which answers the same endpoints from that recording.

## Accomplishments

- Hover plus voice edits the exact element you mean, in place, with the understanding shown first.
- Four input modes that all produce the same editable page.
- A working demo with no API keys: mock mode runs every feature end to end.
- Published pages are self-contained HTML files, with photos, uploads, styles and fonts included.
- Read-only share links that open in any browser, including on a phone.

## What's next

- Click to point with no modifier key, and pointing inside the canvas.
- Multi-page sites and collaborative editing.
- Pointing at things outside the page, such as a photo on the desktop.
- A tldraw SDK license key for production. The canvas runs on the trial key until then.

## Built with

Claude (Sonnet 5.5, Haiku 5.5) · TypeSafe Jev · Perceptron · ElevenLabs Scribe (realtime and batch) ·
MongoDB Atlas (optional) · tldraw · React 19 · Vite · Tailwind CSS 4 · zustand · motion · Zod ·
Express · Openverse · Iconify · TypeScript · pnpm

## Demo

The demo video follows `docs/demo-script.md`: a two-minute script built around the pointer
(type, point and say, swap a photo, sketch, voice, share on a phone), with a replay fallback
(Ctrl+Shift+R) for any live step that fails.
