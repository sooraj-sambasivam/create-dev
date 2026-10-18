# Create Tray

Native macOS menu-bar agent (no Dock icon) that shows what you lift into Create as chips in the notch.
Swift Package, macOS 14+, SwiftUI, [DynamicNotchKit](https://github.com/MrKai77/DynamicNotchKit) pinned to `1.1.0` (MIT).

## What it does
- Compact pill in the notch (tray icon + count). Hover it and it expands into chips such as `Table · Route 44 schedule`.
- Polls `GET http://localhost:3001/api/tray` every 1.5 s. Expected `{items:[{id,title,kind,url,createdAt}]}` (oldest first). A 404 means an empty tray; a dead server keeps the last chips and shows "Waiting for Create".
- Chip x button sends DELETE /api/tray/:id (optimistic). Motion: spring response 0.35 damping 0.8, honors Reduce Motion.
- New chips drop in with a spring and the tray peeks open for a moment.
- Click a chip to open its `url` in the default browser. "Send to Create" opens `http://localhost:5175`.
- Menu-bar icon: Open Create, Show Tray, Quit.
- Option-hold (400 ms): reads the AX element at the cursor (nearest table/list/group, children to depth 3; needs Accessibility), captures a ScreenCaptureKit crop (the AX frame if sane, else 520x360 around the cursor), POSTs `/api/locate {input:{source:"notch",image,cursor,ax,imageSize}}` and shows the label chip at once. Then `/api/extract` with the crop of the located box and `/api/lift` add the tray chip. An `ask` response shows "Which one?" with two buttons; every failure shows a visible error chip (a locate failure falls back to reading the whole crop). Stage timings go to os_signpost / `log stream --predicate 'subsystem == "dev.create.tray"'`; the chip tooltip carries the trace id. Cursor and AX frames are sent in crop-image pixels.

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
3. Grant Screen Recording and Accessibility once (System Settings, Privacy & Security) for the Option-hold capture, then quit and reopen the app. The tray itself needs no permissions.
4. Start the server (port 3001) and web app (5175).

## Not verified
Built successfully with the installed Xcode (Swift 6.4, macOS 27 SDK). Not launched in this lane, so on-screen rendering, hover behavior and the capture path still need a hands-on check on the demo Mac. `/api/tray` is added by another lane; `/api/extract` and `/api/lift` exist in `apps/server/src` (`{entity}` and `{id,url}` shapes assumed from the route comments).
