# AI pointer roadmap: beyond the Output page

North star: Google DeepMind's AI-enabled pointer (May 2026). Four principles: maintain the flow (no AI detours), show and tell (pointer captures what is under it), embrace "this" and "that" (pointer supplies the referent, speech supplies the action), and turn pixels into actionable entities. Google is shipping it as Magic Pointer in Gemini in Chrome (desktop) and is bringing it to Googlebook laptops. DeepMind's post gives no architecture, so everything below is our own design.

Sources: [DeepMind post](https://deepmind.google/blog/ai-pointer/), [Android Authority on Magic Pointer](https://www.androidauthority.com/magic-pointer-gemini-in-google-chrome-3666405/).

Shared core in all three options: a **referent** (what is under the pointer: an id, a label, a crop or DOM snippet) plus an **utterance** goes to the existing intent route. The frozen contract already carries `IntentRequest.pointer { targetId, label? }` and returns an action from `INTENT_ACTIONS`. Only the referent resolver differs per surface.

## 1. Everywhere inside the Create app (thread, canvas, library)

- **Architecture:** Generalize `usePagePointer` from the Output page into an app-level provider. Every pointable surface tags its elements with `data-pointer-id` and `data-pointer-label` (thread message, tldraw shape via its shape id, library card). The provider resolves `elementsFromPoint` to the nearest tagged ancestor. A per-surface adapter maps the verb to an action: thread (`regenerate`, `replace_text`), canvas (`resize`, `move`, `restyle`, `delete` through the tldraw editor API), library (`replace_media`, `add`). Reuse the PointerBubble echo ("understood: hero title") everywhere.
- **2-4 h tonight:** Provider plus tagging on thread and library, with the canvas mapped through tldraw shape ids (hit-test with `editor.getShapeAtPoint`). Reuse the existing mock edit as the fallback.
- **Post-hackathon:** Per-surface verb vocabularies, multi-select ("merge those"), undo stack for pointer edits, touch and phone (tap as pointer; long-press plus voice).
- **Risks:** Low. Mic permission only (already used). Conflicts with tldraw's own pointer handling, so use a passive window listener, not capture. Cost: no new attack surface.

## 2. Chrome extension: point at any live site, get a Create-editable copy

- **Architecture:** Manifest V3. A content script tracks the pointer and highlights the element under it (`document.elementFromPoint`, outline overlay in a Shadow DOM so site CSS cannot leak). On hotkey plus speech (Web Speech API, or push-to-talk through the Create tab), it captures: `outerHTML` of the element (trimmed), computed styles via `getComputedStyle`, bounding rect, and an element screenshot (`chrome.tabs.captureVisibleTab` cropped to the rect, needs `activeTab`). The extension posts this to the Create server (`/api/import-element`), which converts it to a canvas frame: a shape tree built from the DOM boxes, text, and images, then applies the spoken edit ("make this bigger") with the same intent route. The user lands in Create with an editable copy. A vision pass (Perceptron or Claude) can fill gaps where DOM is opaque (canvas, video, iframes).
- **2-4 h tonight:** Unpacked extension, hotkey, highlight, send `outerHTML` plus crop plus transcript to the server, and render the crop as an image shape with the edit result applied to a single text or image node. Sideloaded, one demo site, one element type. No Chrome Web Store.
- **Post-hackathon:** Faithful DOM-to-shape conversion (auto layout, fonts, background images), cross-origin iframes, shadow DOM, Web Store review (broad host permissions slow review), auth, and a write-back story (we edit a copy, not the live site).
- **Risks:** Highest privacy exposure. The page may contain logged-in or personal data, so capture only on explicit user gesture, use `activeTab` instead of `<all_urls>`, show what is sent, and never auto-capture. Copyright and trademark: copies of third-party sites are for the user's own prototyping. CSP does not block content scripts, but pages with strict CSP may block our injected styles. Chrome's own Gemini will overlap on the "ask about this" use, so our differentiator is the editable copy.

## 3. Electron desktop app with a system-wide pointer

- **Architecture:** Electron main process holds a global shortcut (`globalShortcut`) and a hotkey-held "pointing" mode. A transparent, click-through, always-on-top `BrowserWindow` (`setIgnoreMouseEvents(true, { forward: true })`, `alwaysOnTop: 'screen-saver'`) draws the highlight and echo. Pointer position comes from `screen.getCursorScreenPoint()` polling (about 60 Hz). To resolve the referent: (a) macOS Accessibility API (`AXUIElementCopyElementAtPosition` through a native Node addon or a small Swift helper) returns role, title, value, and frame of the element under the cursor in native apps; (b) fallback is a screenshot (`desktopCapturer` / `CGWindowListCreateImage`) cropped around the cursor and sent to a vision model. Speech through the renderer's mic. The result is either a Create canvas item (copy) or, much later, an action in the source app.
- **2-4 h tonight:** Electron shell loading the existing web app, global hotkey, `desktopCapturer` screenshot crop at the cursor, send crop plus transcript to the intent route, show the result in a Create window. No accessibility API, no write-back.
- **Post-hackathon:** AX element resolution, signed and notarized builds, auto-update, Windows (UIA) and Linux paths, acting in the source app (needs synthetic input and per-app support).
- **Risks:** Highest friction. macOS requires **Screen Recording** and **Accessibility** permissions (TCC prompts, and Electron dev builds often need re-granting after each rebuild). The system-wide view can capture passwords and private windows, so add per-app exclusions, an on-screen "capturing" indicator, and local-only buffers. Notarization takes time. Click-through overlays across multiple displays and spaces are fiddly. Not safe to promise live in a demo.

## Comparison

| | Scope | Wow for judges | Tonight (2-4 h) | Key risk |
|---|---|---|---|---|
| 1. In-app everywhere | Our surfaces | Medium, consistent | Yes, solid | Low |
| 2. Chrome extension | Any website | High ("point at Stripe, get an editable copy") | Yes, narrow slice | Privacy, demo-site fragility |
| 3. Electron system-wide | Any app | Highest, but least reliable | Screenshot-only slice | OS permissions, build time |

## Recommendation

1. **Do option 1 first.** It is the cheapest, it makes the hero demo robust, and every other option reuses its resolver and echo UI.
2. **Stretch for tonight: option 2, narrowed.** Sideloaded extension, one hotkey, highlight the element under the cursor, speak "make this bigger", and the element appears in Create as an edited copy. It is demo-able in the room on a pre-chosen page, needs no OS permissions, and best matches the DeepMind line "point at anything, no detours". Only attempt it if lane A's pointer bubble and intent defaults are green; otherwise skip it and present options 2 and 3 as the roadmap slide.
3. Present option 3 as the post-hackathon vision. Do not demo it live.

Demo guardrails for option 2: capture only on gesture, show the exact payload that will be sent, test on a page with no logged-in data, and keep a recorded fallback.
