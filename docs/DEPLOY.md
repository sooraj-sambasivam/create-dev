# Deploy and phone sharing

## 1. Phone demo via tunnel (fastest)

1. `pnpm dev` (web on 5173 unless you pass `--port`; the API proxy at `/api` is unchanged).
2. `brew install cloudflared` (once).
3. `pnpm share:tunnel [webPort]` prints a `https://*.trycloudflare.com` URL.
4. Restart the API with that URL so share links are phone-openable:
   `PUBLIC_URL=https://<name>.trycloudflare.com pnpm --filter @create/server dev`
5. Open the tunnel URL on the phone. Share links now use `PUBLIC_URL` (it wins over the browser's `Origin`, which is `localhost` on the desktop).

Vite allows `*.trycloudflare.com`, `*.ngrok-free.app` and `*.vercel.app` hosts and listens on all interfaces. ngrok alternative: `ngrok http <webPort>`.
Same Wi-Fi without a tunnel: open `http://<laptop-lan-ip>:5173` and set `PUBLIC_URL` to that.

## 2. Vercel

Verdict: host the web app on Vercel, the API on Render or Fly.
`apps/server/src/index.ts` calls `app.listen` at import time, uses long-running JSON/multipart handlers, and defaults the share store to local files, which a serverless filesystem does not keep. Wrapping it in `api/index.ts` needs an exported app (change to `index.ts`, not done here) plus `MONGODB_URI`.

Steps:
1. Deploy `apps/server` to Render/Fly (`pnpm --filter @create/server start`), with the env below. Set `MONGODB_URI` (local files are lost on redeploy).
2. Import the repo in Vercel. Root `vercel.json` builds `apps/web` and serves SPA fallback.
3. Add a rewrite so `/api/*` reaches the API (edit `vercel.json`, before the SPA rule):
   `{ "source": "/api/:path*", "destination": "https://<your-api-host>/api/:path*" }`
4. Set `PUBLIC_URL` on the API to the Vercel URL. CORS (`apps/server/src/app.ts`) allows localhost origins plus every origin in `ALLOWED_ORIGINS` (comma-separated), and additionally any `chrome-extension://` origin, but only for `/api/import-element`, so the "Point at any website" extension can POST without opening the rest of the API. Same-origin via the rewrite avoids CORS entirely. The extension's web origin defaults to `http://localhost:5173`; set it (and the API origin) on its options page for a deployed Create, and add that API host to the extension's `host_permissions` in `apps/extension/manifest.json`.

## 3. Env names

Server: `PUBLIC_URL`, `ALLOWED_ORIGINS`, `PORT`, `MONGODB_URI`, `MOCK_AI`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `ELEVENLABS_API_KEY`, `TYPESAFE_API_KEY`, `PERCEPTRON_API_KEY`, `YOUTUBE_API_KEY`. Values stay out of the repo.

## 4. Desktop app (later)

Electron (or Tauri) can wrap the built web app and spawn the server as a child process; no code needed for tonight. Keep the server on a fixed port and load `http://localhost:<port>`.
