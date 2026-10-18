# Create: 5-slide outline

## 1. Problem
- The web is read-only. A schedule, a price list, a chart in a report: you can read it, but you can't add a row, chart it your way, or share a live copy.
- Today you copy it into a spreadsheet by hand, or give up.
- Who suffers: students, small teams and shop owners who need their own version of a table.
- Line: Pixels become software you own.

## 2. Demo
- Embed the 2:00 video (`storyboard.md`).
- Three frames: hold Option on a schedule table; the app with table, chart and Add row; a phone adds a row and it appears in the Backend tab.
- Callout: a QR code, a real row, a real MongoDB Atlas collection.

## 3. How it works (text diagram)
```
 Chrome extension: hold Option on a table, list, cards or chart image
              |
   typed entity {kind, title, columns, rows <= 500}
   (DOM read, or /api/extract: Perceptron, then Claude vision, then mock)
              |
        /api/lift  (Claude Haiku polishes title and summary only)
              |
   JSON component tree (Zod): table + chart + Add-row form, liveFormId
              |
   one React renderer -> live app -> QR / share link / HTML export
              |
   /api/forms/:appId  -> MongoDB Atlas (files without MONGODB_URI)
              |
   Backend tab polls every 3 s
```
- Inside the app: Narrate (hold Option, "make this bigger", Jev resolves "this", undo), Chat ("why does week 3 spike?"), Type, Speak, Sketch.
- One schema for AI output, user edits, lifted apps and saved shares.

## 4. Sponsor tech
- Perceptron: reads chart and image crops into a typed entity; reads sketches.
- MongoDB Atlas (MLH): every added row is a document; share links too. Local files without it.
- TypeSafe Jev: routes each spoken line to action and target; deictic words let the pointed element win.
- ElevenLabs Scribe: realtime voice, browser speech fallback.
- Claude (Sonnet 5.5 / Haiku 5.5): builds and edits apps, polishes lifted copy, answers Chat.
- Tracks: DubHacks NEXT, Perceptron, SideShift, MongoDB Atlas. Team: Sooraj Sambasivam, Abel Anand, pentaswan.
- Every sponsor is optional at runtime; mock mode runs the lift with no keys.

## 5. Startup and what's next
- Every portal, PDF and screenshot is read-only. Create is the free pointer.
- Business: a hosted backend at $9 to $19 a month, and a remix button on every shared app. No users or revenue yet.
- Next: more sources (PDFs, screenshots), accounts and hosting, pointing outside the browser.
- Rehearsed on sample pages today; do not claim "works on any site".
- Verify before submit: lift in a real Chrome profile, a physical-phone QR scan, real Perceptron and Claude keys.
- Close: Pixels become software you own.
