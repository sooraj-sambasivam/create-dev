# Demo script: Create (repo `create-dev`)

Theme: **Pixels become software you own.** Target: 2:00. Plain words: "app", "your data",
"your phone". Never say "website builder", "component" or "API". Pointing is the gesture; the
modes are Type, Speak, Sketch, Narrate.

OWNER: confirm the video length limit on the DubHacks hacker guide. If longer is allowed, spare
time is buffer, not extra features.

**Tracks:** DubHacks NEXT, Perceptron, SideShift, MongoDB Atlas. Say each sponsor name once, on the beat that uses it.

**Presenter:** OWNER: assign who speaks, who drives the mouse and who holds the phone.

Everything below is covered by headless tests except what is marked **(verify before submit)**.

## Before recording

- [ ] `pnpm install`, `pnpm dev`. Note the web port Vite prints (5173, or 5175 if taken).
- [ ] `GET http://localhost:3001/api/health` shows `mock:false` and the keys present. Keys live in `apps/server/.env`.
- [ ] Chrome, laptop width, light theme, microphone permission granted ahead of time.
- [ ] Extension loaded unpacked (`apps/extension`), web origin set on its options page to the web port, "Allow access to file URLs" on if you use `file://` fixtures. (verify before submit: a full lift in your own Chrome profile)
- [ ] Fixture pages open in tabs: `apps/extension/demo/route-44-schedule.html` (main), `dubhacks-schedule.html` (backup), `chart.html` (optional).
- [ ] Phone path: `pnpm share:tunnel`, then restart the API with `PUBLIC_URL=https://<name>.trycloudflare.com`. Lift AFTER this, or the QR points at localhost. Test a scan on the venue wifi. (verify before submit)
- [ ] MongoDB: `MONGODB_URI` set, and one real row seen in the Atlas collection. Take the screenshot once (OWNER: Atlas screenshot).
- [ ] Prime replay: run this exact script once in record mode (default) in the same browser profile. Keep that screen capture as the backup video.
- [ ] Close the right panel before Narrate beats (at 1440x900 the fan's items can sit under the Run log).

## Timeline (2:00)

| Time | Beat | On-screen steps | Say |
| --- | --- | --- | --- |
| 0:00-0:20 | Lift a schedule | On the Route 44 schedule page, hover the table and hold Option. It outlines, the chip reads "Table · 12 rows × 4 cols". Release, say or type `turn this into something I can track`. The chip shows "Reading table…" then "Building your app…". A new tab opens with the app. | "This is a bus schedule. You can read it, but it isn't yours. I point, say 'turn this into something I can track'... and now it's an app: a table I can edit, a chart, and a form." |
| 0:20-0:35 | The gap | Stay on the app. Scroll once to show table, chart, Add row. | "Google's pointer answers questions. Ours hands you software you own, with a backend." |
| 0:35-1:00 | Judge scans the QR | Output tab, press the QR button ("Scan to open"). A judge scans it and adds a row (for example `Thu`, `777`) on their phone. Switch to the Backend tab; the row appears and flashes (3-second poll). Show the Atlas collection once. | "Scan this. Add a row. It lands in a real MongoDB Atlas collection, and shows up here." |
| 1:00-1:25 | Chat about the chart | Switch to Chat. Point at the chart (hold Option) and ask `why does this spike in week 3?`. Read the answer. | "Chat answers about whatever I point at, using the chart and the rows behind it." |
| 1:25-1:45 | Pointer and undo | Switch to Narrate. Hover the app title, hold Option, say `make this bigger`. The bubble shows the target, then Done. Press Cmd+Z once. | "Same pointer inside the app. It shows what it understood, and undo is one key." |
| 1:45-1:55 | Second source (optional) | Only if working: `chart.html`, a chart that is just an image. Point at it and lift. Perceptron reads the image into a second app. Otherwise skip, and give the time to the startup line. | "Even a chart that's only pixels. Perceptron reads it." |
| 1:55-2:00 | Startup line | Static end card. | "Every portal, PDF and screenshot is read-only. Create is the free pointer; a hosted backend at $9 to $19 a month is the business. No users yet." |

Timing notes:

- Hover on the target before you speak and keep still until the bubble or outline shows.
- The lift needs one model call at most (copy polish, 12 s timeout, then it falls back). The
  smoke test saw a row appear in the table about 2.5 s after submit.
- Backend tab polling is 3 seconds; do not narrate over the wait.
- Values read from an image are approximate. Never claim exact numbers from the image app.
- Chat uses the pointed crop and row data. With `MOCK_AI=1` it returns a canned answer. (verify before submit with real keys)

## Backup plan

Use the first option that works. Do not debug on camera.

1. **Replay (Ctrl+Shift+R).** Answers model, voice and intent calls from the recorded run in this
   browser. A dot titled "Replay on" shows. Turn it off before the next live step. Lift, forms and
   the QR step are not covered by replay.
2. **Different fixture.** If the table does not outline, use `dubhacks-schedule.html` or `pricing.html`.
3. **Typed instead of spoken.** If the mic fails, type into the pill and say "typed here, same result."
4. **Phone fails.** Open the app link on a second laptop tab and add the row there; say what the phone would do. Or show the recorded clip of the scan.
5. **Recorded video** of the full run, made before judging.
6. **Mock mode (`MOCK_AI=1`).** The lift, table, chart, form and QR work without keys. Say so if shown.
7. **Fallback story** (if lift fails entirely): extension imports a table as an editable page, in-app pointer "make this bigger", Chat about a figure, then submit a form and show the row in the Backend tab and Atlas. Same pitch, table-to-app only.
