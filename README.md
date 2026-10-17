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

`packages/shared/src/schema.ts` is the single source of truth. A `Screen` is
`{ title, theme: "light" | "dark", children: Node[] }` and a `Node` is one of
`container | heading | text | textbox | button | image | checkbox | select | link | divider`.
Containers nest. Props are enums on purpose so the renderer is deterministic.

Every node can also carry `style` (`color`, `background`, `radius`) and `widthPct`. Both are
optional, so hand-built trees can leave them out.

The model doesn't emit the tree directly. Anthropic structured outputs reject recursive schemas
and cap the compiled grammar size, so the model returns a flat `nodes` list with `parentId`, plus
`styles` as short lines like `hero-cta bg=#16a34a radius=lg width=50`. The server rebuilds the
tree with `assembleScreen`; `flattenScreen` is the inverse. **The node schema sits close to the
grammar ceiling: adding a new object type or many fields to `FlatNodeSchema` can make every
generation fail with "compiled grammar is too large".** Test a real generation after schema changes.

## Visual editor

After a screen is generated, the canvas is editable (toggle Edit / Preview in its title bar):

- Click to select; the right-hand inspector edits content, layout, colors, corners and width.
- Double-click text (or press Enter) to type over it in place.
- Drag any element to move it, including into or out of groups. Blue lines show where it lands.
- Pull the handle on a selected element's right edge to resize it (snaps to 5%; double-click resets).
- Add elements from the **+ Add** menu; they go after the selection, or inside a selected group.
- ⌘Z / ⌘⇧Z undo and redo, ⌘D duplicates, Delete removes, Esc deselects.
- With something selected, prompts like "make this stand out" target that element. Manual styles
  are preserved when the AI regenerates.

Editor code lives in `apps/web/src/editor/` and `components/ScreenRenderer.tsx`. Tree edits go
through the immutable helpers in `packages/shared/src/tree.ts`, so other modes can reuse them.

To add a mode:

1. Create `apps/web/src/modes/<name>/<Name>Mode.tsx` and wire it in `App.tsx` and `ModeSwitcher.tsx`
   (Canvas and Narrate already have stubs).
2. Produce a screen one of two ways:
   - **Directly** (e.g. Canvas): build a `Screen` and call
     `useScreenStore.getState().setScreen(screen, "what changed")`.
   - **Through the model** (e.g. Narrate): call `useScreenStore.getState().generate(prompt)`.
     The store sends the current screen along, so prompts act as edits.
3. Voice helpers you can reuse: `lib/useRecorder.ts` (MediaRecorder + level meter) and
   `lib/api.ts#transcribe(blob)`.

## API

`POST /api/generate` `{ prompt, screen?, history? }` → `{ summary, screen }`
`POST /api/transcribe` multipart `audio` (webm/ogg/m4a) → `{ text }`
`GET /api/health` → which keys are present and whether mock mode is on

Errors come back as `{ error: string }` with a meaningful status (400, 422, 429, 502, 503).
