# Deploy and phone sharing

## 1. Phone demo via tunnel (fastest)

1. `pnpm dev` (web on 5173 unless you pass `--port`; the API proxy at `/api` is unchanged).
2. `brew install cloudflared` (once).
3. `pnpm share:tunnel [webPort]` prints a `https://*.trycloudflare.com` URL.
4. Restart the API with that URL so share links are phone-openable:
   `PUBLIC_URL=https://<name>.trycloudflare.com pnpm --filter @create/server dev`
5. Open the tunnel URL on the phone. `PUBLIC_URL` wins over the browser's `Origin`.

## 2. Vercel (one project: static web + serverless API)

Layout: `vercel.json` builds `apps/web` to `apps/web/dist`; `api/index.ts` exports `createApp()` from `apps/server/src/app.ts` as the single function. `/api/*` rewrites to it, everything else falls back to the SPA.

Owner commands (run from the repo root; Vercel CLI auth must be refreshed by you):

```
npx vercel@62.0.0 login
npx vercel@62.0.0 link
```

Add each env var (the CLI prompts for the value; pick Production, and Preview if wanted):

```
npx vercel@62.0.0 env add ANTHROPIC_API_KEY production
npx vercel@62.0.0 env add TYPESAFE_API_KEY production
npx vercel@62.0.0 env add MONGODB_URI production
npx vercel@62.0.0 env add ELEVENLABS_API_KEY production
npx vercel@62.0.0 env add PERCEPTRON_API_KEY production
npx vercel@62.0.0 env add PUBLIC_URL production        # https://<project>.vercel.app
npx vercel@62.0.0 env add ALLOWED_ORIGINS production   # https://<project>.vercel.app
```

Optional: `YOUTUBE_API_KEY`, `CLAUDE_MODEL`. Do not set `MOCK_AI`.

Verify locally, then deploy:

```
node scripts/deploy/check.mjs        # env names set in your shell + web build (values never printed)
npx vercel@62.0.0 deploy --prod
```

Then open `https://<project>.vercel.app/api/health` and confirm `hasAnthropic`, `hasMongo`, etc. are true.

### Limits (Vercel docs, checked 2026-10-17)

- With Fluid compute, Hobby default and max duration is 300s (was 60s before); Pro max 800s. `vercel.json` sets `maxDuration: 300`. Confirm Fluid compute is on in Project Settings, otherwise the old 60s cap applies.
- Request body limit for functions is 4.5 MB. The sketch and canvas-ops routes accept up to 10 MB bodies, so big payloads will fail with 413 on Vercel.
- Filesystem is read-only except `/tmp` (ephemeral, per instance).
- Sources: https://vercel.com/docs/functions/limitations and the Vercel changelog "higher defaults and limits for Vercel functions running fluid compute".

### Known app changes needed (not done here, apps/ is off limits)

See the follow-up list in the task report: `/tmp` caches, Mongo-only stores on Vercel, TS workspace resolution, body size.

## 3. Env names

`PUBLIC_URL`, `ALLOWED_ORIGINS`, `PORT`, `MONGODB_URI`, `MOCK_AI`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `ELEVENLABS_API_KEY`, `TYPESAFE_API_KEY`, `PERCEPTRON_API_KEY`, `YOUTUBE_API_KEY`. Values stay out of the repo.

CORS allows localhost, `ALLOWED_ORIGINS`, and `chrome-extension://` only for `/api/import-element`. Same-origin on Vercel needs no CORS, but set the extension's web/API origin to the Vercel URL and add it to `host_permissions` in `apps/extension/manifest.json`.

## 4. Desktop app (later)

Electron (or Tauri) can wrap the built web app and spawn the server as a child process.
