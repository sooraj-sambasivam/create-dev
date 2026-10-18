# Create

**Tagline:** Pixels become software you own.

Repository: `create-dev`. The product is called **Create** in the UI. OWNER: final name decision
(Create or Lift) before pasting this into Devpost.

**Tracks:** DubHacks NEXT · Perceptron · SideShift · MongoDB Atlas (MLH)
**Video:** OWNER: paste the 2-minute video link here. **Repo:** OWNER: confirm the repo is public.
**Live site:** OWNER: paste the domain / Vercel URL here if deployed. The demo runs locally with a phone tunnel, so this can stay empty.
**Atlas screenshot:** OWNER: add the collection screenshot (see MongoDB Atlas below).

Status key: items marked **(verify before submit)** are built and covered by headless tests but not
yet confirmed by hand in a real browser or on a phone. Delete the mark when confirmed, or delete the claim.

## Inspiration

The web is full of useful data that you can only read. A bus schedule, a dining hall's hours, a
pricing table, a chart in a report. You can't add to it, sort it your way, chart it, or let a
friend add a row. Today the choices are copy it into a spreadsheet by hand or give up.

Google DeepMind's AI pointer showed that the pointer can supply "this" and your voice can supply
the intent. The pointer in Google's version answers questions. We wanted it to hand you something
you keep: software you own, with a backend.

## What it does

**Point at it, say "turn this into something I can track", and get a live app.**

1. In Chrome, hold Option over a table, list, pricing cards or a chart image. It outlines the
   thing and names it ("Table · 12 rows × 4 cols").
2. Release, and say or type what you want. The default is "something I can track".
3. A new tab opens with your app: an editable table, a chart, and an "Add row" form. The rows are
   stored for real, in MongoDB when `MONGODB_URI` is set.
4. Show the QR code, and someone scans it. They add a row from their phone, and it appears in your
   app's Backend tab within seconds (the tab polls every 3 seconds). (verify before submit: scan from a physical phone on venue wifi)

It does not stop there. Inside the app, the same pointer works:

- **Make this bigger.** Hover an element, hold Option, say it. A bubble shows what Create
  understood, and undo is one key. If two elements are equally close it asks "Which one?".
- **Ask about it.** In Chat mode, point at the chart and ask "why does week 3 spike?". The answer
  uses the row data and a crop of what you pointed at. (verify before submit with real keys; mock mode returns a canned answer)
- **Four ways in:** Type, Speak, Sketch, Narrate. All produce the same editable app.

Where the source is a chart that is only an image, with no data in the page, we crop it and read
it with Perceptron (`/api/extract`), then build the same app. Values read from an image are
approximate, and we say so. Exact numbers come from DOM tables.

## Track evidence

**DubHacks NEXT.** The next step for software is that read-only things become yours. Hold Option
and speak one sentence; a schedule becomes an app with a backend, with no prompt box and no setup.
Concrete and checkable: `scripts/e2e/smoke.mjs` lifts a 3-row schedule, checks the table and chart
render, submits a row through the Add-row form and sees it appear in the table and in
`/api/forms/:id` (14 of 14 checks pass; the extension test passes 12 of 12). Everything runs with
no keys in mock mode.

**Perceptron.** Perceptron is the eyes of the lift. `POST /api/extract` takes a PNG or JPEG crop
(up to 4 MB) of a chart or image and returns a typed entity: kind, title, columns and rows. It
falls back to Claude vision and then to a mock, and reports which one answered (`provider`). The
same Perceptron step reads canvas sketches for edit ops. (verify before submit: a live Perceptron
call with the real key; our tests stub the network.) OWNER: confirm with the Perceptron table
that a non-robot entry is eligible.

**SideShift.** A side project needs a place to put its data. A lifted app arrives with a form, a
store and a Backend tab, so the person who has a schedule, a roster or a price list can have
something that works today and share it with a QR code. One-line business: Every portal, PDF and
screenshot is read-only. Create is the free pointer, and a $9 to $19 per month hosted backend is
the business, with a "remix in Create" button on every shared app. We have no users or revenue yet.
OWNER: confirm the SideShift brief wording and trim this to match.

**MongoDB Atlas (MLH).** Every row a person adds is a document: per-app submissions are stored in
Atlas (`apps/server/src/forms/store.ts`, newest first, capped at 200 per app, app ids validated
against `^[A-Za-z0-9_-]{1,40}$` before any query). Lifted apps and share links live in the same
database (`apps/server/src/store/prototypes.ts`). Both stores have tests and fall back to local
JSON files when `MONGODB_URI` is unset. (verify before submit: a real submission appears in the
Atlas collection.) OWNER: add the cluster screenshot and collection name.

## How we built it

- **Typed entity.** The extension reads the pointed-at element into
  `{kind: table|chart|list|schedule, title, columns[{key,label,type}], rows[≤500], source}`. Column
  types (text, number, money, date, time, percent) come from the cells. This is the Zod
  `EntitySchema` in `packages/shared/src/integration.ts`; the server never fetches the source page.
- **Lift.** `POST /api/lift` validates the entity, asks Claude Haiku only to polish the title and
  a one-line summary (never the rows), converts the entity to a Screen (`entityToScreen`), saves it
  and returns a link. Without a key the copy comes from the entity itself.
- **One page format.** A JSON component tree defined with Zod in a shared package; table and chart
  nodes carry a `liveFormId` that binds them to a form's stored rows. No raw model HTML.
- **Storage.** `POST /api/forms/:appId` stores a row; reads need a token from
  `POST /api/forms/:appId/token`. MongoDB when configured, files otherwise.
- **Pointer layer.** A passive tracker resolves the element under the pointer when you start
  speaking, not when you finish. TypeSafe Jev routes the line to an action and a target in about
  60 to 200 ms, falling back to Claude Haiku, then keywords. Edits use the same store actions as
  manual edits, so undo works.
- **Chat.** `POST /api/ask` answers with the app's data and, if you pointed, an image crop.
- **Chrome extension.** Plain-JS Manifest V3; the background worker makes the API calls and
  captures chart crops from a tab screenshot.
- **Voice.** ElevenLabs Scribe realtime with a server-minted single-use token; browser speech as fallback.
- **App.** Vite, React 19, Tailwind 4, zustand, motion; Express server; a shared design-token file
  (`apps/web/src/ui/styles.ts`) for all UI.

## Team

- **Sooraj Sambasivam:** integration and product: composer shell, pointer and Narrate, Jev intent
  routing, Chat and Backend, the lift flow and extension, share and QR, onboarding, replay mode.
- **Abel Anand:** the page engine: Screen schema, renderer, visual editor, streaming generation,
  the icons proxy and the live-data element.
- **pentaswan:** the drawing canvas, the sketch vision route prototype, and the sandboxed
  backend-functions prototype that shaped the Backend idea.

## Challenges

- **Exact data from a screen.** Images lose precision. We use DOM tables where they exist, use
  vision only for chart images, and never claim exact values from an image.
- **Resolving "this".** The hand moves before the sentence ends and elements overlap. We resolve at
  utterance start, prefer the smallest element, and ask "Which one?" when still ambiguous.
- **A real backend from a generated page.** Per-app ids are validated, bodies size-limited, reads
  need a token, and storage has a file fallback.
- **Phone links.** A link built on localhost is useless on a phone. Links use `PUBLIC_URL`, so the
  demo runs behind a tunnel, and the QR code is dark on white in both themes so scanners accept it.
- **Live demo risk.** Model calls take seconds and keys stay on the server. We record a full run and
  keep a replay mode (Ctrl+Shift+R).

## Accomplishments

- A web table becomes an app with a chart, a form and a store in one spoken sentence.
- The headless smoke test covers lift, chart render, add row and storage (14 of 14 pass); server
  (253), web (500) and shared (23) unit tests pass; the extension test passes 12 of 12.
- The pointer works in two places: on the web page you lift from, and inside the app you get.
- Runs end to end with no keys in mock mode.

## What we learned

- Pointing is more useful when it ends in something you keep, not an answer you read once.
- Showing what the system understood before acting makes people trust it enough to try again.
- A strict shared schema let three teammates' work and several inputs meet without glue.
- Every AI step needs a deterministic fallback, or the demo is hostage to the network.

## What's next

- Rehearsed on our sample pages today; broader coverage of real sites, PDFs and screenshots.
- Hosted backend with accounts, and the "remix in Create" button on shared apps.
- Click to point with no modifier key, and pointing at things outside the browser.
- A tldraw SDK license key for production (trial key until then).

## Built with

Claude (Sonnet 5.5, Haiku 5.5) · Perceptron · TypeSafe Jev · ElevenLabs Scribe · MongoDB Atlas ·
tldraw · React 19 · Vite · Tailwind CSS 4 · zustand · motion · Zod · Express · Openverse ·
Iconify · Chrome extension (Manifest V3) · TypeScript · pnpm

## Demo

The video follows `docs/demo-script.md`: lift a schedule, the live app, a row added from a phone via
QR, a Chat question about the chart, "make this bigger" with undo, then the startup line. Replay
(Ctrl+Shift+R) is the fallback for any flaky model call.
