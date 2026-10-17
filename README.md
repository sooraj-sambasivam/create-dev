# Create — describe it, say it, draw it

A website builder where the input is natural: type a prompt, speak it, draw shapes, or point and
narrate. Every mode produces the same **JSON component tree**, which one React renderer turns into
a live screen. DubHacks '26.

## Run it

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # then fill in keys (or leave MOCK_AI=1)
pnpm dev                                        # server :3001 + web :5173
```

Open http://localhost:5173. With `MOCK_AI=1` the server returns a canned screen, so the whole UI
works before anyone has an API key.

| Env var (apps/server/.env) | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude, generates the screen tree (set `MOCK_AI=0` to use it) |
| `CLAUDE_BUILD_EFFORT` / `CLAUDE_EDIT_EFFORT` | thinking effort for new pages (default `medium`, ~15-20 s) and edits (default `low`, ~2-4 s) |
| `CLAUDE_MODEL` | default `claude-sonnet-5-5` (~14 s per page); `claude-haiku-5-5` is ~8 s and still solid; `claude-opus-5-5` for the richest layouts |
| `ELEVENLABS_API_KEY` | ElevenLabs Scribe, transcribes voice recordings |
| `MOCK_AI` | `1` = no model calls, canned screen |

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

## Publishing

**Publish** in the canvas title bar downloads the page as one self-contained HTML file
(`apps/web/src/lib/exportSite.ts`): it is captured from Preview, stock photos are swapped for their
real URLs, uploads are embedded, styles and fonts are inlined, and section links get real ids.
The menu explains how to put it online for free by dragging the file onto Netlify Drop.

## API

`POST /api/generate` `{ prompt, screen?, history?, assets? }` → `{ summary, screen }`
`POST /api/edit-node` `{ prompt, screen, nodeId, assets? }` → `{ summary, nodes }`
`POST /api/transcribe` multipart `audio` → `{ text }`
`POST /api/upload` multipart `file` → `{ url, name }`
`GET /api/image?q=…&seed=…` → redirect to a matching photo (404 if none)
`GET /api/image/resolve?q=…&seed=…` → `{ url }` (used by Publish)
`GET /api/icons/search?q=…&style=line|solid|cartoon|3d|brand` → `{ icons }`
`GET /api/health` → which keys are present and whether mock mode is on

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
