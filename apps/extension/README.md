# Create: Point at any website (Chrome extension)

Pixels become software you own. Point at a table, list, pricing cards or a chart image on any page, say or type "turn this into something I can track", and Create opens a live app: an editable table, a chart and an add-row form backed by real storage. Plain JS, Manifest V3, no build step.

## Load it
1. Start Create: web http://localhost:5173 by default (set the web origin on the options page, for example 5175), API http://localhost:3001.
2. Open `chrome://extensions`, turn on Developer mode, click Load unpacked, choose `apps/extension`.
3. To use the fixture pages straight from disk, also enable "Allow access to file URLs" for the extension.

## Use it
- Hold Option over a table, list, cards or chart. It outlines the thing and the chip names it ("Table · 12 rows × 4 cols", "List · 7 items", "Cards · 3 plans", "Chart image").
- Release Option (or click while armed from the toolbar or Alt+Shift+P). A "Turn this into…" pill appears prefilled with "something I can track". Type, or tap the mic if Chrome speech is available, then press Enter. Esc cancels.
- The chip shows progress ("Reading table…", "Building your app…") and a new tab opens with the app.
- Chart images and canvas/SVG charts are cropped from a tab screenshot and read through `/api/extract` first.

## What is sent
Only the pointed-at data: the typed entity (columns, up to 500 rows of text, the page URL and title) to `/api/lift`, or for a chart a PNG/JPEG crop of that element (at most 4MB) to `/api/extract`. The server never fetches the source page.

## Fixtures
`demo/` holds neutral sample pages: `route-44-schedule.html`, `dining-hours.html`, `pricing.html`, `chart.html` (plain image, no data in the DOM), `dubhacks-schedule.html`.

Test: `WEB_ORIGIN=http://localhost:5175 node scripts/e2e/extension.mjs`. Loads this folder in headless Chromium, serves `demo/`, runs the lift flow on the schedule and pricing pages, and asserts the opened app renders the table and chart.
