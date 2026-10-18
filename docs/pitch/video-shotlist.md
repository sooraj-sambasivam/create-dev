# Create: video shot list

Pre-flight (from `docs/demo-script.md`): `pnpm dev`; health shows `mock:false` and keys; extension loaded unpacked with the web origin set; `PUBLIC_URL` set to the tunnel and the API restarted before lifting; Chrome laptop width, light theme, mic granted; right panel closed; run the exact script once in record mode in the SAME browser profile so replay has a recording, and keep that capture as backup.

Replay: **Ctrl+Shift+R** toggles it (dot titled "Replay on"). It covers model, voice and intent calls on an exact request match, so say the lines verbatim. Lift, forms and the QR step are not covered.

| # | Time | Shot | Exact input | Expected result | If it fails |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00-0:05 | Route 44 schedule page, wide | Hover the table | Outline and chip "Table · 12 rows × 4 cols" | Use `dubhacks-schedule.html` |
| 2 | 0:05-0:20 | Pill close-up, then the new tab | Hold Option, release, keep or say `turn this into something I can track`, Enter | Chip "Reading table…" then "Building your app…"; new tab with table, chart, Add row | Type the sentence; retry with another fixture; mock mode |
| 3 | 0:20-0:35 | App, slow scroll | none | Table, chart, form visible | none |
| 4 | 0:35-1:00 | Output tab QR card, then phone, then Backend tab | QR button; phone adds `Thu`, `777` | Row appears in the table and flashes in the Backend tab within about 3 s; then show the Atlas collection | Add the row in a second tab and say so; play the recorded clip |
| 5 | 1:00-1:25 | Chat, point at chart | `why does this spike in week 3?` | Answer references the chart and rows | Ctrl+Shift+R and repeat verbatim; or skip |
| 6 | 1:25-1:45 | Narrate, hover title | Hold Option, `make this bigger`; then Cmd+Z | Bubble: target, words, Editing, Done; title grows; undo reverts | Click the element, press `/`, type "make this bigger" in the AI box |
| 7 | 1:45-1:55 | `chart.html` (optional) | Point and lift | Second app from an image chart | Skip |
| 8 | 1:55-2:00 | End card | none | Startup line on screen | Static card |

Global fallbacks, in order: (1) Ctrl+Shift+R replay; (2) pre-recorded full-run video for the failing step; (3) `MOCK_AI=1` (lift, table, chart, form and QR still work with canned copy; say so). Do not debug on camera.
