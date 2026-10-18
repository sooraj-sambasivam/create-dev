// Screenshots of the narrate overlay at several widths (no audio): node scripts/e2e/sync/narrate-shots.mjs
import path from "node:path";
import { launch, openApp, generatePage, openNarrate, sleep } from "./narrate-lib.mjs";
const BASE = process.env.BASE_URL || "http://localhost:5175";
const OUT = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-soorajsambasivam-Documents-projects-create-dev/781b2c7e-b0d6-487c-909d-9cb6fda3c63e/scratchpad/sync-e2e";
for (const [w, h] of (process.env.SIZES || "1440x900,1024x768,880x760").split(",").map((s) => s.split("x").map(Number))) {
  const { cdp, close } = await launch({ wav: null, width: w, height: h });
  try {
    await openApp(cdp, BASE);
    await generatePage(cdp);
    await openNarrate(cdp);
    const f = await cdp.shot(path.join(OUT, `narrate-${w}.png`));
    const geo = await cdp.eval(`(()=>{const q=(s)=>[...document.querySelectorAll(s)].map(e=>{const r=e.getBoundingClientRect();return {l:r.left|0,t:r.top|0,r:r.right|0,b:r.bottom|0}});return {bar:q('[data-narrate-bar]'),hint:q('[data-testid="key-hint-bar"]'),composer:q('[data-testid="composer"]')}})()`);
    console.log(w, f, JSON.stringify(geo));
  } catch (e) { console.log(w, "FAIL", e.message); } finally { close(); }
}
process.exit(0);
