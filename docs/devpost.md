# Create

**Tagline:** Point at it. Say it. It changes.

Repository: `create-dev`. The product is called **Create** in the UI.

**Tracks:** DubHacks NEXT · Perceptron · SideShift · MongoDB Atlas (MLH)
**Video:** OWNER: paste the 2-minute video link here. **Repo:** OWNER: confirm the repo is public.
**Live site:** OWNER: paste the domain / Vercel URL here once deployed (CLI auth must be refreshed first).

Status key: items marked **(verify before submit)** are built but not yet confirmed in a real
browser. Delete the mark when confirmed, or delete the claim.

## Inspiration

Describing a change in words is slow. You say "the third card, no, the one on the left, make it
bigger" and the tool still guesses. People already do this with each other: they point and say
"fix this". Google DeepMind's AI pointer idea is the same move for software: the pointer supplies
the "this" and the "that", the voice supplies the change, and the edit happens in place.

We built that for websites and small apps. A shop owner needs a page with opening hours and a menu.
The fastest way to change it is to hover on the part you mean and say what you want.

## What it does

**Point at it. Say it. It changes.** Hover any element and talk: "make this bigger", "swap this
photo for a cupcake". A bubble follows the pointer and shows what Create understood, the words it
heard, then Editing, then Done. If two elements are equally close it asks "Which one?" instead of
guessing. Undo is one key.

- **Four ways in:** type, speak (live ElevenLabs transcription), draw (tldraw canvas), or point and
  narrate. All produce the same editable page.
- **Chat | Code modes (verify before submit):** **Chat** answers questions about anything,
  including a figure or chart you point at. **Code** builds and edits the page.
- **AI pointer (verify before submit):** click to pin a target, or hold Option to talk to whatever
  is under the pointer.
- **Per-app Backend (verify before submit):** each app gets a Backend panel. Form submissions on a
  published page are real and are stored in MongoDB, then listed back in the panel.
- **Onboarding (verify before submit):** a short first-run path for technical users (keys, local
  run) and non-technical users (start from a prompt, no setup words).
- **Chrome extension (verify before submit):** point at any website, say or type a change, and open
  it in Create as an editable prototype.
- **Editor, share, publish:** click to select, drag, resize, type in place, a per-element AI box.
  Publish one self-contained HTML file, or share a read-only link that opens on a phone.

## Track evidence

**DubHacks NEXT.** The hackathon asks what comes next for how people use software. Our answer is
that the pointer and the voice replace the prompt box. Concrete: hover plus Option plus a spoken
sentence edits the exact element under the pointer, in place, with the understanding shown first.
It works with no API keys (mock mode runs every feature), published pages are one self-contained
HTML file, and share links open on a phone. Nothing in the demo needs a developer.

**Perceptron.** Perceptron is the vision step for the canvas. You sketch a wide header box, two
cards and a button; `POST /api/canvas-ops` sends the shapes plus a PNG of the selection to
Perceptron, which says what each shape is and where it sits. Claude then writes typed edit
operations from that reading, and the server validates them before they reach the page. Replay
tests match canvas-ops requests exactly (`apps/server/src/routes/canvasOps.test.ts`). Without a
Perceptron key, Claude reads the sketch alone.

**SideShift.** SideShift is about tools that let a side project become real fast. Create takes a
non-coder from an idea to a page that works: a Backend per app, real form submissions stored in a
database, a Chrome extension that turns any site into an editable starting point, and a published
HTML file or share link at the end. (verify before submit: Backend panel, form storage and extension
in the browser.) OWNER: confirm the SideShift track brief wording and trim this paragraph to match.

**MongoDB Atlas (MLH).** Atlas holds two things: share links (`apps/server/src/store/prototypes.ts`)
and per-app form submissions (`apps/server/src/forms/store.ts`, newest first, capped at 200 per
app, app ids validated against `^[A-Za-z0-9_-]{1,40}$` before any query). Both stores have tests
and fall back to local JSON files when `MONGODB_URI` is unset, so the app runs without a database.
(verify before submit: a real submission appears in the Atlas collection.) OWNER: add the cluster
screenshot and collection name.

## How we built it

- **Pointer layer:** a passive tracker resolves the element under the pointer at the moment you
  start speaking, not when you finish. Every element has a stable id and label, so a pixel
  position becomes a typed target. Edits go through the same store actions as manual edits, so
  undo works.
- **TypeSafe Jev:** routes each spoken command (restyle, resize, move, delete, add, replace text or
  media, regenerate) and decides which element "this" means, in about 60 to 200 ms. Falls back to
  Claude Haiku 5.5, then keyword rules. The server re-checks the target is one of the candidates.
- **Perceptron:** reads canvas sketches; Claude writes validated edit ops from that.
- **Claude:** Sonnet 5.5 generates pages (streamed as NDJSON partials). Haiku 5.5 does fast
  single-element edits and the intent fallback. The model returns the tree through a tool call.
- **Page format:** a JSON component tree defined with Zod in a shared package. The same schemas
  validate AI output, user edits and saved shares. No raw model HTML.
- **Backend and Chat:** `/api` form routes store submissions per app id; an `ask` route answers
  Chat-mode questions. (verify before submit)
- **Chrome extension:** plain-JS Manifest V3. It sends a sanitized snapshot of the clicked element
  to `/api/import-element`; the server never fetches the source site.
- **ElevenLabs Scribe:** realtime transcription with a single-use server-minted token; browser
  speech recognition as fallback.
- **Live data, icons, photos:** a live-data element with route-gated generation, an icons proxy
  with a 24 h disk cache, Openverse photos scored against titles and tags.
- **App:** Vite, React 19, Tailwind 4, zustand, motion; Express server (3001), web (5173). Vercel
  config is in the repo and untested. OWNER: deploy a preview.

## Team

- **Sooraj Sambasivam:** integration and product: composer shell, pointer and Narrate, Jev intent
  routing with Perceptron canvas ops, Chat and Backend panels, extension import route, share and
  publish, onboarding, replay mode.
- **Abel Anand:** the page engine: Screen schema, renderer, visual editor and server, streaming
  page generation, the icons proxy and the live-data element.
- **pentaswan:** the drawing canvas and Inkframe ideas, the sketch vision route prototype, and the
  sandboxed backend-functions prototype that shaped the Backend idea.

## Challenges

- **Resolving "this".** The hand moves before the sentence ends and elements overlap. We resolve at
  utterance start, prefer the smallest element, and ask "Which one?" when still ambiguous.
- **Trust in AI output.** Models invent photos, links and icon names. The server checks every photo
  search, corrects icon names, and tells the user when nothing matched.
- **One format for many inputs.** Sketches, speech, pointing, typing and extension imports all land
  on the same tree; the schema is the single source of truth.
- **Real submissions from a generated page.** A form must post somewhere safe: per-app ids are
  validated, bodies size-limited, and storage has a file fallback.
- **Live demo risk.** Model calls take seconds. Keys stay on the server. We record a full run and
  keep a replay mode (Ctrl+Shift+R) that answers the same endpoints from it.

## Accomplishments

- Hover plus voice edits the exact element you mean, with the understanding shown first.
- Sketch, speech, pointing and typing all produce the same editable page.
- Forms on a built page store real submissions in MongoDB (verify before submit).
- Runs end to end with no keys in mock mode; self-contained published pages; phone share links.

## What we learned

- The pointer is the missing half of a voice command: "this" is worth more than any adjective.
- Showing what the system understood before acting makes people trust it enough to try again.
- A strict shared schema lets four different inputs and three teammates' work meet without glue.
- Every AI step needs a deterministic fallback, or the demo is hostage to the network.

## What's next

- Click to point with no modifier key, and pointing inside the canvas.
- Pointing at things outside the page, such as a photo on the desktop.
- Multi-page sites and collaborative editing.
- A tldraw SDK license key for production (trial key until then).

## Built with

Claude (Sonnet 5.5, Haiku 5.5) · TypeSafe Jev · Perceptron · ElevenLabs Scribe · MongoDB Atlas ·
tldraw · React 19 · Vite · Tailwind CSS 4 · zustand · motion · Zod · Express · Vercel · Openverse ·
Iconify · Chrome extension (Manifest V3) · TypeScript · pnpm

## Demo

The video follows `docs/demo-script.md`: type a prompt, point and say, swap a photo, sketch, then a
Chat question and a form submission landing in the Backend panel, with replay (Ctrl+Shift+R) as the
fallback for any live step.
