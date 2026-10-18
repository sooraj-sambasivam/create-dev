# Create: Point at any website (Chrome extension)

Pixels become software you own. Point at a table, list, pricing cards or a chart image on any page, say or type "turn this into something I can track", and Create opens a live app: an editable table, a chart and an add-row form backed by real storage. Plain JS, Manifest V3, no build step.

## Load it
1. Start Create: web http://localhost:5173 by default (set the web origin on the options page, for example 5175), API http://localhost:3001.
2. Open `chrome://extensions`, turn on Developer mode, click Load unpacked, choose `apps/extension`.
3. To use the fixture pages straight from disk, also enable "Allow access to file URLs" for the extension.

## Use it
- Hold Option over a table, list, cards or chart. It outlines the thing and the chip names it ("Table · 12 rows × 4 cols", "List · 7 items", "Cards · 3 plans", "Chart image").
- In pointer mode the cursor becomes a lasso the moment you press and drag (a short click still selects). On release the loop's snippet also goes to the tray: a small JPEG thumbnail (at most 60 KB) and the sanitized markup behind it (allow-listed tags and attributes, at most 20 KB, plus a computed-styles subset), sent to `POST /api/tray` with `source.app = "extension"`.
- Hold Option and drag to circle: a smooth freehand loop (Esc cancels). On release it finds the elements mostly inside, takes their lowest common container, reads it as a table, list or cards (or, when nothing structured fits, reads the loop's screenshot crop), and also records a structured DOM snapshot (tags, text, allow-listed attributes, absolute links and image URLs, a few computed styles).
- Release Option (or click while armed from the toolbar or Alt+Shift+P). A "Turn this into…" pill appears prefilled with "something I can track". Type, or tap the mic if Chrome speech is available, then press Enter. Esc cancels.
- The chip shows progress ("Reading table…", "Building your app…") and a new tab opens with the app.
- Chart images and canvas/SVG charts are cropped from a tab screenshot and read through `/api/extract` first.

## Voice (optional)
Turn on "Use my voice while I hold Option" on the options page. While Option is held the mic streams to ElevenLabs Scribe realtime through the background worker (the API key never leaves the server: `GET /api/voice-token` returns a single-use token; Chrome asks for the microphone on each site, like the pill's mic button). The content script stamps the first audio sample on the page's `performance.now` clock, so Scribe's word offsets become word times on the same clock as the pointer. `timeline.js` keeps the capture timeline: what was hovered (stamped from the `mousemove` event time) and each circled loop (stroke start and end). When the line lands, each "this / that / here" binds to the capture that was current when the word was said: a loop the speech overlaps (4 s before to 8 s after) wins, else what was hovered at that moment, else what the pointer just left (1.5 s), else whatever the pointer sample at that time was over. The pill opens on that target with the line in the input, even if the pointer has moved on by the time Option is released. Without voice, or without a realtime token, nothing changes: the target is what is hovered at release, and you type or tap the pill's mic.
Test: `node --env-file=apps/server/.env scripts/e2e/sync/extension.mjs` (real browser, fake mic, real Scribe; table A is hovered when "this" is said, table B when Option is released) and `node --test scripts/e2e/sync/extension-timeline.test.mjs`.

## Get all pages
If the instruction says "all pages", "every page" or "the rest", or you tap "Get all pages" in the pill (shown when pagination is found), the content script follows same-origin next links (rel=next, aria-label next, "Next", numbered pagers), fetches up to 5 pages (10s budget, credentials included), re-runs the extractor on the same container and merges and dedupes rows, showing "Page 2 of 3…".

## Motion
All overlay motion uses Web Animations on translate, scale and opacity only, with spring curves sampled into `linear()` easings and interruptible FLIP moves. `prefers-reduced-motion` turns the animations off.

## What is sent
Only the pointed-at data: the typed entity (columns, up to 500 rows of text, the page URL and title) to `/api/lift`, or for a chart a PNG/JPEG crop of that element (at most 4MB) to `/api/extract`. The server never fetches the source page.

## Fixtures
`demo/` holds neutral sample pages: `route-44-schedule.html`, `dining-hours.html`, `pricing.html`, `chart.html` (plain image, no data in the DOM), `dubhacks-schedule.html`, and `pricing-page-1..3.html` (paginated cards: 3 + 3 + 2 plans).

Test: `WEB_ORIGIN=http://localhost:5175 node scripts/e2e/extension.mjs`. Loads this folder in headless Chromium, serves `demo/`, runs the lift flow on the schedule and pricing pages, and asserts the opened app renders the table and chart.
