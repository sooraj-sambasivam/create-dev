// Phone demo: expose the Vite dev server through a Cloudflare quick tunnel.
// Usage: pnpm share:tunnel [port]   (default 5173; the web dev server must already be running)
import { spawn, spawnSync } from "node:child_process";

const port = process.argv[2] || process.env.WEB_PORT || "5173";

const found = spawnSync("which", ["cloudflared"], { encoding: "utf8" });
if (found.status !== 0) {
  console.log(`cloudflared is not installed. Install it, then re-run \`pnpm share:tunnel\`:

  brew install cloudflared

Alternative (ngrok, needs a free account + authtoken):

  brew install ngrok
  ngrok http ${port}
`);
  process.exit(1);
}

const child = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

let announced = false;
function onData(chunk) {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !announced) {
    announced = true;
    console.log(`
Public URL: ${match[0]}

Share links use PUBLIC_URL instead of localhost. In another terminal, restart the API with it set:

  PUBLIC_URL=${match[0]} pnpm --filter @create/server dev

Then open ${match[0]} on your phone.
`);
  }
}
child.stdout.on("data", onData);
child.stderr.on("data", onData);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
