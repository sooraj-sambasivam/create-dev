# Demo script: Create (repo `create-dev`)

Target: a two-minute demo. Each flow gets about 15 seconds: type, voice, canvas sketch (live, element by
element), narrate (lasso and "make this bigger"), ✦ element edit, theme toggle, and a share link opened
on a phone. Narration is for non-coders and small businesses: say "page", "website", "your customers",
never "component" or "API".

**Length:** the team decision allows a demo of up to two minutes (B2), so this script is written for
2:00. The original brief asked for three minutes. **TODO: confirm the length limit on the DubHacks hacker
guide before recording.** If three minutes is allowed, use the spare time for a longer buffer, not
for extra features.

**Title track:** TODO confirm the track name on the DubHacks hacker guide before submitting.

## Before recording

Checklist:

- [ ] `pnpm install`, then `pnpm dev`. Open http://localhost:5173.
- [ ] `apps/server/.env` is the shared team `.env` (never committed). Keys stay on the server. Check
      `GET http://localhost:3001/api/health` shows the keys present.
- [ ] Each key has its $10 cap set in the provider console. If a key hits its cap, switch to `MOCK_AI=1`
      for the UI-only parts and say so in the video.
- [ ] `MONGODB_URI` is set for Atlas. If it is not set, share links use the local file store
      (`apps/server/.data/prototypes/`). Either works for the demo.
- [ ] `VITE_TLDRAW_LICENSE_KEY` is set when the key arrives. Until then the canvas runs on the trial.
- [ ] Browser window at a laptop width, light theme on, microphone permission granted in advance.
- [ ] Start from an empty app (new chat, no page on screen).
- [ ] Phone route for the share step is tested (see `docs/integration.md`, "Share links on a phone").
- [ ] Replay is primed: run the full script once in record mode (the default). Then keep the browser
      profile, since replay reads the recording from that browser.
- [ ] One full run of this script is recorded before judging (B6). Keep that video as the backup.

## Timeline

| Time | Flow | On-screen steps | What to say |
| --- | --- | --- | --- |
| 0:00-0:10 | Hook | Open on the empty app: the headline "What should we work on?" and the composer. | "Most website builders start with a blank page and a wall of menus. Create starts with how you think." |
| 0:10-0:25 | Type a prompt | Click the composer. Type: `A website for a neighborhood bakery: a hero photo, three menu items with prices, opening hours, and an order button.` Press the ↑ Go button. Wait for the page to appear in the working card. | "Type what you want. Claude builds a real page you can edit." |
| 0:25-0:40 | Voice | Open the radial fan from the composer and choose **Mic**. Say: `Make the headline bigger, and add a contact section with a phone number.` The words appear in the prompt box as you speak. Stop, then press Go. | "Or just say it. Live transcription fills the box, then the page updates." |
| 0:40-0:55 | Canvas sketch, live element by element | Open the radial fan and choose **Canvas**. Turn on the preview pane on the right if it is off. Draw a wide box at the top (header), two boxes side by side (menu cards), and a small box at the bottom (button). Press Generate. Watch the preview pane fill in. | "Or draw it. A rough sketch becomes the page, and you watch it build." |
| 0:55-1:10 | Narrate: lasso, then "make this bigger" | Open the radial fan and choose **Narrate**. Hold **Shift** and drag a lasso around the bakery photo. Within 4 seconds, hold **Option** and say: `Make this bigger.` Release. The target grows. | "Point and narrate. Lasso what you mean and say what to change." |
| 1:10-1:25 | ✦ element edit | Click one menu card. The ✦ box appears under it. Press `/`, type: `Make this card warm brown with rounded corners.` Press Enter. Only that card changes. Press ⌘Z to undo. | "Select one thing and say what to change. Only that part is rewritten. Undo if you want the old one back." |
| 1:25-1:35 | Theme toggle | Click the **Theme** control in the header. It cycles Light, Dark, System. Click until the shell is dark, hold on the last frame. | "Light or dark, your choice." |
| 1:35-1:50 | Share link on a phone | Switch back to Light if you want. On the laptop, click **Share** in the header at the top right of the working card. Copy the link. Open it on the phone. The page shows read-only. | "Share a read-only link. Anyone can open it on their phone, no account needed." |
| 1:50-2:00 | Close | Show the logo card with the four inputs: type, say, draw, narrate. | "Describe it, say it, draw it. Get a real website." |

Notes on timing:

- A Sonnet page takes about 14 to 20 seconds. Start the generation, then cut to the recorded clip of
  the same step when the live wait runs long. Keep the same prompt text so the cut is seamless.
- The sketch step is shown **live, element by element** only if the build streams the preview. If the
  preview pane fills in only after Generate finishes, show the finished preview and say "it builds the
  page". Do not claim a live stream that the build does not show. **Check this on the day.**
- Lasso and speech must be close together. The narrate step links the words to the lasso only within
  4 seconds (`LIVE_COMMAND_WINDOW_MS`). Lasso first, then speak.
- No flow runs longer than its slot. If a step runs late, cut to the recording and move on.

## Backup plan

Use the first option that works. Do not stop to debug on stage.

1. **Replay mode (Ctrl+Shift+R).** Answers the model and voice calls from the recorded run in this
   browser. A small dot titled "Replay on" shows while it is on. Turn it off again before the next live
   step. The share step is not covered by replay.
2. **Recorded video.** The full run of this script, recorded before judging. Play the clip for the
   step that failed, then return to the live app for the next step if it works.
3. **Mock mode (`MOCK_AI=1`).** The UI, editor, canvas, narrate and share flows all work without model
   calls, and return canned screens. Use it when a key is capped or the network is down. Say so in
   the video if it is shown.
4. **Share step fails.** Show the Publish menu, which downloads one self-contained HTML file, and open
   that file on the phone. Say "a single HTML file" instead of "a share link".

If the voice step fails, type the same sentence into the composer and say "typed here, spoken the
same way."

## Who presents

Everyone presents or records (decision T3). Who takes which flow is not yet assigned: **TODO**.
