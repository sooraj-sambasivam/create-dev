# Create Tray

Native macOS menu-bar agent (no Dock icon) that shows what you lift into Create as chips in the notch.
Swift Package, macOS 14+, SwiftUI, [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit) pinned to `1.1.0` (MIT).

## What it does
- Compact pill in the notch (tray icon + count). Hover it and it expands into chips such as `Table · Route 44 schedule`.
- Polls `GET http://localhost:3001/api/tray` every 1.5 s. Expected `{items:[{id,title,kind,url,createdAt}]}` (oldest first). A 404 means an empty tray; a dead server keeps the last chips and shows "Waiting for Create".
- New chips drop in with a spring and the tray peeks open for a moment.
- Click a chip to open its `url` in the default browser. "Send to Create" opens `http://localhost:5175`.
- Menu-bar icon: Open Create, Show Tray, Quit.
- Stretch: hold Option for 400 ms. Captures a 520x360 crop around the cursor (ScreenCaptureKit), POSTs it to `/api/extract` `{image, hint}` then `/api/lift` `{entity}`, and adds the result as a chip.

The notch surface is physically black, so the tray uses the DESIGN.md neutral ramp in its dark form with the single accent `#3E7BF0`, SF Pro at 12/14. On a Mac without a notch DynamicNotchKit falls back to a floating pill at the top center.

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
3. Grant Screen Recording once (System Settings, Privacy & Security) if you use the Option-hold capture, then quit and reopen the app. The tray itself needs no permissions.
4. Start the server (port 3001) and web app (5175).

## Not verified
Built successfully with the installed Xcode (Swift 6.4, macOS 27 SDK). Not launched in this lane, so on-screen rendering, hover behavior and the capture path still need a hands-on check on the demo Mac. `/api/tray` is added by another lane; `/api/extract` and `/api/lift` exist in `apps/server/src` (`{entity}` and `{id,url}` shapes assumed from the route comments).
