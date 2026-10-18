# Onboarding: Create

One page for a new teammate. Run `pnpm onboard` and read what it prints; this page explains the rest.

## What Create is

- Create turns a spoken, typed, sketched or narrated idea into a working web page for non-coders and small businesses.
- Every input mode produces the same Screen JSON tree, validated by Zod and drawn by one React renderer.
- The right panel shows the result as Output, Inspect or Backend (the generated data and routes as a map).
- The repo is `create-dev`; the product name in the UI is **Create**.

## Quick start

```bash
git clone https://github.com/sooraj-sambasivam/create-dev.git
cd create-dev
pnpm onboard --branch <you>/<lane>   # installs, creates your branch off origin/integrate, makes .env, runs typecheck + tests
pnpm dev                              # web http://localhost:5173, API http://localhost:3001/api/health
```

Flags: `--quick` skips tests, `--doctor` only checks (no install, no tests), `--branch <name>` creates your work branch.
Requirements: Node 22+, pnpm 9+. Backend view: menu (hamburger) then Backend.

## Architecture map

| Path | What lives there |
| --- | --- |
| `apps/web` | React app: shell, composer and radial fan, canvas (tldraw), narrate, renderer, editor, share viewer |
| `apps/server` | Express API: generation, sketch, intent, transcribe and voice, live data, share store |
| `packages/shared` | Zod schemas and Screen tree helpers used by both sides |

- **Screen tree = one engine.** Every mode ends in a Screen; nothing renders around it.
- **Typed page ops.** Edits are typed operations applied to the tree, not free-form rewrites.
- **Right panel:** Output (live page), Inspect (selected element), Backend (data and routes map).
- **Canvas:** draw, send PNG plus shape summaries, get a Screen back. **Narrate:** Shift-drag to lasso, speak within 4 seconds, get a clickable demo. **Live data:** blocks fed by server routes. **Share:** save a Screen and open it at `/?p=<id>`.

More detail: `README.md`, `DESIGN.md` (visual contract), `docs/integration.md`.

## Ownership

| Owner | Owns |
| --- | --- |
| Abel | Engine: `packages/shared/src/{schema,tree,sanitize,mock}.ts`, `apps/server/src/ai/*`, generate/transcribe/image/assets routes, icons and images, `apps/web/src/{components,editor,lib}`, `store/screenStore.ts`, `modes/text`, every `package.json` |
| pentaswan | Pen overlay, publish slugs |
| Sooraj's agents | Shell, composer, canvas, narrate, new routes |

Do not edit another owner's files; ask them or open a PR they review.

## Environment variables (`apps/server/.env`)

`pnpm onboard` creates the file from `.env.example` and reports which names have values, never the values. Get shared keys from Sooraj.

| Variable | Enables | Without it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Real page generation, sketch and intent AI | Canned mock screens and keyword intent routing |
| `ELEVENLABS_API_KEY` | Voice transcription and realtime mic | Voice input unavailable; typing works |
| `TYPESAFE_API_KEY` | TypeSafe/Jev judgments | Those calls are skipped |
| `PERCEPTRON_API_KEY` | Perceptron sketch reading | Sketches use the other path or mocks |
| `MONGODB_URI` | Share links in Atlas | Local file store (`apps/server/.data`) |
| `YOUTUBE_API_KEY` | Live YouTube data | That live data is unavailable |
| `MOCK_AI=1` | Forces mock AI everywhere | Real calls when keys exist |

## Branches and pull requests

- `main` is owner-only. Never push or PR to it.
- Branch off `integrate`: `<you>/<lane>`. Open PRs **into `integrate`**; Sooraj merges.
- Rebase before opening a PR: `git pull --rebase origin integrate`.
- Keep PRs small and single-purpose.

## Testing

- `pnpm typecheck` and `pnpm test` must both be green before a PR.
- For UI changes, check the browser in light and dark themes.
- `node --test scripts/onboard.test.mjs` covers the onboarding helpers.

## Deadlines

| When | What |
| --- | --- |
| Sat 10:30 PM | Devpost draft |
| Sun 6:00 AM | Code freeze |
| Sun 8:30 AM | Demo video |
| Sun 10:00 AM | Submit |

## Security rules

- No keys, tokens or `.env` files in git. The repo goes public.
- Never print or log secret values.
- No AI-written server code.
- Validate external input; use parameterized queries.

## Where to ask and track

- Team board: https://claude.ai/artifact/74KUCraV2sJAmMFMGxbJuP
- Sooraj's work is tracked in his Linear project; ask him for access.
- Questions about engine files go to Abel; pen overlay and publish slugs go to pentaswan.
