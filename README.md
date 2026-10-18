# Create: point at it, say it, it changes

A website builder where the input is natural: type a prompt, speak it, draw shapes, or **point at
an element and talk** ("make this bigger", "swap this photo"). Every mode produces the same
**JSON component tree**, which one React renderer turns into a live page. DubHacks '26.

Inspired by the Google DeepMind AI pointer: the pointer supplies "this" and "that", the voice
supplies the change, and the edit happens in place. A bubble shows what Create understood.

See [docs/screenshots](docs/screenshots/README.md).
<!-- OWNER: add screenshots to docs/screenshots/ (pointer bubble, canvas sketch, phone share) and link them here. -->

## Features

- **Point and talk (Narrate):** hover an element, hold Option, say "make this bigger" or "swap this
  photo". A bubble shows the target label, the words heard, then Editing and Done. Ambiguous
  targets ask "Which one?". Shift+drag selects several elements. Edits are queued and undoable.
- **Chat | Code modes (verify before submit):** Chat answers questions about anything, including a figure you point at; Code builds and edits the page.
- **AI pointer (verify before submit):** click to pin a target, or hold Option to talk.
- **Per-app Backend (verify before submit):** form submissions on a built page are stored in MongoDB (file fallback) and listed in the app's Backend panel.
- **Onboarding (verify before submit):** first-run paths for technical and non-technical users.
- **Type, speak, draw:** prompt composer, live voice (ElevenLabs Scribe, browser speech fallback),
  and a tldraw canvas whose sketch (plus dropped sections, icons and photos) becomes edits.
- **Editor:** click to select, drag, resize, type in place, inspector, per-element AI box.
- **Chrome extension:** point at any website, optionally say or type a change, and open it in
  Create as an editable prototype (`apps/extension/README.md`).
- **Share:** read-only links; `pnpm share:tunnel` exposes the dev server for a phone.
- **Publish:** one self-contained HTML file.
- **Replay mode:** Ctrl+Shift+R answers model calls from a recorded run. Intent and canvas-ops
  calls replay only on an exact request match.

## Sponsor tech

- **TypeSafe Jev:** routes each spoken line to an action and a target. Pointer deixis: when the
  pointer's element is one of the candidates and Jev judges the words are deictic ("this", "that"),
  the pointed element wins; otherwise the words choose. Falls back to Claude Haiku, then keywords.
- **Perceptron:** reads canvas sketches (what each shape is and where) before Claude writes edit ops.
- **ElevenLabs Scribe:** realtime transcription with a single-use token minted by the server.
- **MongoDB Atlas (MLH):** share links and per-app form submissions (`MONGODB_URI`); local files without it.

Hackathon tracks: DubHacks NEXT, Perceptron, SideShift, MongoDB Atlas. Team: Sooraj Sambasivam, Abel Anand, pentaswan. Per-track evidence: `docs/devpost.md`.

## Quickstart (judges)

Requirements: Node 22+, pnpm 9+.

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # fill in keys, or keep MOCK_AI=1 to run with none
pnpm dev                                        # API :3001 + web :5173 (next free port if taken)
```

Open http://localhost:5173 (default web port; Vite picks the next free port if it is taken).
With `MOCK_AI=1` no model is called and the whole UI works with canned pages. For real output,
set `ANTHROPIC_API_KEY`, remove `MOCK_AI`, and restart the server (`.env` is read at startup).
Check `http://localhost:3001/api/health` to see which keys are present.

Try it: pick **Narrate** from the radial fan, hover the page title, hold Option and say
"make this bigger". `pnpm onboard` checks your setup. Demo flow: `docs/demo-script.md`.
If a live step fails, press Ctrl+Shift+R for replay mode.

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
| Text | heading, text, badge, list, table, accordion (FAQ) |
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

Load `apps/extension` unpacked in Chrome (see `apps/extension/README.md`). It posts a structural
snapshot of the clicked element to `POST /api/import-element`, which returns a Create link. The
server allows `chrome-extension://` origins on that path only (any extension ID; set
`ALLOWED_ORIGINS` for extra web origins). The extension has not been tested in a real Chrome yet.
OWNER: confirm it loads and imports before claiming it in the demo.

Phone sharing: start `pnpm dev`, run `pnpm share:tunnel` (needs `cloudflared`), set `PUBLIC_URL`
to the printed URL, restart the API. See `docs/DEPLOY.md`.

Vercel: root `vercel.json` builds `apps/web` and rewrites `/api/*` to `api/index.ts`, which exports
the Express app. This route is untested on Vercel; OWNER: deploy a preview before relying on it.

## Known issues

- At 1440x900 with the right panel open, the radial fan's Canvas and Narrate items can sit under
  the Run log summary and not take real clicks.
- The hover bubble label can be a raw node description instead of a short name like "Heading".

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
