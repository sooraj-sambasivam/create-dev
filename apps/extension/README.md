# Create: Point at any website (Chrome extension)

Point at any element on any page, optionally say or type what you want ("make this mine but darker"), and it opens in Create as an editable prototype. Plain JS, Manifest V3, no build step.

## Load it
1. Start Create: web http://localhost:5173 by default (5175 if the options page is set to it), API http://localhost:3001 (the server mounts `importElementRouter` under `/api`; verified by curl, not yet in a real Chrome).
2. Open `chrome://extensions`, turn on Developer mode, click Load unpacked, choose `apps/extension`.
3. Optional: pin the extension. Its options page sets the web and API origins.

## Use it
- Click the toolbar icon or press Alt+Shift+P on a normal web page (not `chrome://` pages).
- Hover to see the outlined element and its label chip; click to capture it.
- Speak (Chrome speech recognition) or type an instruction, press Enter. A new tab opens at `<web origin>/?p=<id>` (default `http://localhost:5173`, configurable on the options page).
- Esc cancels.

## What is sent
A sanitized structural snapshot of the clicked element only: tag tree to depth 6 and 300 nodes, text up to 300 characters per node, absolute image and link URLs, and a few computed styles. The server never fetches the source page.

Test: `node scripts/e2e/extension.mjs` (env `WEB_ORIGIN`, e.g. `http://localhost:5175`). Loads this folder in headless Chromium, points at a fixture pricing section and asserts the imported tab renders.
