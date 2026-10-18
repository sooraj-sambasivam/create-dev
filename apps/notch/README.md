# Create Tray

Native macOS menu-bar agent (no Dock icon) that shows what you lift into Create as chips in the notch.
Swift Package, macOS 14+, SwiftUI, [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit) pinned to `1.1.0` (MIT).

## What it does
- Compact pill in the notch (tray icon + count). Hover it and it expands into a horizontal row of cards, newest first: thumbnail over a one-line title. The row scrolls left to right (a mouse wheel scrolls it sideways). Hovering a card opens a larger preview (thumbnail, title, source). Click opens it in Create (a lifted app by its link; a snippet through `POST /api/tray/:id/open`, which converts the saved markup to a page like `/api/import-element`). Drag a card out to other apps: it carries the thumbnail image plus the HTML (and plain text); lifted apps carry their link. The corner x deletes.
- Polls `GET http://localhost:3001/api/tray` every 1.5 s. Expected `{items:[{id,title,kind,createdAt,url?,thumbnailUrl?,hasSnippet?,source?}]}` (oldest first). Thumbnails (`GET /api/tray/:id/thumbnail`, JPEG) and markup (`GET /api/tray/:id/snippet`) are fetched once per card and cached, so the poll stays light. A 404 means an empty tray; a dead server keeps the last chips and shows "Waiting for Create".
- Chip x button sends DELETE /api/tray/:id (optimistic). Motion: spring response 0.35 damping 0.8, honors Reduce Motion.
- New chips drop in with a spring and the tray peeks open for a moment.
- Click a chip to open its `url` in the default browser. "Send to Create" opens `http://localhost:5175`.
- Menu-bar icon: Open Create, Show Tray, Quit.
- Pointer and Option are event driven (no 60 Hz poll): a global `mouseMoved`/drag monitor (stamped with `event.timestamp`, mapped onto the mach clock) feeds a 15 s pointer ring and the notch hover zone; a `flagsChanged` monitor tracks Option (without Accessibility, which global key monitors need, a 10 Hz flag check stands in). `SyncTimeline.swift` holds the clock bridge, the ring and the word-time lookup (the slowest pointer moment within 120 ms of a word, so a dwell beats a swipe); `swift test` covers it.
- Option-hold (400 ms): reads the AX element at the cursor (nearest table/list/group, children to depth 3; needs Accessibility), captures a ScreenCaptureKit crop (the AX frame if sane, else 520x360 around the cursor), POSTs `/api/locate {input:{source:"notch",image,cursor,ax,imageSize}}` and shows the label chip at once. Then `/api/extract` with the crop of the located box and `/api/lift` add the tray chip. An `ask` response shows "Which one?" with two buttons; every failure shows a visible error chip (a locate failure falls back to reading the whole crop). Stage timings go to os_signpost / `log stream --predicate 'subsystem == "dev.create.tray"'`; the chip tooltip carries the trace id. Cursor and AX frames are sent in crop-image pixels.

The notch surface is physically black, so on a notched display the tray uses the DESIGN.md neutral ramp in its dark form (on a display without a notch the tokens follow the system light or dark appearance) with the single accent `#3E7BF0`, SF Pro at 12/14. On a Mac without a notch DynamicNotchKit falls back to a floating pill at the top center.

## Speech (off by default)
`defaults write dev.create.tray speech -bool YES`, then relaunch. Hold Option, point and talk, release: the capture happens on release at the pointer position of the first "this / that / here", and the line becomes the lift instruction. `VoiceLine.swift` streams the mic (AVAudioEngine tap, 16 kHz) to Scribe realtime with a single-use token from `GET /api/voice-token`; the first buffer's `hostTime` (mach clock) less the input device latency is the audio start, so Scribe's word offsets are directly comparable with pointer timestamps. Needs the microphone permission (`NSMicrophoneUsageDescription` is in Info.plist). Without the flag the 400 ms Option-hold is unchanged.

## Build
```
cd apps/notch
swift build -c release          # binary: apps/notch/.build/release/CreateTray
./scripts/make-app.sh           # optional: apps/notch/.build/Create Tray.app (ad-hoc signed)
```
Use the `.app` for the demo: permissions attach to its bundle id (`dev.create.tray`).

## Run (demo day)
1. Build once, well before the demo. Do not rebuild afterward; a rebuild changes the binary and macOS can drop the grants.
2. Open `Create Tray.app` from Finder (or `open` it). Do not launch it from Terminal or Xcode, or the grants go to that host app.
3. Grant Screen Recording and Accessibility once (System Settings, Privacy & Security) for the Option-hold capture, then quit and reopen the app. The tray itself needs no permissions.
4. Start the server (port 3001) and web app (5175).

## Not verified
The event monitors, the speech path and the new hover/close timing were compiled and the timeline unit tests pass (`swift test`), but they were not launched here (Accessibility, Screen Recording and microphone grants are per machine), so they need a hands-on check on the demo Mac.
Earlier note: built successfully with the installed Xcode (Swift 6.4, macOS 27 SDK). Not launched in this lane, so on-screen rendering, hover behavior and the capture path still need a hands-on check on the demo Mac. `/api/tray` is added by another lane; `/api/extract` and `/api/lift` exist in `apps/server/src` (`{entity}` and `{id,url}` shapes assumed from the route comments).
