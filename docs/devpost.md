# Create

**Tagline:** Describe it, say it, draw it. Get a real, editable website.

Repository: `create-dev`. The product is called **Create** in the UI.

**Track:** TODO confirm the track on the DubHacks hacker guide before submitting.

## Inspiration

Small businesses and non-coders need a website, but building one still starts with a blank page and
a tool with a hundred menus. We wanted the input to be whatever you already think in: a sentence, a
spoken line, a rough sketch, or pointing at an existing screen and talking through what should
change. Every one of those should turn into the same thing, a real page you can keep editing.

## Who it is for

Non-coders and small businesses: a shop owner who needs a page for opening hours and a menu, not a
developer who needs a framework.

## What it does

Create is a website builder with four ways in. Type in the composer, or open the radial fan to pick
Mic, Canvas or Narrate:

- **Type:** describe the page in a prompt. Claude builds it.
- **Say (Mic):** speak to it. Live ElevenLabs transcription fills the same prompt box.
- **Draw (Canvas):** sketch layout on a tldraw canvas. The drawing and its shapes become a page, or
  refine the page you already have. A side preview pane on the right shows the live output and can
  be toggled off.
- **Point and narrate (Narrate):** click through a page, lasso what you mean (hold Shift and drag),
  and talk (hold Option to talk, or Option to lock the mic on). The session becomes a clickable
  demo page.

Every mode produces the same JSON component tree. One React renderer shows it as a live page, and
the editor lets you click to select, drag to move, double-click to type, and ask AI to change one
element with the ✦ box. The app has a light and a dark theme, switched from the header. When it's
done you can publish the page as a single HTML file or share a read-only link that opens on a phone.

## How we built it

- **Models:** Claude Sonnet 5.5 generates whole pages. Claude Haiku 5.5 handles the fast calls:
  single-element edits and intent routing. The model returns the tree through a tool call, and the
  server checks it before it reaches the browser.
- **Voice:** ElevenLabs Scribe. Realtime transcription in the browser through a single-use token
  minted on the server, with batch transcription as the fallback.
- **Canvas:** tldraw for drawing. Shapes are reduced to a small summary, with a PNG of the
  selection, before going to the model.
- **Page format:** a JSON component tree defined with Zod schemas in a shared package. The same
  schemas validate AI output, user edits, and saved shares.
- **Photos and icons:** Openverse for stock photos, scored against each photo's title and tags, and
  Iconify for icons. The server corrects guessed icon names before the page is returned.
- **Storage:** MongoDB Atlas for share links (set `MONGODB_URI`). If no connection string is set,
  share links are saved to local files instead, so the app runs without a database.
- **App:** Vite, React 19, Tailwind 4, zustand, and motion on the web. Express on the server. It
  runs on localhost: the server on port 3001, the web app on port 5173.

## Challenges

- **Trust in AI output.** The model sometimes invents a photo, a link, or an icon name. The server
  checks every photo search, retries with simpler wording, and tells the user when nothing matched.
  Icon names are corrected before they reach the page.
- **One format for four inputs.** Sketches, speech, and narration all have to land on the same
  tree. We kept the schema as the single source of truth and let each mode call the same store
  actions.
- **Keeping edits local.** Changing one element should not regenerate the whole page. Single-element
  edits go through their own endpoint and keep the user's manual styles.
- **Voice in the browser.** Live transcription needs a short-lived token, microphone handling, and
  a fallback when the realtime service is unavailable.
- **Live demo risk.** Model calls take seconds, and a live run can fail on the day. The team shares
  one `.env` on the presenting machine. It is never committed, and every key stays on the server.
  Each key has a $10 cap. We record a full run before judging, and if the live run fails we switch
  to replay mode (Ctrl+Shift+R), which answers the same endpoints from that recording.

## Accomplishments

- Four input modes that all produce the same editable page.
- A working demo with no API keys: mock mode runs every feature end to end.
- Published pages are self-contained HTML files, with photos, uploads, styles and fonts included.
- Share links that open read-only in any browser, including on a phone.
- A light and a dark theme that cover the shell, the editor, the canvas and the preview.

## What's next

- Multi-page sites, with navigation between pages.
- Collaborative editing on the same page.
- Deeper backend output from the output pane, beyond the current map view.
- Better voice commands for editing: the intent router already classifies spoken lines as commands,
  and we want that to cover more actions.
- A tldraw SDK license key for production. The canvas runs on the 100-day trial key until then.

## Built with

Claude (Sonnet 5.5, Haiku 5.5) · ElevenLabs Scribe (realtime and batch) · tldraw · React 19 · Vite ·
Tailwind CSS 4 · zustand · motion · Zod · Express · MongoDB Atlas · Openverse · Iconify · TypeScript ·
pnpm

## Demo

The demo video follows `docs/demo-script.md`: a two-minute script where each flow gets about 15
seconds (type, voice, canvas, narrate, element edit, theme toggle, and the share link on a phone),
with a backup plan for any live step that fails.
