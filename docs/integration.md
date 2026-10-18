# Integration notes: Create (repo `create-dev`) on top of Abel's builder

The product is called **Create** in the UI. The repository stays `create-dev`.

This branch (`integrate`, based on Abel's branch) adds a product shell and four input modes on top of
the core builder described in `README.md`. Every mode still produces the same Screen JSON tree,
validated by the Zod schemas in `packages/shared`, and rendered by one React renderer.

## Who it is for and what is settled

Team decisions that this doc follows:

- **User:** non-coders and small businesses. Copy and demo steps are written for them, not developers.
- **Theme:** light and dark shell, with a toggle in the header. It cycles Light, Dark, System.
- **Modes:** a radial fan only (Mic, Canvas, Narrate). No visible mode switcher text above the composer,
  and no Chat | Work switch. Each fan entry must fully start its mode.
- **Canvas:** a side preview pane on the right, toggleable, showing the live output.
- **Narrate keys:** Shift and drag to lasso; Option to talk or lock. The Fn hint is removed.
- **Models:** Sonnet 5.5 builds whole pages; Haiku 5.5 handles single-element edits and intent routing.
- **Share links:** MongoDB Atlas through `MONGODB_URI`, with a local file store when it is unset.
- **Run:** localhost. Keys live in one shared team `.env`, are never committed, and stay on the server.
  Each key has a $10 spending cap.
- **Demo fallback:** replay mode (Ctrl+Shift+R) plus a recorded full run, made before judging.

## What was added

| Area | What it does | Main location |
| --- | --- | --- |
| App shell | Light and dark grey shell, white working card, sidebar, header, chat menu. Follows `DESIGN.md` tokens and lucide icons at 18px / stroke 1.75. | `apps/web/src/shell/` |
| Composer + radial fan | Bottom prompt composer. A radial "go" fan picks the mode (Mic, Canvas, Narrate) and the model/effort settings. The fan is the only mode control. | `apps/web/src/shell/composer/` |
| Canvas studio | tldraw canvas. Draw shapes, send a PNG plus shape summaries to the server, and get a Screen back (or refine the current one). A toggleable side preview pane shows the live output. | `apps/web/src/modes/canvas/`, `apps/server/src/routes/sketch.ts`, `apps/server/src/ai/sketch/` |
| Narrate mode | Point and narrate. Shift-drag lasso on the page or canvas, then speak within 4 seconds to link the words to the target. The session becomes a clickable demo page (streamed NDJSON progress). | `apps/web/src/modes/narrate/` |
| Output / backend pane | Shows the generated backend as a map (diagram layout of data and routes) next to the page. | `apps/web/src/shell/output/` |
| Share links | Save a Screen and open it read-only at `/?p=<id>`. Stored in MongoDB Atlas, or in local files when `MONGODB_URI` is unset. | `apps/server/src/store/prototypes.ts`, `apps/server/src/routes/share.ts`, `apps/web/src/share/` |
| ElevenLabs realtime voice | Single-use realtime Scribe token from the server, then live transcription in the browser. Falls back to batch Scribe when realtime is unavailable. | `apps/web/src/modes/voice/`, `docs/elevenlabs.md` |

Abel's core (schema, renderer, editor, generation, icons, images, export) is reused, not replaced.
The new modes call `useScreenStore.getState().setScreen(...)` or `generate(...)`, as the README
describes for adding a mode.

## Shared contracts

`packages/shared/src/integration.ts` holds the contracts for the new features. Client and server
both import it, so change it only together with both sides.

| Contract | Endpoint | Shape |
| --- | --- | --- |
| `SketchRequestSchema` | `POST /api/generate-sketch` | `{ image, shapes[], prompt?, screen? }` → `GenerateResponse` `{ summary, screen }` |
| `NarrationSessionSchema` | `POST /api/demo` (NDJSON) | `{ session, screen? }`; lines are `DemoChunk`: `step`, `result`, or `error` |
| `IntentRequestSchema` | `POST /api/route-intent` | `{ transcript, candidates[] }` → `IntentResult` (`isCommand`, `targetId`, `action`, `confidence`) |
| `VoiceTokenResult` | `GET /api/voice-token` | `{ provider: "elevenlabs", token, model, expiresInSec }` or `{ provider: "batch", reason }` |
| `SharePrototypeRequestSchema` | `POST /api/prototypes`, `GET /api/prototypes/:id` | `{ screen, title? }` → `{ id, url }`; viewer at `/?p=<id>` |

## File ownership

Rule: one writer per path at a time. Anyone may read anything.

| Path | Owner | Notes |
| --- | --- | --- |
| `packages/shared/src/{schema,tree,sanitize,mock}.ts` | Abel (core) | Do not edit from feature work |
| `packages/shared/src/integration.ts`, `packages/shared/src/index.ts` | Integration | New contracts; change with both client and server |
| `apps/server/src/ai/*` (except `ai/sketch/`) | Abel (core) | Generation prompt and Claude client |
| `apps/server/src/ai/sketch/*` | Canvas feature | Sketch-to-Screen |
| `apps/server/src/routes/{generate,transcribe,image,assets}.ts` | Abel (core) | |
| `apps/server/src/routes/sketch.ts` | Canvas feature | |
| `apps/server/src/{icons,images}.ts` | Abel (core) | Iconify and Openverse |
| `apps/server/src/index.ts` | Integration | Mounts all routers |
| `apps/web/src/components/{ScreenRenderer,elements,ScreenCanvas}.tsx` | Abel (core) | |
| `apps/web/src/editor/**` | Abel (core) | Inspector, inline edit, publish menu |
| `apps/web/src/store/screenStore.ts` | Abel (core) | |
| `apps/web/src/lib/{api,exportSite,useRecorder}.ts` | Abel (core) | Reused by voice and narrate |
| `apps/web/src/modes/text/**` | Abel (core) | Text mode |
| `apps/web/src/modes/canvas/**` | Canvas feature | |
| `apps/web/src/modes/narrate/**` | Narrate feature | |
| `apps/web/src/modes/voice/**` | Voice feature | |
| `apps/web/src/shell/**` | Shell feature | Includes composer, output pane, sidebar |
| `apps/web/src/share/**` | Share feature | |
| `apps/web/src/App.tsx`, `main.tsx`, `index.css` | Integration | Wiring |
| `docs/integration.md`, `docs/devpost.md`, `docs/demo-script.md` | Docs | This file, the Devpost copy, and the demo script |
| `docs/elevenlabs.md` | Voice feature | Verified ElevenLabs API notes |
| `package.json` (all) | Nobody edits | Deps already installed |

## Environment variables and keys

Set these in `apps/server/.env`. Copy it from `apps/server/.env.example` on your own machine, or use
the shared team `.env` that the project owner provides.

Key rules:

- The `.env` file is **never committed**. `.gitignore` already lists `.env` and `.env.local`.
- Keys are used **server-side only**. The browser never receives them. Keys must never be logged or
  pasted into reports, commits, or chat.
- The shared team keys are held by the project owner. Each key has a **$10 spending cap**. If a key
  hits its cap, switch to `MOCK_AI=1` rather than raising the cap.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MOCK_AI` | No | `1` = no model calls; the server returns canned screens and every feature works. Set `0` to use Claude. |
| `ANTHROPIC_API_KEY` | Only when `MOCK_AI=0` | Claude for screen generation, sketch-to-screen, narration demos and intent routing |
| `CLAUDE_MODEL` | No | Default `claude-sonnet-5-5`, used for new pages. `claude-haiku-5-5` is faster; `claude-opus-5-5` for the richest layouts |
| `CLAUDE_BUILD_EFFORT` / `CLAUDE_EDIT_EFFORT` | No | Thinking effort for new pages (default `medium`) and edits (default `low`) |
| `ELEVENLABS_API_KEY` | Only for live voice | Realtime and batch Scribe. Without it, voice falls back to the batch path or mock behavior |
| `MONGODB_URI` | No (share links only) | MongoDB Atlas connection string for `POST /api/prototypes`. When unset, share links are written as one JSON file per prototype to `apps/server/.data/prototypes/<id>.json` |
| `VITE_TLDRAW_LICENSE_KEY` | Web app (Vite) | tldraw SDK license key, read at build or dev time from the web app's env. The 100-day trial key arrives soon; without a key the canvas runs on the trial. **TODO: confirm the exact env file (`apps/web/.env` or the shared `.env`) once the key arrives.** Not a server key |
| `PUBLIC_URL` | No | Public origin used to build share URLs (`{PUBLIC_URL}/?p=<id>`). The server uses the caller's origin first, then this value, then the local dev client |
| `PORT` | No | Server port, default `3001` |
| `NODE_ENV` | No | Standard Node setting |

Model note: intent routing (`apps/server/src/intent/intent.ts`) is pinned to `claude-haiku-5-5`. The
single-element edit path calls the Claude client in `apps/server/src/ai/claude.ts`, which reads
`CLAUDE_MODEL`. Confirm the edit model before the demo, because the team decision is Haiku for edits.

## How to run (localhost)

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # or use the shared team .env; MOCK_AI=1 needs no keys
pnpm dev                                        # server :3001 and web :5173 (concurrently)
```

Open http://localhost:5173. Vite proxies `/api` to `:3001`.

Other scripts (root `package.json`):

- `pnpm typecheck`: runs typecheck in every package
- `pnpm test`: runs vitest in every package
- `pnpm build`: builds every package

Health check: `GET /api/health` reports which keys are present and whether mock mode is on.

### Share links on a phone

The server accepts browser requests only from `localhost` and `127.0.0.1` origins, and a share link
is built from the caller's origin. A link copied from `localhost` will not open on a phone. Options:

- Put the app behind a tunnel or a LAN address that the phone can reach, and set `PUBLIC_URL` to
  that origin. This is **TODO: decide the method before the demo.**
- If no phone route works, show the phone step from a recording (see `docs/demo-script.md`).

## Replay fallback

Decision B6: replay mode, toggled with **Ctrl+Shift+R**, lets the demo run from a recorded session when
live model calls are slow or fail. Code: `apps/web/src/replay/index.ts`.

- **Record mode (default):** every successful call to `/api/generate`, `/api/generate-sketch`,
  `/api/edit-node`, `/api/demo` and `/api/transcribe` is saved in the browser (IndexedDB).
- **Replay mode:** the same endpoints are answered from the latest recording, with the original timing.
  A small dot titled "Replay on" shows while it is on.

Rules for the demo:

- Record one full run of `docs/demo-script.md` before judging, in record mode, with the shared key
  working. Keep the video as the second backup.
- Replay answers come from the browser that recorded them. Use the same browser profile and the same
  prompts as the recording.
- Replay does not cover the share step on a phone. That step uses the phone route or the recorded clip.

## Notes for the integrator

- `apps/server/src/index.ts` mounts the sketch, demo, share and voice routers, and the intent router,
  alongside generate, transcribe, image and assets. The larger-body routers (sketch, demo, share)
  mount before the global 3 MB JSON parser, so any new large-body route must do the same.
- Sketch and narration payloads can be large (PNG data URLs up to about 8 MB, snapshots up to
  4 MB each). Check the body limit on each route.
- Mock mode must cover every new endpoint. Each new route returns a canned result when
  `MOCK_AI=1`.
- Abel's files are reused, not forked. If a change is needed there, send it to Abel.

## Canvas ops, live data, library and motion

Everything stays on one engine: Abel's typed Screen tree. No model-written HTML, CSS, JS or server code is
rendered or executed. The earlier sandbox backends were dropped for security (see the review).

- **Canvas ops** (`POST /api/canvas-ops`, `apps/server/src/routes/canvasOps.ts`): the canvas is a
  vertical-only page (1200 units wide, no zoom, no horizontal pan). Lifting the pen shows a label popover for
  the stroke group. Confirm sends `CanvasOpsRequest` `{ image, label, region, shapes[], screen }` and gets
  `{ summary, ops[], provider, sketchReading? }`. Ops are the typed `ScreenOp` set in
  `packages/shared/src/ops.ts` (`insert`, `replace`, `remove`, `style`, `update`, `page`), applied with
  `applyOps`; unknown targets are skipped with a reason. Own 10 MB JSON parser, mounted before the global one.
- **Perceptron reading** (`apps/server/src/canvasOps/perceptron.ts`): when `PERCEPTRON_API_KEY` is set, the
  sketch is read first (6 s timeout, never throws) and the reading is passed to Claude. Provider is
  `perceptron+claude`, `claude` or `mock`. `CANVAS_OPS_FAST=1` picks the faster path.
- **Library** (`apps/web/src/modes/canvas/library/`): Icons, Photos, Sections (8 templates) and Motion tabs.
  Items insert through `applyOps` and `useScreenStore.setScreen`, or by drag onto the canvas.
- **Motion** (`apps/web/src/motion/`): 8 presets stored per chat and node, emitted as CSS wrapped in
  `prefers-reduced-motion: no-preference`. `MotionStyles` is mounted once in `App.tsx`; `MotionControls`
  sits under the Inspector in the Inspect tab when a node is selected.
- **Live data** (`GET /api/live` catalog, `GET /api/live/:id` data, `apps/server/src/routes/live.ts`): sources `weather`, `github-stars`,
  `crypto-price`, `hn-top`, `time`, `youtube-views`; 60 s cache, 60 requests a minute, 5 s upstream timeout.
  `youtube-views` needs `YOUTUBE_API_KEY`. Web side in `apps/web/src/live/`.
- **Health**: `/api/health` now also reports `hasPerceptron` and `hasYoutube`.

New env vars: `PERCEPTRON_API_KEY`, `YOUTUBE_API_KEY`, `CANVAS_OPS_FAST`.
