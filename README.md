# Create: pixels become software you own

Point at a table, chart, list or schedule on the web, say or type "turn this into something I can
track", and Create hands you a live app: an editable table, a chart and an add-row form backed by
real storage. Scan the QR code on your phone, add a row, and it shows up on the laptop. DubHacks '26.

Google's pointer answers questions. Create hands you software you own, with a backend.

The same pointer works inside the app: hover an element, hold Option and say "make this bigger".
A bubble shows what Create understood, and undo is one key. Chat mode answers questions about
what you point at ("why does week 3 spike?").

See [docs/screenshots](docs/screenshots/README.md).
<!-- OWNER: add screenshots to docs/screenshots/ (lifted schedule app, QR card, Backend tab with a new row, pointer bubble) and link them here. -->
<!-- OWNER: product name decision (Create vs Lift) before submit; copy currently says Create. -->

## Features

- **Lift (Chrome extension):** hold Option over a table, list, pricing cards or a chart image on any
  page. The extension reads the pointed-at data into a typed entity (columns and up to 500 rows),
  and `POST /api/lift` turns it into a Create app. Charts that are only an image are cropped and
  read through `POST /api/extract` (Perceptron, then Claude vision, then a mock). Details in
  `apps/extension/README.md`.
- **The app you get:** an editable table, a bar or line chart, and an "Add row" form. Rows go to
  the forms store (`/api/forms/:appId`), which uses MongoDB when `MONGODB_URI` is set and local
  files otherwise. The table and chart carry a `liveFormId` that binds them to that form.
- **QR to a phone:** the Output tab and shared view have a "Scan to open" card with a QR code. A
  row added from the phone lands in the app's **Backend** tab, which polls every 3 seconds and
  flashes new rows.
- **Point and talk (Narrate):** hover an element, hold Option, say "make this bigger" or "swap
  this photo". A bubble shows the target label, the words heard, then Editing and Done. Ambiguous
  targets ask "Which one?". Edits are queued and undoable.
- **Chat | Code modes:** Chat answers questions about anything, including a figure you point at (the
  server sends a crop of it to vision). Code builds and edits the app.
- **Type, speak, sketch, narrate:** prompt composer, live voice (ElevenLabs Scribe, browser speech
  fallback) and a tldraw canvas whose sketch becomes edits.
- **Editor:** click to select, drag, resize, type in place, inspector, per-element AI box.
- **Onboarding:** a first-run path for people who ask and for developers.
- **Share and publish:** read-only links, `pnpm share:tunnel` for a phone, and one self-contained
  HTML export.
- **Replay mode:** Ctrl+Shift+R answers model calls from a recorded run. Intent and canvas-ops
  calls replay only on an exact request match.

Everything above was exercised by the headless smoke test (`node scripts/e2e/smoke.mjs`, lift,
chart and add-row included) and the extension test (`scripts/e2e/extension.mjs`). Not exercised in
a real browser session: Chrome speech and the mic button in the extension, real Perceptron and
Claude extract calls (no keys in test), and the QR scan from a physical phone. Verify before submit.

## Sponsor tech

- **Perceptron:** reads chart and image crops into a typed entity (`apps/server/src/extract/`), and
  reads canvas sketches before Claude writes edit ops. Without a key, Claude vision, then a mock.
- **MongoDB Atlas (MLH):** per-app form submissions (the rows people add) and share links
  (`MONGODB_URI`). Local files without it.
- **TypeSafe Jev:** routes each spoken line to an action and a target. When the words are deictic
  ("this", "that"), the pointed element wins; otherwise the words choose. Falls back to Claude
  Haiku, then keywords.
- **ElevenLabs Scribe:** realtime transcription with a single-use token minted by the server.
- **Claude:** builds and edits apps, polishes the title and summary of a lifted app, answers Chat.

Hackathon tracks: DubHacks NEXT, Perceptron, SideShift, MongoDB Atlas. Team: Sooraj Sambasivam, Abel Anand, pentaswan. Per-track evidence: `docs/devpost.md`.

## Quickstart (judges)

Requirements: Node 22+, pnpm 9+, Chrome for the extension.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # fill in keys, or keep MOCK_AI=1 to run with none
pnpm dev                                        # API :3001 + web :5173 (next free port if taken)
```

Open http://localhost:5173 (Vite picks the next free port if it is taken, for example 5175).
With `MOCK_AI=1` no model is called and the whole UI works with canned pages. For real output,
set `ANTHROPIC_API_KEY`, remove `MOCK_AI`, and restart the server (`.env` is read at startup).
Check `http://localhost:3001/api/health` to see which keys are present.

### Try the lift in two minutes

1. Open `chrome://extensions`, turn on Developer mode, click Load unpacked, choose `apps/extension`.
   Open the extension's options and set the web origin to the port Vite printed.
2. Open a fixture page from `apps/extension/demo/`: `route-44-schedule.html`, `dubhacks-schedule.html`,
   `dining-hours.html`, `pricing.html` or `chart.html`. For `file://` pages, enable "Allow access to
   file URLs" on the extension. Or serve the folder: `python3 -m http.server -d apps/extension/demo 8080`.
3. Hold Option over the table until it outlines, release, keep "something I can track" (or type or
   say your own), press Enter. A new tab opens with your app.
4. Add a row with the form. It appears in the table and in the Output panel's **Backend** tab.

### Phone and QR

```bash
pnpm share:tunnel                                   # prints https://<name>.trycloudflare.com (needs cloudflared)
PUBLIC_URL=https://<name>.trycloudflare.com pnpm --filter @create/server dev
```

Set `PUBLIC_URL` before lifting, or the app link points at localhost. Then lift a table, open the
Output tab, choose the QR button, and scan with a phone. Test on the venue wifi first (`docs/DEPLOY.md`).

Other tries: pick **Narrate** from the radial fan, hover the page title, hold Option and say "make
this bigger". `pnpm onboard` checks your setup. Demo flow: `docs/demo-script.md`. If a live step
fails, press Ctrl+Shift+R for replay mode.

## Environment variables (names only, in `apps/server/.env`)

| Name | Required | Purpose and fallback |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | For real output | Claude generates pages and edits. Without it, canned mock screens and keyword intent |
| `MOCK_AI` | No | `1` = no model calls |
| `TYPESAFE_API_KEY` | No | TypeSafe Jev intent routing. Without it, Claude Haiku then keywords route commands |
| `PERCEPTRON_API_KEY` | No | Perceptron reads canvas sketches. Without it, Claude reads the sketch alone |
| `ELEVENLABS_API_KEY` | No | ElevenLabs Scribe realtime voice. Without it, voice falls back to browser speech |
| `MONGODB_URI` | No | Share links in Atlas. Without it, local files in `apps/server/.data/prototypes/` |
| `YOUTUBE_API_KEY` | No | Live YouTube data |
| `CLAUDE_MODEL`, `CLAUDE_BUILD_EFFORT`, `CLAUDE_EDIT_EFFORT` | No | Model and thinking effort. Default model `claude-sonnet-5-5` |
| `PERCEPTRON_MODEL`, `DEMO_PLAN_MODEL`, `CANVAS_OPS_FAST`, `DEMO_FAST` | No | Tuning for sketch and demo calls |
| `PUBLIC_URL` | No | Public origin for share links (phone sharing) |
| `PORT` | No | API port, default `3001` |
| `VITE_TLDRAW_LICENSE_KEY` | No | tldraw license, set in the web app env. The canvas runs on the trial without it |

Never commit `.env`. Keys stay on the server.

## Ports

| Service | Port | Notes |
| --- | --- | --- |
| Web (Vite) | 5173 (default) | proxies `/api` to the API |
| API (Express) | 3001 | override with `PORT` |

## Layout

```
packages/shared   Zod schemas: Screen / Node tree, request + response shapes, mock screen
apps/server       Express: POST /api/generate (Claude structured output), POST /api/transcribe (Scribe)
apps/web          Vite + React: mode switcher, renderer, composer, modes/{text,voice,canvas,narrate}
```

## The contract every mode shares

`packages/shared/src/schema.ts` is the single source of truth. A `Screen` has a title, theme,
brand `accent`, `font` and a tree of nodes. Element types:

| Group | Types |
| --- | --- |
| Text | heading, text, badge, list, table (optional `liveFormId`), accordion (FAQ) |
| Data | chart (bar or line, 1 to 4 series, optional `liveFormId`) |
| Actions | button, link (both take an `icon` and an `href`: `#section-id`, https, mailto, tel) |
| Media | image (stock `query` or uploaded `src`, sizes from logo to full), avatar, icon (any Iconify icon), video (YouTube/Vimeo), map (address) |
| Social proof | rating |
| Forms | textbox, select, checkbox (visual only) |
| Layout | container (row/column, wrap, background preset or photo with overlay), divider, spacer |

Every node takes an optional `style` (colors, gradient, radius, shadow, border, font size and
weight, alignment, italic, grayscale/sepia filter) and `widthPct`. Most props have defaults, so
hand-written trees can stay short; run them through `ScreenSchema.parse` to fill defaults.

How the AI produces pages: Claude returns the tree as the input of a `render_screen` tool call
(`replace_element` for single-element edits). The server cleans small mistakes
(`packages/shared/src/sanitize.ts`), validates with Zod, and sends any remaining errors back to
Claude for one repair. There is no structured-output grammar limit, so new element types can be
added to the schema directly; add a renderer case in `apps/web/src/components/elements.tsx` and
inspector fields in `apps/web/src/editor/Inspector.tsx`.

Resources the AI relies on:

- **Photos**: Openverse search via `GET /api/image?q=…` (404 when nothing relevant exists, shown as a
  "No photo found" placeholder). Results are scored against each photo's title and tags. Before
  answering, the server checks every photo search, retries simpler wording, and tells the user
  when nothing matched, so the AI never claims a photo changed when it didn't. Cached in
  `apps/server/.cache`.
- **Icons**: Iconify. Names the model guesses are checked and corrected (`apps/server/src/icons.ts`);
  the inspector searches by style (line, solid, cartoon, 3D, brand) via `GET /api/icons/search`.
- **The user's files**: `POST /api/upload` (PNG, JPG, WebP, GIF), served from `/api/uploads/…` and
  passed to the AI as `<assets>` so "put my logo in the nav" works.
- **Web pages**: when a prompt contains a URL, Claude may fetch it (e.g. an existing site or menu).

To add a mode:

1. Create `apps/web/src/modes/<name>/<Name>Mode.tsx` and wire it in `App.tsx` and `ModeSwitcher.tsx`
   (Canvas and Narrate already have stubs).
2. Produce a screen one of two ways:
   - **Directly** (e.g. Canvas): build a `Screen` and call
     `useScreenStore.getState().setScreen(screen, "what changed")`.
   - **Through the model** (e.g. Narrate): call `useScreenStore.getState().generate(prompt)`, or
     `editNodeWithAI(nodeId, prompt)` to change one element.
3. Voice helpers you can reuse: `lib/useRecorder.ts` (MediaRecorder + level meter) and
   `lib/api.ts#transcribe(blob)`.

## Extension and sharing

Load `apps/extension` unpacked in Chrome (see `apps/extension/README.md`). It sends a typed entity
to `POST /api/lift` (or a chart crop to `POST /api/extract` first) and opens the returned link. The
server never fetches the source page. The server's CORS list allows `chrome-extension://` origins
on the legacy import path only; lift and extract calls are made from the extension's background
worker (its `<all_urls>` host permission). Set `ALLOWED_ORIGINS` for extra web origins. The headless
extension test passes (12/12); a hands-on run in your own Chrome profile has not been done.
OWNER: confirm it loads and lifts the fixture pages in real Chrome before claiming it in the demo.

Phone sharing: start `pnpm dev`, run `pnpm share:tunnel` (needs `cloudflared`), set `PUBLIC_URL`
to the printed URL, restart the API. See `docs/DEPLOY.md`.

Vercel: root `vercel.json` builds `apps/web` and rewrites `/api/*` to `api/index.ts`, which exports
the Express app. This route is untested on Vercel; OWNER: deploy a preview before relying on it.

## Known issues

- At 1440x900 with the right panel open, the radial fan's Canvas and Narrate items can sit under
  the Run log summary and not take real clicks.
- The hover bubble label can be a raw node description instead of a short name like "Heading".
- Lift links use `PUBLIC_URL`, then the request Origin, then `http://localhost:5173`. Set `PUBLIC_URL` for any phone demo.
- Lifted tables and charts are read from the page you pointed at. Values read from a chart image are approximate; use a DOM table when exact numbers matter.
- Chart labels and values from an AI edit are not padded to equal length.

## Publishing

**Publish** in the canvas title bar downloads the page as one self-contained HTML file
(`apps/web/src/lib/exportSite.ts`): it is captured from Preview, stock photos are swapped for their
real URLs, uploads are embedded, styles and fonts are inlined, and section links get real ids.
The menu explains how to put it online for free by dragging the file onto Netlify Drop.

## API

All routes are under `/api`.

| Route | Purpose |
| --- | --- |
| `POST /generate` `{ prompt, screen?, history?, assets? }` | Build or refine a page, `{ summary, screen }` (streams partial frames) |
| `POST /edit-node` `{ prompt, screen, nodeId, assets? }` | Rewrite one element, `{ summary, nodes }` |
| `POST /route-intent` `{ text, candidates, pointer? }` | Route a spoken line: action and target (Jev, then Haiku, then keywords) |
| `POST /lift` `{ entity, instruction? }` | Typed entity to a live app, `{ id, url, formId, provider }` (rate limited, 1 MB body) |
| `POST /extract` `{ image, hint? }` | Chart or image crop (data URL, up to 4 MB) to an entity, `{ entity, provider }` (perceptron, claude or mock) |
| `POST /forms/:appId` `{ formId, fields }` | Store a submitted row (the add-row form) |
| `POST /forms/:appId/token`, `GET /forms/:appId` | Owner read token, then list stored rows (Bearer token) |
| `POST /ask` | Chat-mode answer, optionally about a pointed-at crop |
| `POST /import-element` | Chrome extension snapshot to a Create prototype, `{ id, url }` |
| `POST /canvas-ops` | Turn a canvas selection (PNG and shapes) into typed edit ops (Perceptron, then Claude) |
| `POST /generate-sketch` | Sketch to page |
| `POST /demo` | Narrate session to a clickable demo page |
| `POST /transcribe` multipart `audio` | Batch speech to text, `{ text }` |
| `GET /voice-token` | Single-use ElevenLabs realtime token |
| `POST /upload` multipart `file` | Upload PNG, JPG, WebP, GIF, `{ url, name }` |
| `GET /image?q=` and `GET /image/resolve?q=` | Matching stock photo (404 if none) |
| `GET /icons/search?q=&style=` and `GET /icons/svg` | Icon search and SVG |
| `POST /prototypes`, `GET /prototypes/:id` | Save and load share links |
| `GET /live`, `GET /live/:id` | Live data (allow-listed sources) |
| `GET /health` | Which keys are present and whether mock mode is on |

Errors come back as `{ error: string }` with a meaningful status (400, 404, 422, 429, 502, 503).

## Visual editor

After a screen is generated, the canvas is editable (toggle Edit / Preview in its title bar):

- Click to select; the right-hand inspector edits content, layout, colors, corners and width.
- Double-click text (or press Enter) to type over it in place.
- Drag any element to move it, including into or out of groups. Blue lines show where it lands.
- Pull the handle on a selected element's right edge to resize it (snaps to 5%; double-click resets).
- Add elements from the **+ Add** menu; they go after the selection, or inside a selected box.
- ⌘Z / ⌘⇧Z undo and redo, ⌘D duplicates, Delete removes, Esc deselects.
- A ✦ box appears under the selected element (press `/` to focus it). Requests there go to
  `POST /api/edit-node`, which rewrites only that element, can add siblings next to it or remove it,
  and returns in a few seconds. The bottom composer still changes the whole page.
- Manual styles are preserved when the AI regenerates.

Editor code lives in `apps/web/src/editor/` and `components/ScreenRenderer.tsx`. Tree edits go
through the immutable helpers in `packages/shared/src/tree.ts`, so other modes can reuse them.
