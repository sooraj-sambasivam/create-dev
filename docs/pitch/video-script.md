# Create: final 2:00 voiceover and shot plan

Source: demo-script.md, storyboard.md, video-shotlist.md. Total 222 words over 120 s (about 111 wpm). Plain words only: no "website builder", "component", "API". Open on the pointing moment (Route 44 fixture). Real-mode recording against :3002 (web proxy pointed at 3002 for capture only). Voice: ElevenLabs if ELEVENLABS_API_KEY is present, else macOS `say` labelled placeholder. Machine-readable twin: scratchpad/video/beats.json.

Fixture base: `file:///Users/soorajsambasivam/Documents/projects/create-dev-int/apps/extension/demo/` (extension loaded; file-URL access on). Fallback fixture: dubhacks-schedule.html.

| # | Time | Sponsor shown | Caption |
| --- | --- | --- | --- |
| 1 | 0:00-0:12 | DubHacks NEXT | Point at anything. Say what you want. |
| 2 | 0:12-0:26 | DubHacks NEXT | A live app you own: table, chart, add-row form. |
| 3 | 0:26-0:38 | - | Answers vs. software you own. |
| 4 | 0:38-1:00 | MongoDB Atlas, SideShift | Scan, add a row. Stored in MongoDB Atlas. |
| 5 | 1:00-1:20 | Thinking Machines (Inkling) | Chat answers by Inkling (Thinking Machines). |
| 6 | 1:20-1:34 | Jev (TypeSafe) | Jev understands "this". Undo is one key. |
| 7 | 1:34-1:44 | Perceptron | Perceptron reads pixels. Values approximate. |
| 8 | 1:44-1:50 | - | Notch tray, Lift from screen. Paper / Luminous. |
| 9 | 1:50-2:00 | SideShift | Free pointer. Hosted backend $9-19/mo. No users yet. |

## Beat 1: b1-point (0:00-0:12, 28 words, 140 wpm)

**Narration:** This is a bus schedule. I can read it, but I can't use it. So I point at it, and say: turn this into something I can track.

**Caption:** Point at anything. Say what you want.

**Sponsor:** DubHacks NEXT

**Steps:**
- `goto` url=`file:///Users/soorajsambasivam/Documents/projects/create-dev-int/apps/extension/demo/route-44-schedule.html`; wait=`selector table#timetable visible`
- `hover` selector=`table#timetable tbody tr:nth-child(4)`; at=1; note=`cursor glides in; no narration pause`
- `hold` key=`Alt`; at=2; wait=`extension outline present and chip text matches /Table . 12 rows/`; note=`fallback: apps/extension/demo/dubhacks-schedule.html, table#schedule`
- `release+type` text=`turn this into something I can track`; at=7; then=`press Enter`

## Beat 2: b2-app (0:12-0:26, 26 words, 111 wpm)

**Narration:** Create reads the table, builds the app, and opens it. A table I can edit, a chart, and a form to add rows. It's mine now.

**Caption:** A live app you own: table, chart, add-row form.

**Sponsor:** DubHacks NEXT

**Steps:**
- `wait` cond=`chip text 'Building your app' then new tab opens`; timeout_s=25
- `switchTab` to=`newest`; wait=`[data-screen-root] table:not(.sr-only) tbody tr count >= 6 AND [data-screen-root] figure svg[role=img] present`
- `scroll` selector=`[data-screen-root] figure svg[role=img]`; smooth=true; duration_s=6

## Beat 3: b3-gap (0:26-0:38, 18 words, 90 wpm)

**Narration:** Google's pointer answers questions about what you point at. Create hands you software you own, with a backend.

**Caption:** Answers vs. software you own.

**Sponsor:** none

**Steps:**
- `scroll` selector=`form, [data-testid=add-row], button:has-text('Add row')`; smooth=true; duration_s=4; note=`slow pan, end with Add row form in frame`
- `hold` seconds=6

## Beat 4: b4-qr-atlas (0:38-1:00, 30 words, 82 wpm)

**Narration:** Scan this code and add a row. It goes into a MongoDB Atlas collection, and shows up here in the Backend tab a few seconds later. Real storage, no setup.

**Caption:** Scan, add a row. Stored in MongoDB Atlas.

**Sponsor:** MongoDB Atlas, SideShift

**Steps:**
- `click` selector=`[role=tab]:has-text('Output')`
- `click` selector=`button:has-text('Scan to open')`; wait=`QR image visible`
- `phone-or-second-tab` url=`QR target (PUBLIC_URL tunnel)`; fill=Thu,777; submit=`Add row`; note=`automated: second Playwright page at the share URL; real phone clip if available`
- `click` selector=`[role=tab]:has-text('Backend')`; wait=`#rp-body text matches /[1-9]\d* responses?/ within 8s`
- `insert` asset=`atlas-collection.png`; at=16; duration_s=4; note=`OWNER screenshot; skip if absent`

## Beat 5: b5-chat (1:00-1:20, 30 words, 90 wpm)

**Narration:** Chat answers about whatever I point at. I ask why week three spikes. Inkling, from Thinking Machines, replies in under a second, using the chart and the rows behind it.

**Caption:** Chat answers by Inkling (Thinking Machines).

**Sponsor:** Thinking Machines (Inkling)

**Steps:**
- `click` selector=`[data-testid=work-mode-chat]`
- `hover` selector=`[data-screen-root] figure svg[role=img]`
- `hold` key=`Alt`; seconds=1; wait=`[data-testid=context-pill] or selection-chip visible`
- `type` selector=`[data-testid=message-input]`; text=`why does this spike in week 3?`; then=`press Enter`
- `wait` cond=`[data-testid=answer] count increases`; timeout_s=15

## Beat 6: b6-this (1:20-1:34, 33 words, 141 wpm)

**Narration:** Inside the app, the same pointer works. I hold Option over the title and say: make this bigger. Jev works out what this means, shows me the target, and undo is one key.

**Caption:** Jev understands "this". Undo is one key.

**Sponsor:** Jev (TypeSafe)

**Steps:**
- `click` selector=`[data-testid=work-mode]`; note=`switch to Narrate; close right panel first`
- `hover` selector=`[data-screen-root] h1, [data-screen-root] [data-node-id]:first-child`
- `hold` key=`Alt`; wait=`[data-testid=pointer-action-card] shows target`
- `type` selector=`[data-testid=message-input]`; text=`make this bigger`; then=`press Enter`; wait=`title font-size increases (8s)`
- `press` key=`Meta+z`; wait=`font-size returns`

## Beat 7: b7-pixels (1:34-1:44, 21 words, 126 wpm)

**Narration:** Some charts are only pixels. Perceptron reads the image into a second app. Those values are approximate, and I say so.

**Caption:** Perceptron reads pixels. Values approximate.

**Sponsor:** Perceptron

**Steps:**
- `goto` url=`file:///Users/soorajsambasivam/Documents/projects/create-dev-int/apps/extension/demo/chart.html`; wait=`img or svg chart visible`
- `hover` selector=`img, svg`
- `hold` key=`Alt`; wait=`chip 'Chart' or 'Image'`
- `release+type` text=`turn this into something I can track`; then=`press Enter`; wait=`new tab app renders (timeout 30s; speed up 4x in edit)`

## Beat 8: b8-surfaces (1:44-1:50, 15 words, 150 wpm)

**Narration:** It also works from the notch tray in any Mac app, in Paper or Luminous.

**Caption:** Notch tray, Lift from screen. Paper / Luminous.

**Sponsor:** none

**Steps:**
- `goto` url=`http://localhost:5175/`; wait=`[data-testid=composer] visible`
- `click` selector=`[data-testid=look-switch]`; wait=`look changes to Luminous`
- `insert` asset=`notch-tray-clip.mp4`; note=`native screen recording; fall back to a still of the Lift button [data-testid=lift-button]`

## Beat 9: b9-end (1:50-2:00, 21 words, 126 wpm)

**Narration:** Everything read-only becomes yours. The pointer is free. A hosted backend is nine to nineteen dollars a month. No users yet.

**Caption:** Free pointer. Hosted backend $9-19/mo. No users yet.

**Sponsor:** SideShift

**Steps:**
- `card` text=`Create — pixels become software you own
DubHacks NEXT · Perceptron · SideShift · MongoDB Atlas
Inkling · Jev · Perceptron · ElevenLabs`; hold_s=10

## Cut order if over time or flaky
Beat 8, then beat 7 (give time to beat 5), then voice (typed pill; narration unchanged). Do not claim exact numbers from the image app. Beats 4 and 8 depend on external assets (phone or second tab, Atlas screenshot, notch clip) and degrade to a second tab and stills.
